-- Goal lifecycle (drafts, scheduled starts, due dates) + shared avatars.
-- Freeze days were never stored server-side, so gutting that feature needs
-- no schema change; this migration is the whole DB story for this release.

-- ---------------------------------------------------------------------------
-- 1. Goal lifecycle columns
-- ---------------------------------------------------------------------------

alter table public.goals
  add column if not exists is_draft boolean not null default false,
  add column if not exists start_day date,
  add column if not exists due_day date;

comment on column public.goals.is_draft is
  'Drafted but not started: never due, hidden from Today.';
comment on column public.goals.start_day is
  'Calendar day tasks become due from. NULL = active since creation (legacy).';
comment on column public.goals.due_day is
  'Target day to reach the goal by, e.g. "180 lb by 2027-06-11".';

-- ---------------------------------------------------------------------------
-- 2. Profile avatars, visible to other signed-in users
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists avatar_uri text;

comment on column public.profiles.avatar_uri is
  'Small data-URI avatar image, synced from the device picker.';

-- Recreate the cross-user view so friends can see avatars alongside names.
-- (create or replace cannot add a column to a view's select list in all
-- Postgres versions, so drop + recreate with the original grants.)
drop view if exists public.public_profiles;
create view public.public_profiles
  with (security_invoker = false) as
  select id, username, display_name, avatar_uri from public.profiles;

revoke all on public.public_profiles from anon, public;
grant select on public.public_profiles to authenticated;

-- search_people also carries the avatar so Search results can render it.
drop function if exists public.search_people(text);
create or replace function public.search_people(search_text text)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_uri text,
  mutual_friends int
)
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
  select p.id, p.username, p.display_name, p.avatar_uri,
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

revoke execute on function public.search_people(text) from anon, public;
grant execute on function public.search_people(text) to authenticated;
