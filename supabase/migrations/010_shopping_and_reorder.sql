-- M21 migration — run ONCE in Supabase SQL Editor (after 009). Run PART A alone first, then PART B in a new query.
-- (A brand-new database created from supabase/schema.sql already has all of this; do NOT run it there.)

-- ===== PART A =====
alter type plan_type add value if not exists 'shopping';

-- ===== PART B (new query) =====
create table if not exists shopping_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  plan_id uuid not null references plans(id) on delete cascade,
  title text not null,
  done boolean not null default false,       -- purchased
  amount numeric(12,2),
  currency text,                             -- ISO 4217; null = trip currency
  note text,
  position int not null default 0,
  created_at timestamptz default now()
);
create index if not exists shopping_items_plan_idx on shopping_items (plan_id, position);
create index if not exists shopping_items_trip_idx on shopping_items (trip_id);
alter table shopping_items enable row level security;
drop policy if exists shopping_items_owner on shopping_items;
create policy shopping_items_owner on shopping_items for all using (exists (select 1 from trips x where x.id = trip_id and x.owner_id = auth.uid()));
