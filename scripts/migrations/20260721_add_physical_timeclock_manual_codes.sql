-- Allow physical timeclocks to issue short-lived, one-use manual entry codes.

alter table public.timeclock_manual_codes
  alter column user_id drop not null;

create index if not exists timeclock_manual_codes_device_active_idx
  on public.timeclock_manual_codes(device_id, created_at desc)
  where used_at is null;

create table if not exists public.timeclock_device_manual_code_limits (
  device_id uuid primary key references public.timeclock_devices(id) on delete cascade,
  next_allowed_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.timeclock_device_manual_code_limits enable row level security;

revoke all privileges on table public.timeclock_device_manual_code_limits
  from anon, authenticated;
grant all privileges on table public.timeclock_device_manual_code_limits
  to service_role;
