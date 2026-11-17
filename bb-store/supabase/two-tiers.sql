-- Run ONCE in Supabase → SQL Editor: every game gets two live packs,
-- $20 (Kodiak) and $50 (Polar). Cub, Grizzly and Alpha are hidden, not deleted —
-- turn any back on later with the "Live" box in /admin/packs.
-- (Cards already sitting in a hidden tier stay there; use "Move to…" on each card.)
update pack_tiers set price_cents = 2000, active = true  where id like '%-kodiak';
update pack_tiers set price_cents = 5000, active = true  where id like '%-polar';
update pack_tiers set active = false where id like '%-cub' or id like '%-grizzly' or id like '%-alpha';

-- Check: should list 8 rows (2 per game).
select game, name, price_cents / 100.0 as price from pack_tiers where active order by game, price_cents;
