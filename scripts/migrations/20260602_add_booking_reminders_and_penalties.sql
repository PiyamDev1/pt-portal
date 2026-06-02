-- Booking reminders, attendance confirmation, and repeat no-show penalties.

create table if not exists public.booking_reminder_settings (
  location_id uuid primary key references public.locations(id) on delete cascade,
  reminders_enabled boolean not null default true,
  reminder_hours_before integer not null default 24 check (reminder_hours_before between 1 and 168),
  reminder_subject text not null default 'Appointment reminder: [service booked] on [date booked] at [time booked]',
  reminder_template text not null default 'Dear [Customer Name],\n\nThis is a reminder that your [service booked] appointment is scheduled for [date booked] at [time booked] at [branch name].\n\nIf you cannot attend, please contact us as soon as possible.\n\nKind regards,\nPiyam Travel',
  attendance_confirmation_required boolean not null default true,
  penalty_enabled boolean not null default true,
  penalty_threshold integer not null default 3 check (penalty_threshold >= 1 and penalty_threshold <= 20),
  penalty_action text not null default 'block_until_manual_review' check (penalty_action in ('warn_only', 'block_until_manual_review')),
  penalty_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_reminder_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  reminder_sent_at timestamptz,
  reminder_hours_before integer,
  response_token text unique,
  response_status text not null default 'unknown' check (response_status in ('unknown', 'present', 'missed')),
  responded_at timestamptz,
  confirmation_source text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_booking_reminder_events_location_created
  on public.booking_reminder_events (location_id, created_at desc);

create table if not exists public.booking_contact_flags (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  customer_phone_norm text,
  customer_email_norm text,
  missed_count integer not null default 0,
  penalty_applied boolean not null default false,
  penalty_applied_at timestamptz,
  last_missed_booking_id uuid references public.bookings(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (customer_phone_norm is not null or customer_email_norm is not null)
);

create unique index if not exists uq_booking_contact_flags_location_phone
  on public.booking_contact_flags (location_id, customer_phone_norm)
  where customer_phone_norm is not null;

create unique index if not exists uq_booking_contact_flags_location_email
  on public.booking_contact_flags (location_id, customer_email_norm)
  where customer_email_norm is not null;

create index if not exists idx_booking_contact_flags_penalty
  on public.booking_contact_flags (location_id, penalty_applied, missed_count desc);

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_booking_reminder_settings_updated_at on public.booking_reminder_settings;
create trigger trg_booking_reminder_settings_updated_at
before update on public.booking_reminder_settings
for each row execute function public.touch_updated_at();

drop trigger if exists trg_booking_reminder_events_updated_at on public.booking_reminder_events;
create trigger trg_booking_reminder_events_updated_at
before update on public.booking_reminder_events
for each row execute function public.touch_updated_at();

drop trigger if exists trg_booking_contact_flags_updated_at on public.booking_contact_flags;
create trigger trg_booking_contact_flags_updated_at
before update on public.booking_contact_flags
for each row execute function public.touch_updated_at();

alter table public.booking_reminder_settings enable row level security;
alter table public.booking_reminder_events enable row level security;
alter table public.booking_contact_flags enable row level security;

drop policy if exists "Authenticated can read booking reminder settings" on public.booking_reminder_settings;
create policy "Authenticated can read booking reminder settings"
  on public.booking_reminder_settings for select to authenticated using (true);

drop policy if exists "Authenticated can manage booking reminder settings" on public.booking_reminder_settings;
create policy "Authenticated can manage booking reminder settings"
  on public.booking_reminder_settings for all to authenticated using (true) with check (true);

drop policy if exists "Service role can manage booking reminder settings" on public.booking_reminder_settings;
create policy "Service role can manage booking reminder settings"
  on public.booking_reminder_settings for all to service_role using (true) with check (true);

drop policy if exists "Authenticated can read booking reminder events" on public.booking_reminder_events;
create policy "Authenticated can read booking reminder events"
  on public.booking_reminder_events for select to authenticated using (true);

drop policy if exists "Authenticated can manage booking reminder events" on public.booking_reminder_events;
create policy "Authenticated can manage booking reminder events"
  on public.booking_reminder_events for all to authenticated using (true) with check (true);

drop policy if exists "Service role can manage booking reminder events" on public.booking_reminder_events;
create policy "Service role can manage booking reminder events"
  on public.booking_reminder_events for all to service_role using (true) with check (true);

drop policy if exists "Authenticated can read booking contact flags" on public.booking_contact_flags;
create policy "Authenticated can read booking contact flags"
  on public.booking_contact_flags for select to authenticated using (true);

drop policy if exists "Authenticated can manage booking contact flags" on public.booking_contact_flags;
create policy "Authenticated can manage booking contact flags"
  on public.booking_contact_flags for all to authenticated using (true) with check (true);

drop policy if exists "Service role can manage booking contact flags" on public.booking_contact_flags;
create policy "Service role can manage booking contact flags"
  on public.booking_contact_flags for all to service_role using (true) with check (true);
