-- M13 migration — run ONCE in Supabase SQL Editor on a database created from the older schema.
-- (If you create a brand-new database from supabase/schema.sql, do NOT run this.)

alter type plan_type add value if not exists 'task';

alter table plans add column if not exists photographer_name text;
alter table plans add column if not exists photographer_fee numeric(12,2);
alter table plans add column if not exists studio_fee numeric(12,2);

create table if not exists plan_cost_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  label text not null,
  amount numeric(12,2) not null check (amount >= 0),
  per_hour boolean not null default false,
  position int not null default 0
);
create index if not exists plan_cost_items_plan_idx on plan_cost_items (plan_id, position);

create table if not exists todo_categories (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  position int not null default 0
);
alter table todos add column if not exists category_id uuid references todo_categories(id) on delete set null;

alter table todo_categories enable row level security;
alter table plan_cost_items enable row level security;
drop policy if exists todo_categories_owner on todo_categories;
drop policy if exists plan_cost_items_owner on plan_cost_items;
create policy todo_categories_owner on todo_categories for all using (exists (select 1 from trips x where x.id = trip_id and x.owner_id = auth.uid()));
create policy plan_cost_items_owner on plan_cost_items for all using (exists (select 1 from plans p join trips x on x.id = p.trip_id where p.id = plan_id and x.owner_id = auth.uid()));
