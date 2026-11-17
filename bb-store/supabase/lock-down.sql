-- Run this once you've stopped using the old BB Inventory app.
-- It removes the "anyone with the public key can read/write" rules on the
-- inventory tables. The website keeps working: its server uses the
-- service_role key, which isn't affected by these rules.
-- (The old BB Inventory app will stop being able to load or save after this.)

drop policy if exists "Allow all access to items" on items;
drop policy if exists "Allow all access to sales" on sales;
alter table items enable row level security;
alter table sales enable row level security;
