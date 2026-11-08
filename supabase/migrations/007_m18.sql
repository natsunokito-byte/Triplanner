-- M18 migration — run ONCE in Supabase SQL Editor (after 006b).
-- (A brand-new database created from supabase/schema.sql already has this; do NOT run it there.)
alter table plans add column if not exists open_claim boolean not null default false;
alter table plans add column if not exists claim_proposal text;

create table if not exists plan_claims (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  plan_id uuid not null references plans(id) on delete cascade,
  claimer_name text not null,
  claimer_email text not null,
  message text,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  owner_reply text,
  created_at timestamptz default now(),
  decided_at timestamptz
);
create index if not exists plan_claims_trip_idx on plan_claims (trip_id, status, created_at);
create index if not exists plan_claims_plan_idx on plan_claims (plan_id, status);
alter table plan_claims enable row level security;
drop policy if exists plan_claims_owner on plan_claims;
create policy plan_claims_owner on plan_claims for all using (exists (select 1 from trips x where x.id = trip_id and x.owner_id = auth.uid()));
-- Visitors never touch this table directly: public claims go through server code (service role).
