-- 20260613_add_auth_security_events.sql
-- Append-only security telemetry and lightweight login cooldown support for IMS auth flows.

create table if not exists public.auth_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  event_type text not null,
  status text not null,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint auth_security_events_event_type_chk
    check (
      event_type in (
        'password_login',
        'passkey_login',
        'two_factor',
        'backup_code',
        'password_update',
        'session_revoke',
        'frappe_handoff'
      )
    ),
  constraint auth_security_events_status_chk
    check (status in ('started', 'success', 'failed', 'blocked', 'revoked'))
);

create index if not exists auth_security_events_email_created_idx
  on public.auth_security_events(lower(email), created_at desc)
  where email is not null;

create index if not exists auth_security_events_user_created_idx
  on public.auth_security_events(user_id, created_at desc)
  where user_id is not null;

create index if not exists auth_security_events_type_status_created_idx
  on public.auth_security_events(event_type, status, created_at desc);

alter table public.auth_security_events enable row level security;

drop policy if exists "Users can read own auth security events" on public.auth_security_events;
create policy "Users can read own auth security events"
  on public.auth_security_events for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Service role can manage auth security events" on public.auth_security_events;
create policy "Service role can manage auth security events"
  on public.auth_security_events for all to service_role
  using (true)
  with check (true);
