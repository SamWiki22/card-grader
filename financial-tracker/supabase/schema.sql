-- Financial Tracker — Supabase schema
-- Run this once in your Supabase project: Dashboard -> SQL Editor -> New query -> paste -> Run.

create table if not exists stocks (
  id text primary key,
  ticker text not null default '',
  name text not null default '',
  shares numeric not null default 0,
  cost_basis numeric not null default 0,
  current_price numeric not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cds (
  id text primary key,
  bank text not null default '',
  principal numeric not null default 0,
  apy numeric not null default 0,
  term_months integer not null default 0,
  open_date date,
  maturity_date date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists net_worth_snapshots (
  id text primary key,
  stocks_value numeric not null default 0,
  cds_value numeric not null default 0,
  total_value numeric not null default 0,
  created_at timestamptz not null default now()
);

-- Open access: any request carrying the anon key can read/write. The private
-- project URL + anon key are the access boundary (matches "anyone with the link"
-- usage — no per-user login). Do not reuse this policy pattern for anything
-- that needs real per-user access control later.
alter table stocks enable row level security;
alter table cds enable row level security;
alter table net_worth_snapshots enable row level security;

drop policy if exists "Allow all access to stocks" on stocks;
create policy "Allow all access to stocks" on stocks for all using (true) with check (true);

drop policy if exists "Allow all access to cds" on cds;
create policy "Allow all access to cds" on cds for all using (true) with check (true);

drop policy if exists "Allow all access to net_worth_snapshots" on net_worth_snapshots;
create policy "Allow all access to net_worth_snapshots" on net_worth_snapshots for all using (true) with check (true);

alter table stocks replica identity full;
alter table cds replica identity full;
alter table net_worth_snapshots replica identity full;

-- Realtime: lets every open tab/device see changes made by any other device live.
-- Wrapped so this script is safe to run more than once.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stocks'
  ) then
    alter publication supabase_realtime add table stocks;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cds'
  ) then
    alter publication supabase_realtime add table cds;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'net_worth_snapshots'
  ) then
    alter publication supabase_realtime add table net_worth_snapshots;
  end if;
end $$;
