create table if not exists public.user_passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  credential_id text not null unique,
  public_key_jwk jsonb not null,
  sign_count bigint not null default 0,
  name text not null default 'Mobile passkey',
  transports text[] not null default '{}',
  device_type text,
  last_used_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_user_passkeys_user_id
  on public.user_passkeys (user_id);

create index if not exists idx_user_passkeys_user_email
  on public.user_passkeys (lower(user_email));

create table if not exists public.user_passkey_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge text not null unique,
  user_id uuid references auth.users(id) on delete cascade,
  user_email text,
  type text not null check (type in ('registration', 'authentication')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_user_passkey_challenges_lookup
  on public.user_passkey_challenges (challenge, type, expires_at);

create index if not exists idx_user_passkey_challenges_user_email
  on public.user_passkey_challenges (lower(user_email));

alter table public.user_passkeys enable row level security;
alter table public.user_passkey_challenges enable row level security;

drop trigger if exists user_passkeys_updated_at on public.user_passkeys;
create trigger user_passkeys_updated_at
before update on public.user_passkeys
for each row execute function public.update_updated_at();

drop policy if exists "Authenticated can read own passkeys" on public.user_passkeys;
create policy "Authenticated can read own passkeys"
  on public.user_passkeys for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Authenticated can delete own passkeys" on public.user_passkeys;
create policy "Authenticated can delete own passkeys"
  on public.user_passkeys for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Service role can manage passkeys" on public.user_passkeys;
create policy "Service role can manage passkeys"
  on public.user_passkeys for all to service_role using (true) with check (true);

drop policy if exists "Service role can manage passkey challenges" on public.user_passkey_challenges;
create policy "Service role can manage passkey challenges"
  on public.user_passkey_challenges for all to service_role using (true) with check (true);
