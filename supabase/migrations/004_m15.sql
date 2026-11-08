-- M15 migration — run ONCE in Supabase SQL Editor (after 002 and 003).
-- (A brand-new database created from supabase/schema.sql already has this; do NOT run it there.)
alter table plans add column if not exists plan_date date;   -- date known, time not decided (start_at is null)
alter table plans add column if not exists plan_time time;   -- time known, date not decided (start_at is null)

create table if not exists commute_stops (
  id uuid primary key default gen_random_uuid(),
  commute_id uuid not null references commutes(id) on delete cascade,
  label text not null,
  stay_min int not null default 0 check (stay_min >= 0),
  position int not null default 0
);
create index if not exists commute_stops_commute_idx on commute_stops (commute_id, position);
alter table commute_stops enable row level security;
drop policy if exists commute_stops_owner on commute_stops;
create policy commute_stops_owner on commute_stops for all using (exists (select 1 from commutes c join trips x on x.id = c.trip_id where c.id = commute_id and x.owner_id = auth.uid()));
