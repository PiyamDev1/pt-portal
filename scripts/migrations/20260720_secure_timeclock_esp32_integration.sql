-- Secure the timeclock trust boundary and add ESP32 device integration state.

alter table public.timeclock_devices
  add column if not exists device_type text not null default 'physical',
  add column if not exists location_id uuid references public.locations(id) on delete set null,
  add column if not exists qr_interval_sec integer not null default 30,
  add column if not exists last_seen_at timestamptz,
  add column if not exists firmware_version text,
  add column if not exists ip text,
  add column if not exists wifi_rssi integer,
  add column if not exists free_heap bigint,
  add column if not exists uptime_sec bigint;

update public.timeclock_devices
set device_type = 'virtual'
where name like 'Manual Entry (%)';

alter table public.timeclock_devices
  drop constraint if exists timeclock_devices_device_type_check,
  add constraint timeclock_devices_device_type_check
    check (device_type in ('physical', 'virtual')),
  drop constraint if exists timeclock_devices_qr_interval_check,
  add constraint timeclock_devices_qr_interval_check
    check (qr_interval_sec between 5 and 300);

create index if not exists timeclock_devices_type_active_idx
  on public.timeclock_devices(device_type, is_active);

create index if not exists timeclock_devices_location_idx
  on public.timeclock_devices(location_id);

create table if not exists public.timeclock_device_request_nonces (
  device_id uuid not null references public.timeclock_devices(id) on delete cascade,
  nonce text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (device_id, nonce)
);

create index if not exists timeclock_device_request_nonces_expiry_idx
  on public.timeclock_device_request_nonces(expires_at);

create table if not exists public.timeclock_qr_nonces (
  device_id uuid not null references public.timeclock_devices(id) on delete cascade,
  nonce text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (device_id, nonce)
);

create index if not exists timeclock_qr_nonces_expiry_idx
  on public.timeclock_qr_nonces(expires_at);

alter table public.timeclock_devices enable row level security;
alter table public.timeclock_manual_codes enable row level security;
alter table public.timeclock_device_request_nonces enable row level security;
alter table public.timeclock_qr_nonces enable row level security;

revoke all privileges on table public.timeclock_devices from anon, authenticated;
revoke all privileges on table public.timeclock_manual_codes from anon, authenticated;
revoke all privileges on table public.timeclock_device_request_nonces from anon, authenticated;
revoke all privileges on table public.timeclock_qr_nonces from anon, authenticated;

grant all privileges on table public.timeclock_devices to service_role;
grant all privileges on table public.timeclock_manual_codes to service_role;
grant all privileges on table public.timeclock_device_request_nonces to service_role;
grant all privileges on table public.timeclock_qr_nonces to service_role;

do $$
begin
  if to_regprocedure('public.cleanup_expired_manual_codes()') is not null then
    execute 'revoke execute on function public.cleanup_expired_manual_codes() from public, anon, authenticated';
    execute 'grant execute on function public.cleanup_expired_manual_codes() to service_role';
  end if;
end
$$;

comment on column public.timeclock_devices.secret is
  'Server-only HMAC secret. Never select this column in browser-facing responses.';
