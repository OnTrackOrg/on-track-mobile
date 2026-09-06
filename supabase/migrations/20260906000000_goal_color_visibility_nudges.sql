-- Goal accent colors, public goals, and a server-side nudge log.
--
--   1. goals.color: an optional owner-chosen accent (#rrggbb). NULL keeps
--      the id-derived color the client has always used.
--   2. goals.visibility gains 'public'. Public goals are readable by every
--      accepted friend of the owner (goal, tasks, and all completions), so a
--      friend can follow along and nudge without being a member. Existing
--      rows keep 'private' (the column default), so nothing becomes visible
--      retroactively.
--   3. nudges: one row per delivered nudge, written by the send-nudge Edge
--      Function with the service role. It backs the once-per-hour rule per
--      sender + recipient + goal. App clients cannot read or write it.

-- ---------------------------------------------------------------------------
-- 1. Color
-- ---------------------------------------------------------------------------

alter table public.goals
  add column if not exists color text;

alter table public.goals
  drop constraint if exists goals_color_is_hex;
alter table public.goals
  add constraint goals_color_is_hex
  check (color is null or color ~* '^#[0-9a-f]{6}$');

comment on column public.goals.color is
  'Owner-chosen accent (#rrggbb). NULL = derived from the goal id on the client.';

-- ---------------------------------------------------------------------------
-- 2. Public visibility
-- ---------------------------------------------------------------------------

alter table public.goals
  drop constraint if exists goals_visibility_check;
alter table public.goals
  add constraint goals_visibility_check
  check (visibility in ('private', 'shared', 'public'));

comment on column public.goals.visibility is
  'private (default) or public. Public goals are visible to all accepted friends of the owner. ''shared'' is a legacy value with no meaning; membership is the sharing unit.';

-- Definer helper so the tasks / completions policies can ask "is this a
-- friend's public goal?" without recursing through the goals policy.
create or replace function public.is_friends_public_goal(gid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from goals g
    where g.id = gid
      and g.visibility = 'public'
      and public.are_users_friends(auth.uid(), g.owner_user_id)
  );
$$;

revoke execute on function public.is_friends_public_goal(uuid) from anon, public;
grant execute on function public.is_friends_public_goal(uuid) to authenticated;

drop policy if exists goals_select on public.goals;
create policy goals_select on public.goals
  for select to authenticated
  using (
    owner_user_id = auth.uid()
    or public.is_goal_member(id)
    or (visibility = 'public' and public.are_users_friends(auth.uid(), owner_user_id))
  );

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    public.is_goal_owner(goal_id)
    or public.is_goal_member(goal_id)
    or public.is_friends_public_goal(goal_id)
  );

drop policy if exists completions_select on public.task_completions;
create policy completions_select on public.task_completions
  for select to authenticated
  using (
    completed_by_user_id = auth.uid()
    or exists (
      select 1 from tasks t
      where t.id = task_id
        and (
          public.is_goal_owner(t.goal_id)
          or public.is_goal_member(t.goal_id)
          or public.is_friends_public_goal(t.goal_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Nudge log (service role only)
-- ---------------------------------------------------------------------------

create table if not exists public.nudges (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references public.profiles (id) on delete cascade,
  recipient_user_id uuid not null references public.profiles (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists nudges_rate_limit_idx
  on public.nudges (sender_user_id, recipient_user_id, goal_id, created_at desc);

alter table public.nudges enable row level security;

revoke all on public.nudges from anon, public, authenticated;
grant all on table public.nudges to service_role;
