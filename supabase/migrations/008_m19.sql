-- M19 migration — run ONCE in Supabase SQL Editor (after 007).
-- (A brand-new database created from supabase/schema.sql already has this; do NOT run it there.)
create table if not exists plan_proposals (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  proposer_name text not null,
  type text not null,
  title text not null,
  note text,
  rough_date date,
  rough_time text,
  rough_location text,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  plan_id uuid references plans(id) on delete set null,
  created_at timestamptz default now(),
  decided_at timestamptz
);
create index if not exists plan_proposals_trip_idx on plan_proposals (trip_id, status, created_at);
alter table plan_proposals enable row level security;
drop policy if exists plan_proposals_owner on plan_proposals;
create policy plan_proposals_owner on plan_proposals for all using (exists (select 1 from trips x where x.id = trip_id and x.owner_id = auth.uid()));
-- Visitors never touch this table directly: public proposals go through server code (service role).
