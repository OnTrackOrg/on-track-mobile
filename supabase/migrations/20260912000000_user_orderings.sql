-- Per-user ordering of goals and tasks.
--
-- Press-and-hold reordering in the app is a personal preference: it must
-- never change what other members of a shared goal see. goals.position and
-- tasks.position stay the shared, owner-written order; this table holds one
-- row per user with their private overlay so it follows them across devices
-- and reinstalls. Only the owner of a row can read or write it.

create table if not exists public.user_orderings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Goal ids, top to bottom, across owned and shared goals.
  goal_order jsonb not null default '[]'::jsonb,
  -- { "<goal id>": ["<task id>", ...] }
  task_order jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.user_orderings is
  'One row per user: their private goal/task display order. Never affects other members.';

alter table public.user_orderings enable row level security;

drop policy if exists user_orderings_select on public.user_orderings;
create policy user_orderings_select on public.user_orderings
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists user_orderings_insert on public.user_orderings;
create policy user_orderings_insert on public.user_orderings
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_orderings_update on public.user_orderings;
create policy user_orderings_update on public.user_orderings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists user_orderings_delete on public.user_orderings;
create policy user_orderings_delete on public.user_orderings
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.user_orderings to authenticated;
