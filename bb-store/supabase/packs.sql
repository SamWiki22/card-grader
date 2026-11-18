-- Bearded Bear Packs — virtual pack system schema.
-- Run once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run. Safe to re-run.
--
-- Security model: every table here has row level security ON with NO policies,
-- so the public anon key can't read or write any of it. Only the store's server
-- (using SUPABASE_SERVICE_ROLE_KEY) touches these tables, and every money
-- movement goes through one of the locked functions at the bottom.

-- ── Tables ────────────────────────────────────────────────────────────────

create table if not exists pack_tiers (
  id text primary key,                 -- e.g. 'pokemon-grizzly'
  game text not null,                  -- matches the store's game ids (pokemon, onepiece, ...)
  name text not null,                  -- e.g. 'Grizzly'
  price_cents bigint not null check (price_cents > 0),
  color text not null default '#4fc3b6',
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists pack_cards (
  id text primary key,
  tier_id text not null references pack_tiers(id),
  name text not null,
  set_name text not null default '',
  grade text not null default '',      -- e.g. 'PSA 9', 'Raw NM'
  market_value_cents bigint not null check (market_value_cents >= 0),
  weight numeric not null default 1 check (weight > 0),  -- relative chance inside its pool
  image text,                          -- data URL or https URL
  -- available: in a pack pool · held: in a user's vault · ship_requested · shipped · retired
  status text not null default 'available',
  owner_id uuid references auth.users(id),
  held_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pack_cards_pool on pack_cards (tier_id, status);
create index if not exists pack_cards_owner on pack_cards (owner_id, status);

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  balance_cents bigint not null default 0 check (balance_cents >= 0),
  age_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Every change to a balance writes a ledger row; a deposit's ref is the Stripe
-- session id, and the unique index makes a replayed webhook a no-op.
create table if not exists ledger (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                  -- deposit | pack_open | buyback | shipping | adjustment
  amount_cents bigint not null,        -- + credit / - debit
  note text not null default '',
  ref text,
  created_at timestamptz not null default now()
);
create index if not exists ledger_user on ledger (user_id, created_at desc);
create unique index if not exists ledger_deposit_ref on ledger (ref) where kind = 'deposit';

create table if not exists pulls (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tier_id text not null,
  card_id text not null,
  price_cents bigint not null,
  card_value_cents bigint not null,
  roll double precision not null,      -- the random number that picked the card, kept for audits
  created_at timestamptz not null default now()
);
create index if not exists pulls_user on pulls (user_id, created_at desc);

create table if not exists shipments (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  card_ids text[] not null,
  address jsonb not null,
  fee_cents bigint not null default 0,
  status text not null default 'requested',   -- requested | shipped
  tracking text not null default '',
  created_at timestamptz not null default now(),
  shipped_at timestamptz
);

alter table pack_tiers enable row level security;
alter table pack_cards enable row level security;
alter table profiles enable row level security;
alter table ledger enable row level security;
alter table pulls enable row level security;
alter table shipments enable row level security;

-- ── Money functions (each runs as one transaction) ────────────────────────

-- Open a pack: check balance, pick a card from the tier's live pool using the
-- server-generated roll in [0,1), move it to the user's vault, debit the price.
create or replace function open_pack(p_user uuid, p_tier text, p_roll double precision)
returns jsonb language plpgsql as $$
declare
  t pack_tiers;
  bal bigint;
  total numeric;
  acc numeric := 0;
  target numeric;
  c record;
  picked_id text;
  picked pack_cards;
  pull_id bigint;
begin
  if p_roll < 0 or p_roll >= 1 then raise exception 'BAD_ROLL'; end if;
  -- One opening per pack at a time: everyone opening this pack queues on the
  -- tier row. (Locking the pool's cards one by one let two openings lock them
  -- in different orders and deadlock.) NO KEY UPDATE still lets cards be added
  -- to the pool meanwhile.
  select * into t from pack_tiers where id = p_tier and active for no key update;
  if not found then raise exception 'TIER_UNAVAILABLE'; end if;

  select balance_cents into bal from profiles where user_id = p_user for update;
  if bal is null then raise exception 'NO_PROFILE'; end if;
  if bal < t.price_cents then raise exception 'INSUFFICIENT_FUNDS'; end if;

  -- Lock the pool's cards (in a fixed order) so an admin edit, removal or move
  -- can't change a card between the draw and the update below.
  perform 1 from pack_cards where tier_id = p_tier and status = 'available' order by id for update;
  select coalesce(sum(weight), 0) into total from pack_cards where tier_id = p_tier and status = 'available';
  if total <= 0 then raise exception 'POOL_EMPTY'; end if;

  target := p_roll::numeric * total;
  for c in select id, weight from pack_cards where tier_id = p_tier and status = 'available' order by id loop
    acc := acc + c.weight;
    picked_id := c.id;
    exit when target < acc;
  end loop;

  update pack_cards set status = 'held', owner_id = p_user, held_at = now(), updated_at = now()
    where id = picked_id and tier_id = p_tier and status = 'available' returning * into picked;
  -- Never hand out a card that left the pool; the whole opening rolls back (no charge).
  if picked.id is null then raise exception 'POOL_CHANGED'; end if;
  update profiles set balance_cents = balance_cents - t.price_cents where user_id = p_user;
  insert into ledger (user_id, kind, amount_cents, note, ref)
    values (p_user, 'pack_open', -t.price_cents, t.name || ' pack', picked.id);
  insert into pulls (user_id, tier_id, card_id, price_cents, card_value_cents, roll)
    values (p_user, p_tier, picked.id, t.price_cents, picked.market_value_cents, p_roll)
    returning id into pull_id;

  return jsonb_build_object(
    'pull_id', pull_id,
    'balance_cents', bal - t.price_cents,
    'card', jsonb_build_object('id', picked.id, 'name', picked.name, 'set_name', picked.set_name,
      'grade', picked.grade, 'market_value_cents', picked.market_value_cents, 'tier_id', picked.tier_id)
  );
end $$;

-- Sell a vaulted card back for p_percent of its current market value (store
-- credit). The card goes straight back into its pack pool.
create or replace function sell_back(p_user uuid, p_card text, p_percent integer)
returns jsonb language plpgsql as $$
declare
  card pack_cards;
  amount bigint;
  bal bigint;
begin
  if p_percent < 0 or p_percent > 100 then raise exception 'BAD_PERCENT'; end if;
  select * into card from pack_cards where id = p_card and owner_id = p_user and status = 'held' for update;
  if not found then raise exception 'NOT_YOURS'; end if;
  amount := floor(card.market_value_cents * p_percent / 100.0);
  update pack_cards set status = 'available', owner_id = null, held_at = null, updated_at = now() where id = p_card;
  update profiles set balance_cents = balance_cents + amount where user_id = p_user returning balance_cents into bal;
  insert into ledger (user_id, kind, amount_cents, note, ref)
    values (p_user, 'buyback', amount, 'Sold back: ' || card.name, card.id);
  return jsonb_build_object('amount_cents', amount, 'balance_cents', bal);
end $$;

-- Credit a paid Stripe top-up exactly once.
create or replace function credit_deposit(p_user uuid, p_amount bigint, p_ref text)
returns boolean language plpgsql as $$
declare inserted integer;
begin
  if p_amount <= 0 then raise exception 'BAD_AMOUNT'; end if;
  insert into profiles (user_id) values (p_user) on conflict do nothing;
  insert into ledger (user_id, kind, amount_cents, note, ref)
    values (p_user, 'deposit', p_amount, 'Added funds', p_ref)
    on conflict (ref) where kind = 'deposit' do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return false; end if;
  update profiles set balance_cents = balance_cents + p_amount where user_id = p_user;
  return true;
end $$;

-- Ask for vaulted cards to be shipped; charges the flat shipping fee.
create or replace function request_shipment(p_user uuid, p_cards text[], p_address jsonb, p_fee bigint)
returns bigint language plpgsql as $$
declare
  n integer;
  bal bigint;
  ship_id bigint;
begin
  if coalesce(array_length(p_cards, 1), 0) = 0 then raise exception 'NO_CARDS'; end if;
  select count(*) into n from (
    select 1 from pack_cards where id = any(p_cards) and owner_id = p_user and status = 'held' for update
  ) s;
  if n <> array_length(p_cards, 1) then raise exception 'NOT_YOURS'; end if;
  select balance_cents into bal from profiles where user_id = p_user for update;
  if p_fee > 0 and coalesce(bal, 0) < p_fee then raise exception 'INSUFFICIENT_FUNDS'; end if;

  insert into shipments (user_id, card_ids, address, fee_cents) values (p_user, p_cards, p_address, p_fee)
    returning id into ship_id;
  update pack_cards set status = 'ship_requested', updated_at = now() where id = any(p_cards);
  if p_fee > 0 then
    update profiles set balance_cents = balance_cents - p_fee where user_id = p_user;
    insert into ledger (user_id, kind, amount_cents, note, ref)
      values (p_user, 'shipping', -p_fee, 'Shipping', ship_id::text);
  end if;
  return ship_id;
end $$;

-- Only the store server (service role) may call these.
revoke all on function open_pack(uuid, text, double precision) from public, anon, authenticated;
revoke all on function sell_back(uuid, text, integer) from public, anon, authenticated;
revoke all on function credit_deposit(uuid, bigint, text) from public, anon, authenticated;
revoke all on function request_shipment(uuid, text[], jsonb, bigint) from public, anon, authenticated;
grant execute on function open_pack(uuid, text, double precision) to service_role;
grant execute on function sell_back(uuid, text, integer) to service_role;
grant execute on function credit_deposit(uuid, bigint, text) to service_role;
grant execute on function request_shipment(uuid, text[], jsonb, bigint) to service_role;

-- ── Starter tiers (edit prices/names any time in /admin/packs) ────────────
insert into pack_tiers (id, game, name, price_cents, color, sort) values
  ('pokemon-cub',      'pokemon',  'Cub',     500,   '#b07a4a', 1),
  ('pokemon-grizzly',  'pokemon',  'Grizzly', 1000,  '#9aa3b8', 2),
  ('pokemon-kodiak',   'pokemon',  'Kodiak',  2500,  '#e0b04a', 3),
  ('pokemon-polar',    'pokemon',  'Polar',   5000,  '#4fc3b6', 4),
  ('pokemon-alpha',    'pokemon',  'Alpha',   10000, '#c0457a', 5),
  ('onepiece-cub',     'onepiece', 'Cub',     500,   '#b07a4a', 1),
  ('onepiece-grizzly', 'onepiece', 'Grizzly', 1000,  '#9aa3b8', 2),
  ('onepiece-kodiak',  'onepiece', 'Kodiak',  2500,  '#e0b04a', 3),
  ('onepiece-polar',   'onepiece', 'Polar',   5000,  '#4fc3b6', 4),
  ('onepiece-alpha',   'onepiece', 'Alpha',   10000, '#c0457a', 5)
on conflict (id) do nothing;

-- ── v2: value-based buyback + TCGplayer price links ──────────────────────

-- Buyback schedule: a card worth at least min_value_cents sells back for
-- `percent` of market value (the highest matching row wins). Edit in /admin/packs.
create table if not exists buyback_rules (
  min_value_cents bigint primary key check (min_value_cents >= 0),
  percent integer not null check (percent between 0 and 100)
);
alter table buyback_rules enable row level security;
insert into buyback_rules (min_value_cents, percent) values
  (0, 75), (2000, 85), (10000, 90), (50000, 95)
on conflict (min_value_cents) do nothing;

-- Per-card overrides and TCGplayer links (pack cards).
alter table pack_cards add column if not exists buyback_percent integer check (buyback_percent between 0 and 100);
alter table pack_cards add column if not exists tcg_category_id integer;
alter table pack_cards add column if not exists tcg_group_id integer;
alter table pack_cards add column if not exists tcg_product_id integer;
alter table pack_cards add column if not exists tcg_subtype text;
alter table pack_cards add column if not exists price_source text not null default 'manual';  -- manual | tcgplayer
alter table pack_cards add column if not exists price_updated_at timestamptz;

-- Same links on the store's inventory items (BB Inventory ignores these columns).
alter table if exists items add column if not exists tcg_category_id integer;
alter table if exists items add column if not exists tcg_group_id integer;
alter table if exists items add column if not exists tcg_product_id integer;
alter table if exists items add column if not exists tcg_subtype text;
alter table if exists items add column if not exists price_source text not null default 'manual';
alter table if exists items add column if not exists price_updated_at timestamptz;

create or replace function buyback_percent_for(p_value bigint, p_override integer)
returns integer language sql stable as $$
  select coalesce(p_override,
    (select percent from buyback_rules where min_value_cents <= p_value order by min_value_cents desc limit 1),
    75);
$$;

-- Replace all buyback rules at once (from the admin page).
create or replace function set_buyback_rules(p_rules jsonb)
returns void language plpgsql as $$
begin
  if not exists (select 1 from jsonb_array_elements(p_rules) r where (r->>'min_value_cents')::bigint = 0) then
    raise exception 'NEED_ZERO_RULE';
  end if;
  delete from buyback_rules where true;
  insert into buyback_rules (min_value_cents, percent)
    select (r->>'min_value_cents')::bigint, (r->>'percent')::integer from jsonb_array_elements(p_rules) r;
end $$;

-- Sell-back now works out the percentage itself from the card's value.
drop function if exists sell_back(uuid, text, integer);
create or replace function sell_back(p_user uuid, p_card text)
returns jsonb language plpgsql as $$
declare
  card pack_cards;
  pct integer;
  amount bigint;
  bal bigint;
begin
  select * into card from pack_cards where id = p_card and owner_id = p_user and status = 'held' for update;
  if not found then raise exception 'NOT_YOURS'; end if;
  pct := buyback_percent_for(card.market_value_cents, card.buyback_percent);
  amount := floor(card.market_value_cents * pct / 100.0);
  update pack_cards set status = 'available', owner_id = null, held_at = null, updated_at = now() where id = p_card;
  update profiles set balance_cents = balance_cents + amount where user_id = p_user returning balance_cents into bal;
  insert into ledger (user_id, kind, amount_cents, note, ref)
    values (p_user, 'buyback', amount, 'Sold back (' || pct || '%): ' || card.name, card.id);
  return jsonb_build_object('amount_cents', amount, 'percent', pct, 'balance_cents', bal);
end $$;

revoke all on function sell_back(uuid, text) from public, anon, authenticated;
revoke all on function set_buyback_rules(jsonb) from public, anon, authenticated;
grant execute on function sell_back(uuid, text) to service_role;
grant execute on function set_buyback_rules(jsonb) to service_role;

-- ── v3: last-sold comps as backup prices + Magic / Dragon Ball tiers ─────

-- Last recorded sale (eBay, Goldin, Card Ladder…). Used as the card's value when
-- price_source = 'comp', and as the fallback when TCGplayer has no price.
alter table pack_cards add column if not exists comp_cents bigint check (comp_cents >= 0);
alter table pack_cards add column if not exists comp_source text;
alter table pack_cards add column if not exists comp_date date;
alter table pack_cards add column if not exists comp_url text;
alter table if exists items add column if not exists comp_cents bigint;
alter table if exists items add column if not exists comp_source text;
alter table if exists items add column if not exists comp_date date;
alter table if exists items add column if not exists comp_url text;

insert into pack_tiers (id, game, name, price_cents, color, sort) values
  ('mtg-cub',      'mtg', 'Cub',     500,   '#b07a4a', 1),
  ('mtg-grizzly',  'mtg', 'Grizzly', 1000,  '#9aa3b8', 2),
  ('mtg-kodiak',   'mtg', 'Kodiak',  2500,  '#e0b04a', 3),
  ('mtg-polar',    'mtg', 'Polar',   5000,  '#4fc3b6', 4),
  ('mtg-alpha',    'mtg', 'Alpha',   10000, '#c0457a', 5),
  ('dbs-cub',      'dbs', 'Cub',     500,   '#b07a4a', 1),
  ('dbs-grizzly',  'dbs', 'Grizzly', 1000,  '#9aa3b8', 2),
  ('dbs-kodiak',   'dbs', 'Kodiak',  2500,  '#e0b04a', 3),
  ('dbs-polar',    'dbs', 'Polar',   5000,  '#4fc3b6', 4),
  ('dbs-alpha',    'dbs', 'Alpha',   10000, '#c0457a', 5)
on conflict (id) do nothing;

-- ── v4: players sell their own cards into the pack pools ─────────────────
-- Flow: submitted → (we) offered → (player) accepted / declined → (we) paid,
-- or rejected. Paying credits the player's balance and adds the card to a pool.
create table if not exists submissions (
  id text primary key,                         -- short code players write on the package, e.g. BB-7K3QX
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  name text not null,
  set_name text not null default '',
  card_number text not null default '',
  grade text not null default '',
  asking_cents bigint check (asking_cents >= 0),
  note text not null default '',
  photo_front text not null,
  photo_back text,
  tcg_category_id integer,
  tcg_group_id integer,
  tcg_product_id integer,
  tcg_subtype text,
  market_cents bigint,                         -- TCGplayer market at submit time, if linked
  value_cents bigint,                          -- our valuation once the card joins a pool
  offer_cents bigint,
  admin_note text not null default '',
  status text not null default 'submitted',    -- submitted | offered | accepted | declined | rejected | paid
  card_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists submissions_user on submissions (user_id, created_at desc);
create index if not exists submissions_status on submissions (status, created_at);
alter table submissions enable row level security;

-- Card arrived and checks out: pay the player and put the card in a pool.
create or replace function pay_submission(p_id text, p_tier text, p_value bigint, p_card_id text)
returns jsonb language plpgsql as $$
declare
  s submissions;
  bal bigint;
begin
  select * into s from submissions where id = p_id and status = 'accepted' for update;
  if not found then raise exception 'NOT_ACCEPTED'; end if;
  if not exists (select 1 from pack_tiers where id = p_tier) then raise exception 'TIER_UNAVAILABLE'; end if;
  if p_value < 0 then raise exception 'BAD_AMOUNT'; end if;

  insert into pack_cards (id, tier_id, name, set_name, grade, market_value_cents, image,
                          tcg_category_id, tcg_group_id, tcg_product_id, tcg_subtype)
  values (p_card_id, p_tier, s.name || case when s.card_number <> '' then ' ' || s.card_number else '' end,
          s.set_name, s.grade, p_value, s.photo_front,
          s.tcg_category_id, s.tcg_group_id, s.tcg_product_id, s.tcg_subtype);

  insert into profiles (user_id) values (s.user_id) on conflict do nothing;
  update profiles set balance_cents = balance_cents + s.offer_cents where user_id = s.user_id returning balance_cents into bal;
  insert into ledger (user_id, kind, amount_cents, note, ref)
    values (s.user_id, 'card_sale', s.offer_cents, 'Sold to Bearded Bear: ' || s.name, s.id);
  update submissions set status = 'paid', value_cents = p_value, card_id = p_card_id, updated_at = now() where id = p_id;
  return jsonb_build_object('balance_cents', bal, 'card_id', p_card_id);
end $$;

revoke all on function pay_submission(text, text, bigint, text) from public, anon, authenticated;
grant execute on function pay_submission(text, text, bigint, text) to service_role;

-- ── v5: customer offers on store singles and sealed ──────────────────────
-- id is the private token in the customer's offer link.
create table if not exists offers (
  id text primary key,
  item_id text not null,
  item_name text not null default '',
  list_price numeric not null default 0,
  name text not null,
  email text not null,
  phone text not null default '',
  quantity integer not null default 1 check (quantity > 0),
  amount_cents bigint not null check (amount_cents > 0),     -- per item
  counter_cents bigint,                                       -- our counter, per item
  message text not null default '',
  admin_note text not null default '',
  status text not null default 'pending',  -- pending | accepted | countered | declined | expired | purchased
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists offers_status on offers (status, created_at desc);
alter table offers enable row level security;

-- ── v6: owner + cost on pack pool cards (partner split, imports) ─────────
alter table pack_cards add column if not exists owner text not null default '';
alter table pack_cards add column if not exists cost_cents bigint not null default 0;
