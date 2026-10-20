-- Times of day, X-a-day doses, and reminders on tasks.
--
-- tasks.times_per_day: completions needed on a due day (default 1 keeps
--   every existing task unchanged).
-- tasks.times: [{ "at": "HH:mm", "remind": bool }, ...] or NULL for any
--   time of day. Reminders are local notifications scheduled on-device.
-- tasks.reminder_lead_min: minutes before each belled time to notify.
-- tasks.once_day: the day a one-off task is due from.
alter table public.tasks
  add column if not exists times_per_day smallint not null default 1,
  add column if not exists times jsonb,
  add column if not exists reminder_lead_min smallint not null default 0,
  add column if not exists once_day date;

alter table public.tasks
  drop constraint if exists tasks_times_per_day_check,
  add constraint tasks_times_per_day_check
    check (times_per_day between 1 and 24),
  drop constraint if exists tasks_times_check,
  add constraint tasks_times_check
    check (times is null or jsonb_typeof(times) = 'array'),
  drop constraint if exists tasks_reminder_lead_min_check,
  add constraint tasks_reminder_lead_min_check
    check (reminder_lead_min between 0 and 1440);

-- A multi-dose task logs one completion row per dose, so a day can hold
-- several rows for the same task and user, told apart by occurrence.
alter table public.task_completions
  add column if not exists occurrence smallint not null default 0;

alter table public.task_completions
  drop constraint if exists task_completions_task_id_completed_by_user_id_completed_day_key;

alter table public.task_completions
  add constraint task_completions_task_user_day_occurrence_key
    unique (task_id, completed_by_user_id, completed_day, occurrence);
