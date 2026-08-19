-- Weekday-pinned task schedules (issue #162): explicit weekdays
-- (0 = Sunday .. 6 = Saturday) a custom-weekly task is due on. NULL keeps
-- the existing floating "n times per week/month" behavior.
alter table public.tasks
  add column if not exists custom_weekdays smallint[];
