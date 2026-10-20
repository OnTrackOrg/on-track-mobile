-- Shared goals are retired (Oct 2026). Every goal now has exactly one
-- owner; friends follow each other through public goals instead.
--
--   1. Split: every member who isn't the owner gets their own copy of the
--      goal (same title, target, dates, visibility, color, achieved state)
--      with copies of its tasks, and their completion rows move onto those
--      copies. The owner keeps the original goal with their own history.
--      From here on the two copies are independent.
--   2. goal_memberships is emptied and closed: no policies are left on it,
--      so RLS returns no rows and rejects writes. The table itself stays
--      until no installed build queries it any more (older builds still
--      select from it and must keep getting an empty, error-free answer).
--   3. Read and write access no longer consider membership: a goal, its
--      tasks and its completions are visible to the owner, and to the
--      owner's accepted friends when the goal is public. Only the owner
--      logs completions on it.

-- ---------------------------------------------------------------------------
-- 1. Split shared goals into one copy per member
-- ---------------------------------------------------------------------------

do $$
declare
  membership record;
  task_row record;
  copy_goal_id uuid;
  copy_task_id uuid;
begin
  for membership in
    select gm.user_id, g.*
    from public.goal_memberships gm
    join public.goals g on g.id = gm.goal_id
    where gm.user_id <> g.owner_user_id
    order by g.created_at, gm.created_at
  loop
    copy_goal_id := gen_random_uuid();

    insert into public.goals (
      id, owner_user_id, title, target, visibility, position,
      created_at, updated_at, completed_at, is_draft, start_day, due_day, color
    )
    values (
      copy_goal_id,
      membership.user_id,
      membership.title,
      membership.target,
      -- 'shared' was a legacy value with no meaning; copies are private.
      case when membership.visibility = 'public' then 'public' else 'private' end,
      -- After the member's own goals.
      coalesce(
        (select max(position) + 1 from public.goals
         where owner_user_id = membership.user_id),
        0
      ),
      membership.created_at,
      now(),
      membership.completed_at,
      membership.is_draft,
      membership.start_day,
      membership.due_day,
      membership.color
    );

    for task_row in
      select * from public.tasks where goal_id = membership.id
    loop
      copy_task_id := gen_random_uuid();

      insert into public.tasks (
        id, goal_id, title, frequency, custom_type, custom_target,
        custom_weekdays, times_per_day, times, reminder_lead_min, once_day,
        position, archived_at, created_at, updated_at
      )
      values (
        copy_task_id,
        copy_goal_id,
        task_row.title,
        task_row.frequency,
        task_row.custom_type,
        task_row.custom_target,
        task_row.custom_weekdays,
        task_row.times_per_day,
        task_row.times,
        task_row.reminder_lead_min,
        task_row.once_day,
        task_row.position,
        task_row.archived_at,
        task_row.created_at,
        now()
      );

      update public.task_completions
      set task_id = copy_task_id
      where task_id = task_row.id
        and completed_by_user_id = membership.user_id;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Close goal_memberships
-- ---------------------------------------------------------------------------

delete from public.goal_memberships;

drop policy if exists memberships_select on public.goal_memberships;
drop policy if exists memberships_insert on public.goal_memberships;
drop policy if exists memberships_delete on public.goal_memberships;

comment on table public.goal_memberships is
  'Retired with shared goals (Oct 2026). Empty and policy-less, so RLS returns no rows and rejects writes; kept only so older builds that still select from it get an empty answer. Drop once those builds are gone.';

-- ---------------------------------------------------------------------------
-- 3. Access without membership
-- ---------------------------------------------------------------------------

drop policy if exists goals_select on public.goals;
create policy goals_select on public.goals
  for select to authenticated
  using (
    owner_user_id = auth.uid()
    or (visibility = 'public' and public.are_users_friends(auth.uid(), owner_user_id))
  );

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    public.is_goal_owner(goal_id)
    or public.is_friends_public_goal(goal_id)
  );

drop policy if exists completions_select on public.task_completions;
create policy completions_select on public.task_completions
  for select to authenticated
  using (
    completed_by_user_id = auth.uid()
    or exists (
      select 1 from public.tasks t
      where t.id = task_id
        and (
          public.is_goal_owner(t.goal_id)
          or public.is_friends_public_goal(t.goal_id)
        )
    )
  );

drop policy if exists completions_insert on public.task_completions;
create policy completions_insert on public.task_completions
  for insert to authenticated
  with check (
    completed_by_user_id = auth.uid()
    and exists (
      select 1 from public.tasks t
      where t.id = task_id and public.is_goal_owner(t.goal_id)
    )
  );

drop function if exists public.is_goal_member(uuid);
