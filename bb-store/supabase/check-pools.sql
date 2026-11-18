-- Pool / vault health check. READ-ONLY: it changes nothing.
-- Supabase → SQL Editor → paste → Run. Every "problem" query below should come back empty.
-- If one doesn't, send Claude the rows it shows.

-- 1. Where every card is, per pack. "available" = in the pool; "held" = in a player's vault.
select t.game, t.name as pack, c.status, count(*) as cards
from pack_cards c join pack_tiers t on t.id = c.tier_id
group by 1, 2, 3 order by 1, 2, 3;

-- 2. Problem: a card in the pool that still has an owner, or a vaulted/shipping card with no owner.
select id, name, status, owner_id from pack_cards
where (status in ('available', 'retired') and owner_id is not null)
   or (status in ('held', 'ship_requested', 'shipped') and owner_id is null);

-- 3. Problem: a card's pull history doesn't match where it is.
--    Every pull moves a card out of the pool and every sell-back moves it back, so
--    pulls − sell-backs must be 1 for a card a player owns and 0 for a card in the pool.
with p as (select card_id, count(*) n from pulls group by 1),
     b as (select ref as card_id, count(*) n from ledger where kind = 'buyback' group by 1)
select c.id, c.name, c.status, coalesce(p.n, 0) as pulls, coalesce(b.n, 0) as sell_backs
from pack_cards c left join p on p.card_id = c.id left join b on b.card_id = c.id
where coalesce(p.n, 0) - coalesce(b.n, 0) <> case when c.status in ('held', 'ship_requested', 'shipped') then 1 else 0 end;

-- 4. Problem: a vaulted card belongs to someone other than the player who last pulled it.
select c.id, c.name, c.owner_id, lp.user_id as last_pulled_by
from pack_cards c
join lateral (select user_id from pulls where card_id = c.id order by id desc limit 1) lp on true
where c.status in ('held', 'ship_requested', 'shipped') and c.owner_id <> lp.user_id;

-- 5. Problem: a player's balance doesn't equal the sum of their transaction history.
select p.email, p.balance_cents, coalesce(sum(l.amount_cents), 0) as ledger_total
from profiles p left join ledger l on l.user_id = p.user_id
group by p.user_id, p.email, p.balance_cents
having p.balance_cents <> coalesce(sum(l.amount_cents), 0);

-- 6. Problem: a pack charge without a pull, or a pull without a charge.
select (select count(*) from ledger where kind = 'pack_open') as pack_charges,
       (select count(*) from pulls) as pulls
where (select count(*) from ledger where kind = 'pack_open') <> (select count(*) from pulls);

-- 7. Problem: a card waiting to ship isn't in any open shipment.
select c.id, c.name from pack_cards c
where c.status = 'ship_requested'
  and not exists (select 1 from shipments s where s.status = 'requested' and c.id = any(s.card_ids));
