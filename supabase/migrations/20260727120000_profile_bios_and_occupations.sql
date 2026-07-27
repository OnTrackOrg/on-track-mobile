-- Public friend profiles need a little more context than just names.

alter table public.profiles
  add column if not exists bio text,
  add column if not exists occupation text;

comment on column public.profiles.bio is
  'Short public profile bio visible to authenticated users via public_profiles.';
comment on column public.profiles.occupation is
  'What the user does for a living, visible to authenticated users via public_profiles.';

drop view if exists public.public_profiles;
create view public.public_profiles
  with (security_invoker = false) as
  select id, username, display_name, avatar_uri, bio, occupation
  from public.profiles;

revoke all on public.public_profiles from anon, public;
grant select on public.public_profiles to authenticated;
