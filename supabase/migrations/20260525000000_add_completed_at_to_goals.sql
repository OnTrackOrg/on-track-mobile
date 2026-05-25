alter table public.goals
  add column if not exists completed_at timestamptz null;

create index if not exists goals_owner_completed_at_idx
  on public.goals (owner_user_id, completed_at);
