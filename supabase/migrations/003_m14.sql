-- M14 migration — run ONCE in Supabase SQL Editor (after 002_m13.sql).
-- (A brand-new database created from supabase/schema.sql already has this; do NOT run it there.)
alter table plans alter column start_at drop not null;
alter table plans add column if not exists studio_name text;
