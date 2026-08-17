-- BB Inventory — Supabase schema
-- Run this once in your Supabase project: Dashboard -> SQL Editor -> New query -> paste -> Run.

create table if not exists items (
  id text primary key,
  type text not null default 'box',
  game text not null default '',
  owner text not null default '',
  name text not null default '',
  set_name text not null default '',
  sku text not null default '',
  condition text not null default '',
  quantity integer not null default 0,
  cost numeric not null default 0,
  price numeric not null default 0,
  low_stock integer not null default 0,
  notes text not null default '',
  photo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sales (
  id text primary key,
  item_id text,
  item_name text not null default '',
  item_set text not null default '',
  item_type text not null default '',
  owner text not null default '',
  item_cost numeric not null default 0,
  quantity integer not null default 0,
  price numeric not null default 0,
  total numeric not null default 0,
  sold_by text not null default '',
  thumbnail text,
  created_at timestamptz not null default now()
);

-- Safe to re-run on a table created before the "owner" (partner tracking) feature:
-- adds the new columns if this project already has items/sales without them.
alter table items add column if not exists owner text not null default '';
alter table sales add column if not exists owner text not null default '';
alter table sales add column if not exists item_cost numeric not null default 0;

-- Open access: any request carrying the anon key can read/write. The private
-- project URL + anon key are the access boundary (matches "anyone with the link"
-- usage — no per-user login). Do not reuse this policy pattern for anything
-- that needs real per-user access control later.
alter table items enable row level security;
alter table sales enable row level security;

drop policy if exists "Allow all access to items" on items;
create policy "Allow all access to items" on items for all using (true) with check (true);

drop policy if exists "Allow all access to sales" on sales;
create policy "Allow all access to sales" on sales for all using (true) with check (true);

-- Realtime: lets every open tab/device see changes made by any other device live.
-- Wrapped so this script is safe to run more than once.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'items'
  ) then
    alter publication supabase_realtime add table items;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sales'
  ) then
    alter publication supabase_realtime add table sales;
  end if;
end $$;
