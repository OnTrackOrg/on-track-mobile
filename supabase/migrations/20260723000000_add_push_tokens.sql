-- Device tokens are private infrastructure. App clients can only register
-- their own current token through the security-definer function below; the
-- nudge Edge Function reads tokens with the service role.
create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create or replace function public.register_push_token(
  device_token text,
  device_platform text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in to register for notifications.';
  end if;

  if device_token is null or length(trim(device_token)) = 0 then
    raise exception 'A device token is required.';
  end if;

  if device_platform not in ('ios', 'android') then
    raise exception 'Unsupported notification platform.';
  end if;

  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (trim(device_token), auth.uid(), device_platform, now())
  on conflict (token) do update
  set
    user_id = excluded.user_id,
    platform = excluded.platform,
    updated_at = now();
end;
$$;

revoke all on public.push_tokens from anon, public, authenticated;
grant all on table public.push_tokens to service_role;
grant execute on function public.register_push_token(text, text) to authenticated;
