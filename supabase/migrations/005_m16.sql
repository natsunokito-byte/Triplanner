-- M16 migration — run ONCE in Supabase SQL Editor (after 004).
-- (A brand-new database created from supabase/schema.sql already has this; do NOT run it there.)
alter type plan_type add value if not exists 'wake_up';
