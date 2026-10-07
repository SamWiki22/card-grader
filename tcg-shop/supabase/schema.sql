-- TCG Shop — Supabase schema
-- Run once in your Supabase project: Dashboard -> SQL Editor -> New query -> paste -> Run. Safe to re-run.
--
-- Access model (this is a public storefront, so unlike bb-inventory it is NOT open-write):
--   * Anyone can read in-catalog singles and published decks.
--   * Only users listed in `admins` can create/edit inventory and decks (log in at /admin).
--   * Orders are written only by the server (service role key) and read by admins.
--
-- After creating your admin login in Dashboard -> Authentication -> Users, grant it admin:
--   insert into admins (user_id) select id from auth.users where email = 'you@example.com';

create extension if not exists pgcrypto;

create table if not exists admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- Singles inventory.
create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  game text not null,
  name text not null,
  set_code text not null default '',
  number text not null default '',
  rarity text not null default '',
  condition text not null default 'NM',
  finish text not null default '',
  price numeric(10,2) not null default 0 check (price >= 0),
  quantity integer not null default 0 check (quantity >= 0),
  image_url text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cards_game_name_idx on cards (game, lower(name));

-- Pre-made decks. `quantity` = assembled copies on the shelf ready to ship.
-- `price` null => priced from its singles minus `discount_pct`.
create table if not exists decks (
  id uuid primary key default gen_random_uuid(),
  game text not null,
  name text not null,
  format text not null default '',
  archetype text not null default '',
  description text not null default '',
  price numeric(10,2) check (price is null or price >= 0),
  discount_pct numeric(5,2) not null default 10 check (discount_pct >= 0 and discount_pct < 100),
  quantity integer not null default 0 check (quantity >= 0),
  published boolean not null default false,
  -- Where the list came from (tournament result / netdeck source), shown as attribution on the store.
  source_name text not null default '',
  source_url text not null default '',
  source_event text not null default '',
  source_player text not null default '',
  source_placing text not null default '',
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists deck_cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references decks on delete cascade,
  section text not null default 'main',
  count integer not null check (count > 0),
  name text not null,
  set_code text not null default '',
  number text not null default '',
  -- Linked singles-inventory row (null = not matched / not stocked yet).
  card_id uuid references cards on delete set null,
  sort integer not null default 0
);
create index if not exists deck_cards_deck_idx on deck_cards (deck_id);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null default '',
  note text not null default '',
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'paid_short', 'shipped', 'cancelled')),
  total numeric(10,2) not null default 0,
  stripe_session_id text,
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders on delete cascade,
  kind text not null check (kind in ('card', 'deck')),
  ref_id uuid not null,
  name text not null,
  unit_price numeric(10,2) not null,
  quantity integer not null check (quantity > 0)
);

-- Row level security ---------------------------------------------------------
alter table admins enable row level security;
alter table cards enable row level security;
alter table decks enable row level security;
alter table deck_cards enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

drop policy if exists "admins read self" on admins;
create policy "admins read self" on admins for select using (user_id = auth.uid());

drop policy if exists "public read cards" on cards;
create policy "public read cards" on cards for select using (true);
drop policy if exists "admin write cards" on cards;
create policy "admin write cards" on cards for all using (is_admin()) with check (is_admin());

drop policy if exists "public read decks" on decks;
create policy "public read decks" on decks for select using (published or is_admin());
drop policy if exists "admin write decks" on decks;
create policy "admin write decks" on decks for all using (is_admin()) with check (is_admin());

drop policy if exists "public read deck_cards" on deck_cards;
create policy "public read deck_cards" on deck_cards for select
  using (exists (select 1 from decks d where d.id = deck_id and (d.published or is_admin())));
drop policy if exists "admin write deck_cards" on deck_cards;
create policy "admin write deck_cards" on deck_cards for all using (is_admin()) with check (is_admin());

drop policy if exists "admin orders" on orders;
create policy "admin orders" on orders for all using (is_admin()) with check (is_admin());
drop policy if exists "admin order_items" on order_items;
create policy "admin order_items" on order_items for all using (is_admin()) with check (is_admin());

-- Functions ------------------------------------------------------------------

-- Assemble `p_copies` copies of a deck from singles: pulls every linked card out of
-- singles inventory and adds the copies to the deck's shelf quantity. All-or-nothing.
create or replace function build_deck(p_deck uuid, p_copies integer) returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  new_qty integer;
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  if p_copies is null or p_copies < 1 then raise exception 'copies must be >= 1'; end if;
  if exists (select 1 from deck_cards where deck_id = p_deck and card_id is null) then
    raise exception 'every card in the deck must be linked to inventory before building';
  end if;

  for r in
    select card_id, sum(count) * p_copies as need from deck_cards where deck_id = p_deck group by card_id
  loop
    update cards set quantity = quantity - r.need, updated_at = now()
      where id = r.card_id and quantity >= r.need;
    if not found then
      raise exception 'not enough singles in stock to build % cop%', p_copies, case when p_copies = 1 then 'y' else 'ies' end;
    end if;
  end loop;

  update decks set quantity = quantity + p_copies, updated_at = now() where id = p_deck
    returning quantity into new_qty;
  return new_qty;
end;
$$;

-- Mark an order paid and take its items out of stock. Idempotent: only acts on
-- pending orders. If something sold out in the meantime the order is flagged
-- 'paid_short' so you can refund/substitute instead of overselling.
create or replace function fulfill_order(p_order uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  it record;
  short boolean := false;
  st text;
begin
  if not (is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'not authorized';
  end if;

  select status into st from orders where id = p_order for update;
  if st is null then raise exception 'order not found'; end if;
  if st <> 'pending_payment' then return st; end if;

  for it in select kind, ref_id, quantity from order_items where order_id = p_order loop
    if it.kind = 'card' then
      update cards set quantity = quantity - it.quantity, updated_at = now()
        where id = it.ref_id and quantity >= it.quantity;
    else
      update decks set quantity = quantity - it.quantity, updated_at = now()
        where id = it.ref_id and quantity >= it.quantity;
    end if;
    if not found then short := true; end if;
  end loop;

  st := case when short then 'paid_short' else 'paid' end;
  update orders set status = st where id = p_order;
  return st;
end;
$$;

revoke execute on function build_deck(uuid, integer) from anon;
revoke execute on function fulfill_order(uuid) from anon;
