-- M17 migration, PART A — run ONCE in Supabase SQL Editor (after 005). Run it ALONE, then run part B in a new query.
-- (A brand-new database created from supabase/schema.sql already has all of this; do NOT run it there.)
alter type plan_type add value if not exists 'meal';
alter type plan_type add value if not exists 'work';
alter type plan_type add value if not exists 'crunch';
