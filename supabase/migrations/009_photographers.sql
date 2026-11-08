-- M20 migration — run ONCE in Supabase SQL Editor (after 008).
-- (A brand-new database created from supabase/schema.sql already has the table; do NOT run it there.)
create table if not exists photographers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  rate_1h numeric(12,2),   -- fee for up to 1 hour (null = not offered)
  rate_2h numeric(12,2),   -- fee for 2 hours or more (null = not offered)
  position int not null default 0,
  created_at timestamptz default now()
);
create index if not exists photographers_owner_idx on photographers (owner_id, position);
alter table photographers enable row level security;
drop policy if exists photographers_owner on photographers;
create policy photographers_owner on photographers for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Seed the four photographers for every existing trip owner that has none yet.
insert into photographers (owner_id, name, rate_1h, rate_2h, position)
select o.owner_id, v.name, v.r1, v.r2, v.pos
from (select distinct owner_id from trips) o
cross join (values ('Saya', 2000, 3600, 0), ('洸', 1800, 3000, 1), ('HC', null, 3000, 2), ('Judy', 1500, 3000, 3)) as v(name, r1, r2, pos)
where not exists (select 1 from photographers p where p.owner_id = o.owner_id);
