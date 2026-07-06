-- Turn 3 "Social, simplified" backend.
--
-- Contents:
--   1. Helper functions used by RLS policies (SECURITY DEFINER to avoid
--      cross-table policy recursion between goals and goal_memberships).
--   2. Canonical RLS policies for all six existing tables, replacing the
--      accumulated dashboard-era duplicates in one pass.
--   3. Friendship semantics: request -> accept via status; decline, cancel,
--      and unfriend are all DELETE. The old pending->'denied' policy violated
--      the status CHECK constraint and is dropped.
--   4. goal_memberships policies (the table previously had RLS enabled with
--      zero policies, making it unusable from the client). Inviting a friend
--      adds them directly as a member -- there is no invite/accept handshake,
--      matching the design where you can only invite existing friends.
--   5. Public goal templates: a separate curated table + per-user commitments.
--      Templates are deliberately NOT rows in goals, so browsing them can
--      never expose anyone's completions and they can never enter a device's
--      sync graph.
--   6. People search / profile display: profiles stay self-only; all
--      cross-user display goes through the 3-column public_profiles view, so
--      profiles.email is structurally unreachable by other users.

-- ---------------------------------------------------------------------------
-- 1. RLS helper functions
-- ---------------------------------------------------------------------------

create or replace function public.is_goal_owner(gid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from goals
    where id = gid and owner_user_id = auth.uid()
  );
$$;

create or replace function public.is_goal_member(gid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from goal_memberships
    where goal_id = gid and user_id = auth.uid()
  );
$$;

revoke execute on function public.is_goal_owner(uuid) from anon, public;
revoke execute on function public.is_goal_member(uuid) from anon, public;
grant execute on function public.is_goal_owner(uuid) to authenticated;
grant execute on function public.is_goal_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Drop every existing policy on the six tables, recreate the canonical set
-- ---------------------------------------------------------------------------

do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in
        ('profiles', 'goals', 'tasks', 'task_completions',
         'friendships', 'goal_memberships')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profiles: self-only. Other users' names come from public_profiles (below),
-- never from this table, so email stays private.
create policy profiles_select on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_delete on public.profiles
  for delete to authenticated using (id = auth.uid());

-- goals: visible to the owner and to members. The old
-- are_users_friends() SELECT arm (every goal visible to every friend) is
-- deliberately gone: the sharing unit is membership, not friendship.
create policy goals_select on public.goals
  for select to authenticated
  using (owner_user_id = auth.uid() or public.is_goal_member(id));
create policy goals_insert on public.goals
  for insert to authenticated with check (owner_user_id = auth.uid());
create policy goals_update on public.goals
  for update to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy goals_delete on public.goals
  for delete to authenticated using (owner_user_id = auth.uid());

-- tasks: readable wherever the goal is readable; structural writes are
-- owner-only (members complete tasks, they do not edit them).
create policy tasks_select on public.tasks
  for select to authenticated
  using (public.is_goal_owner(goal_id) or public.is_goal_member(goal_id));
create policy tasks_insert on public.tasks
  for insert to authenticated with check (public.is_goal_owner(goal_id));
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_goal_owner(goal_id)) with check (public.is_goal_owner(goal_id));
create policy tasks_delete on public.tasks
  for delete to authenticated using (public.is_goal_owner(goal_id));

-- task_completions: anyone who can see the goal sees all members' completions
-- ("doing this together" bars); you only ever write your own rows, and only
-- on goals you own or belong to.
create policy completions_select on public.task_completions
  for select to authenticated
  using (
    completed_by_user_id = auth.uid()
    or exists (
      select 1 from tasks t
      where t.id = task_id
        and (public.is_goal_owner(t.goal_id) or public.is_goal_member(t.goal_id))
    )
  );
create policy completions_insert on public.task_completions
  for insert to authenticated
  with check (
    completed_by_user_id = auth.uid()
    and exists (
      select 1 from tasks t
      where t.id = task_id
        and (public.is_goal_owner(t.goal_id) or public.is_goal_member(t.goal_id))
    )
  );
create policy completions_delete on public.task_completions
  for delete to authenticated using (completed_by_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. friendships
-- ---------------------------------------------------------------------------

-- Two identical unique pair indexes accumulated in the dashboard; keep one.
drop index if exists public.friendships_unique_pair;

create policy friendships_select on public.friendships
  for select to authenticated
  using (auth.uid() in (requester_user_id, addressee_user_id));

create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (
    requester_user_id = auth.uid()
    and requester_user_id <> addressee_user_id
    and status = 'pending'
  );

-- Accept is the only UPDATE. The column-level grant below means UPDATE can
-- only ever touch `status`, so an addressee cannot rewrite the participants
-- and forge a friendship row.
create policy friendships_update on public.friendships
  for update to authenticated
  using (addressee_user_id = auth.uid() and status = 'pending')
  with check (addressee_user_id = auth.uid() and status = 'accepted');

revoke update on public.friendships from authenticated;
grant update (status) on public.friendships to authenticated;

-- Decline (addressee, pending), cancel (requester, pending) and unfriend
-- (either side, accepted) are all row deletion.
create policy friendships_delete on public.friendships
  for delete to authenticated
  using (auth.uid() in (requester_user_id, addressee_user_id));

-- ponytail: status 'blocked' stays in the CHECK but has no write path or UI;
-- add one if abuse ever shows up at this scale.

-- ---------------------------------------------------------------------------
-- 4. goal_memberships
-- ---------------------------------------------------------------------------

create policy memberships_select on public.goal_memberships
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_goal_owner(goal_id)
    or public.is_goal_member(goal_id)
  );

