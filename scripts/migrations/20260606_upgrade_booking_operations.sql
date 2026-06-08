alter table public.bookings
  add column if not exists tags text[] not null default '{}',
  add column if not exists last_email_sent_at timestamptz,
  add column if not exists last_email_kind text,
  add column if not exists last_email_status text,
  add column if not exists last_email_error text,
  add column if not exists last_email_subject text,
  add column if not exists last_email_recipient text,
  add column if not exists last_rescheduled_at timestamptz,
  add column if not exists reschedule_count integer not null default 0;

alter table public.booking_reminder_settings
  add column if not exists same_day_reminder_enabled boolean not null default true,
  add column if not exists same_day_reminder_hours_before integer not null default 2;

alter table public.booking_reminder_events
  add column if not exists same_day_reminder_sent_at timestamptz,
  add column if not exists same_day_reminder_hours_before integer;

create table if not exists public.booking_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  action_name text not null,
  idempotency_key text not null,
  location_id uuid references public.locations(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  response_code integer not null default 200,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  unique (action_name, idempotency_key)
);

create table if not exists public.booking_user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  saved_views jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, location_id)
);

create index if not exists idx_booking_idempotency_keys_created
  on public.booking_idempotency_keys (created_at desc);

create index if not exists idx_booking_user_preferences_user_location
  on public.booking_user_preferences (user_id, location_id);

alter table public.booking_idempotency_keys enable row level security;
alter table public.booking_user_preferences enable row level security;

drop trigger if exists booking_user_preferences_updated_at on public.booking_user_preferences;
create trigger booking_user_preferences_updated_at
before update on public.booking_user_preferences
for each row execute function public.update_updated_at();

drop policy if exists "Authenticated can read booking idempotency keys" on public.booking_idempotency_keys;
create policy "Authenticated can read booking idempotency keys"
  on public.booking_idempotency_keys for select to authenticated using (true);

drop policy if exists "Authenticated can manage booking idempotency keys" on public.booking_idempotency_keys;
create policy "Authenticated can manage booking idempotency keys"
  on public.booking_idempotency_keys for all to authenticated using (true) with check (true);

drop policy if exists "Service role can manage booking idempotency keys" on public.booking_idempotency_keys;
create policy "Service role can manage booking idempotency keys"
  on public.booking_idempotency_keys for all to service_role using (true) with check (true);

drop policy if exists "Authenticated can read own booking preferences" on public.booking_user_preferences;
create policy "Authenticated can read own booking preferences"
  on public.booking_user_preferences for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Authenticated can manage own booking preferences" on public.booking_user_preferences;
create policy "Authenticated can manage own booking preferences"
  on public.booking_user_preferences for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Service role can manage booking user preferences" on public.booking_user_preferences;
create policy "Service role can manage booking user preferences"
  on public.booking_user_preferences for all to service_role using (true) with check (true);

do $$ begin
  alter table public.booking_email_logs
    drop constraint if exists booking_email_logs_email_kind_check;
exception when undefined_table then null;
end $$;

do $$ begin
  alter table public.booking_email_logs
    add constraint booking_email_logs_email_kind_check
    check (email_kind in ('confirmation', 'modification', 'cancellation', 'reminder'));
exception when duplicate_object then null;
end $$;
