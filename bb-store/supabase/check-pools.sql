-- Pool / vault health check. READ-ONLY: it changes nothing.
-- Supabase → SQL Editor → paste → Run. Every "problem" query below should come back empty.
-- If one doesn't, send Claude the rows it shows.

-- 1. Where every card is, per pack. "available" = in the pool; "held" = in a player's vault.
select t.game, t.name as pack, c.status, count(*) as cards
from pack_cards c join pack_tiers t on t.id = c.tier_id
group by 1, 2, 3 order by 1, 2, 3;

-- 2. Problem: a card in the pool that still has an owner, or a vaulted/shipping card with no owner.
select id, name, status, owner_id from pack_cards
where (status in ('available', 'retired', 'sold_to_store') and owner_id is not null)
   or (status in ('held', 'ship_requested', 'shipped') and owner_id is null);

-- 3. Problem: a card's history doesn't match where it is.
--    A card enters a vault by being pulled or by a player mailing it in (vault upload);
--    it leaves when they sell it (into a pool or to the store). So arrivals − sales must be
--    1 for a card a player owns and 0 for any other card.
with p as (select card_id, count(*) n from pulls group by 1),
     v as (select card_id, count(*) n from submissions where kind = 'vault' and status = 'vaulted' and card_id is not null group by 1),
     b as (select ref as card_id, count(*) n from ledger where kind = 'buyback' group by 1)
select c.id, c.name, c.status, coalesce(p.n, 0) as pulls, coalesce(v.n, 0) as mailed_in, coalesce(b.n, 0) as sold
from pack_cards c left join p on p.card_id = c.id left join v on v.card_id = c.id left join b on b.card_id = c.id
where coalesce(p.n, 0) + coalesce(v.n, 0) - coalesce(b.n, 0) <> case when c.status in ('held', 'ship_requested', 'shipped') then 1 else 0 end;

-- 4. Problem: a vaulted card belongs to someone other than the player who last pulled it
--    (cards that were mailed in belong to the player who mailed them).
select c.id, c.name, c.owner_id, lp.user_id as last_pulled_by
from pack_cards c
join lateral (select user_id, created_at from pulls where card_id = c.id order by id desc limit 1) lp on true
where c.status in ('held', 'ship_requested', 'shipped') and c.owner_id <> lp.user_id
  and not exists (select 1 from submissions s where s.card_id = c.id and s.kind = 'vault' and s.user_id = c.owner_id and s.updated_at > lp.created_at);

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

-- 8. Problem: a card sold to the store has no store listing.
select c.id, c.name from pack_cards c
where c.status = 'sold_to_store' and not exists (select 1 from items i where i.id = 'vault-' || c.id);
