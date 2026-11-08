-- M17 migration, PART B — run ONCE, in a NEW query AFTER part A succeeded.
-- Merge breakfast/lunch/dinner into "meal" and workshop into "crunch" (existing plans and requests).
update plans set type = 'meal' where type in ('breakfast', 'lunch', 'dinner');
update plans set type = 'crunch' where type = 'workshop';
update plan_requests set type = 'meal' where type in ('breakfast', 'lunch', 'dinner');
update plan_requests set type = 'crunch' where type = 'workshop';

-- Work plans: "there are meetings in this block" flag. To-dos from task/crunch plans: separate "task to-do" tab.
alter table plans add column if not exists has_meeting boolean not null default false;
alter table todos add column if not exists is_task boolean not null default false;