-- Owners add friends directly as members ("do it with friends" / Invite).
create policy memberships_insert on public.goal_memberships
  for insert to authenticated
  with check (
    public.is_goal_owner(goal_id)
    and public.are_users_friends(auth.uid(), user_id)
    and role = 'editor'
  );

-- Owner removes a member, or a member leaves. No UPDATE: role never changes.
create policy memberships_delete on public.goal_memberships
  for delete to authenticated
  using (user_id = auth.uid() or public.is_goal_owner(goal_id));

-- ---------------------------------------------------------------------------
-- 5. Public goal templates + commitments
-- ---------------------------------------------------------------------------

create table public.goal_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  tagline text,
  author_name text not null,
  author_handle text not null,
  -- Array of {title, frequency, custom_type?, custom_target?} snapshots;
  -- committing clones these into a normal private goal on the client.
  tasks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint goal_templates_tasks_is_array check (jsonb_typeof(tasks) = 'array')
);

alter table public.goal_templates enable row level security;

create policy templates_select on public.goal_templates
  for select to authenticated using (true);
-- No insert/update/delete policies: templates are curated with the service
-- role (dashboard/seed), never by app users.

create table public.template_commitments (
  template_id uuid not null references public.goal_templates (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (template_id, user_id)
);

alter table public.template_commitments enable row level security;

-- Own rows only: nobody can enumerate who committed to what. Totals come
-- from the definer view below, which exposes counts and nothing else.
create policy commitments_select on public.template_commitments
  for select to authenticated using (user_id = auth.uid());
create policy commitments_insert on public.template_commitments
  for insert to authenticated with check (user_id = auth.uid());
create policy commitments_delete on public.template_commitments
  for delete to authenticated using (user_id = auth.uid());

create view public.template_commit_counts
  with (security_invoker = false) as
  select template_id, count(*)::int as commit_count
  from public.template_commitments
  group by template_id;

revoke all on public.goal_templates from anon, public;
revoke all on public.template_commitments from anon, public;
revoke all on public.template_commit_counts from anon, public;
grant select on public.template_commit_counts to authenticated;

-- Starter catalog (fixed ids so re-running the seed path stays idempotent).
insert into public.goal_templates (id, title, tagline, author_name, author_handle, tasks) values
  ('a1000000-0000-4000-8000-000000000001', '75 Soft Reset', 'A gentler daily reset', 'Coach Dana', 'coachdana',
   '[{"title": "45-min movement", "frequency": "daily"},
     {"title": "Read 10 pages", "frequency": "daily"},
     {"title": "2L water", "frequency": "daily"}]'),
  ('a1000000-0000-4000-8000-000000000002', 'Couch to 5K', 'Run your first 5K', 'RunWithLeo', 'runwithleo',
   '[{"title": "Run", "frequency": "custom", "custom_type": "weekly", "custom_target": 3},
     {"title": "Stretch", "frequency": "custom", "custom_type": "weekly", "custom_target": 3}]'),
  ('a1000000-0000-4000-8000-000000000003', 'Deep Work January', 'Guard your focus', 'Cal''s Corner', 'calscorner',
   '[{"title": "Deep work block", "frequency": "daily"},
     {"title": "Plan tomorrow", "frequency": "daily"}]')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 6. People search and cross-user display
-- ---------------------------------------------------------------------------

create view public.public_profiles
  with (security_invoker = false) as
  select id, username, display_name from public.profiles;

revoke all on public.public_profiles from anon, public;
grant select on public.public_profiles to authenticated;

-- Superseded by public_profiles + search_people.
drop function if exists public.find_profile_by_username(text);

create or replace function public.search_people(search_text text)
returns table (id uuid, username text, display_name text, mutual_friends int)
language sql stable security definer
set search_path = public
as $$
  with my_friends as (
    select case when requester_user_id = auth.uid()
                then addressee_user_id else requester_user_id end as fid
    from friendships
    where status = 'accepted'
      and auth.uid() in (requester_user_id, addressee_user_id)
  )
  select p.id, p.username, p.display_name,
    (select count(*)::int from my_friends mf
     where exists (
       select 1 from friendships f
       where f.status = 'accepted'
         and ((f.requester_user_id = p.id and f.addressee_user_id = mf.fid)
           or (f.addressee_user_id = p.id and f.requester_user_id = mf.fid))
     )) as mutual_friends
  from profiles p
  where p.id <> auth.uid()
    and length(trim(search_text)) > 0
    and (p.username ilike '%' || trim(search_text) || '%'
      or p.display_name ilike '%' || trim(search_text) || '%')
  order by p.username
  limit 20;
$$;

create or replace function public.mutual_friends_count(other_id uuid)
returns int
language sql stable security definer
set search_path = public
as $$
  with my_friends as (
    select case when requester_user_id = auth.uid()
                then addressee_user_id else requester_user_id end as fid
    from friendships
    where status = 'accepted'
      and auth.uid() in (requester_user_id, addressee_user_id)
  )
  select count(*)::int from my_friends mf
  where exists (
    select 1 from friendships f
    where f.status = 'accepted'
      and ((f.requester_user_id = other_id and f.addressee_user_id = mf.fid)
        or (f.addressee_user_id = other_id and f.requester_user_id = mf.fid))
  );
$$;

revoke execute on function public.search_people(text) from anon, public;
revoke execute on function public.mutual_friends_count(uuid) from anon, public;
grant execute on function public.search_people(text) to authenticated;
grant execute on function public.mutual_friends_count(uuid) to authenticated;
