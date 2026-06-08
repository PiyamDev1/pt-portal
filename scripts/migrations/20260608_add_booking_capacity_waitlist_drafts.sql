create extension if not exists btree_gist;

create table if not exists public.booking_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  draft_key text not null default 'appointment-form',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, location_id, draft_key)
);

create table if not exists public.booking_waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  service_id uuid references public.booking_services(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  person_count integer not null default 1,
  preferred_date date,
  preferred_time_start time,
  preferred_time_end time,
  source public.booking_source not null default 'portal',
  status text not null default 'waiting' check (status in ('waiting', 'contacted', 'booked', 'cancelled', 'expired')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  linked_booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.booking_capacity_reservations (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  seat_number integer not null check (seat_number >= 1),
  start_time timestamptz not null,
  occupied_until timestamptz not null,
  released_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (occupied_until > start_time)
);

do $$
begin
  alter table public.bookings
    add column if not exists attendance_status text not null default 'unknown';
exception when undefined_table then null;
end $$;

do $$
begin
  alter table public.booking_contact_flags
    add column if not exists last_no_show_at timestamptz,
    add column if not exists manual_review_required boolean not null default false,
    add column if not exists penalty_reason text,
    add column if not exists blocked_until timestamptz;
exception when undefined_table then null;
end $$;

do $$
begin
  alter table public.bookings
    drop constraint if exists bookings_attendance_status_check;
  alter table public.bookings
    add constraint bookings_attendance_status_check
    check (attendance_status in ('unknown', 'present', 'missed', 'manual_no_show'));
exception when undefined_table then null;
when duplicate_object then null;
end $$;

create index if not exists idx_booking_drafts_user_location
  on public.booking_drafts (user_id, location_id, draft_key);

create index if not exists idx_booking_waitlist_location_status
  on public.booking_waitlist_entries (location_id, status, preferred_date);

create index if not exists idx_booking_capacity_reservations_active
  on public.booking_capacity_reservations (location_id, start_time, occupied_until)
  where released_at is null;

do $$
begin
  alter table public.booking_capacity_reservations
    add constraint booking_capacity_reservations_no_overlap
    exclude using gist (
      location_id with =,
      seat_number with =,
      tstzrange(start_time, occupied_until, '[)') with &&
    )
    where (released_at is null);
exception
  when duplicate_object then null;
end $$;

drop trigger if exists booking_drafts_updated_at on public.booking_drafts;
create trigger booking_drafts_updated_at
before update on public.booking_drafts
for each row execute function public.update_updated_at();

drop trigger if exists booking_waitlist_entries_updated_at on public.booking_waitlist_entries;
create trigger booking_waitlist_entries_updated_at
before update on public.booking_waitlist_entries
for each row execute function public.update_updated_at();

drop trigger if exists booking_capacity_reservations_updated_at on public.booking_capacity_reservations;
create trigger booking_capacity_reservations_updated_at
before update on public.booking_capacity_reservations
for each row execute function public.update_updated_at();

create or replace function public.release_booking_capacity_reservation(p_booking_id uuid)
returns void as $$
begin
  update public.booking_capacity_reservations
     set released_at = now(),
         updated_at = now()
   where booking_id = p_booking_id
     and released_at is null;
end;
$$ language plpgsql;

create or replace function public.reserve_booking_capacity(
  p_booking_id uuid,
  p_location_id uuid,
  p_start_time timestamptz,
  p_occupied_until timestamptz,
  p_capacity integer
)
returns table(success boolean, seat_number integer, error text) as $$
declare
  candidate_seat integer;
begin
  if p_capacity is null or p_capacity < 1 then
    return query select false, null::integer, 'Invalid capacity';
    return;
  end if;

  update public.booking_capacity_reservations
     set released_at = now(),
         updated_at = now()
   where booking_id = p_booking_id
     and released_at is null;

  for candidate_seat in 1..p_capacity loop
    begin
      insert into public.booking_capacity_reservations (
        booking_id,
        location_id,
        seat_number,
        start_time,
        occupied_until,
        released_at
      ) values (
        p_booking_id,
        p_location_id,
        candidate_seat,
        p_start_time,
        p_occupied_until,
        null
      )
      on conflict (booking_id) do update
        set location_id = excluded.location_id,
            seat_number = excluded.seat_number,
            start_time = excluded.start_time,
            occupied_until = excluded.occupied_until,
            released_at = null,
            updated_at = now();

      return query select true, candidate_seat, null::text;
      return;
    exception
      when exclusion_violation then
        continue;
    end;
  end loop;

  return query select false, null::integer, 'No available staff for this time slot';
end;
$$ language plpgsql;

alter table public.booking_drafts enable row level security;
alter table public.booking_waitlist_entries enable row level security;
alter table public.booking_capacity_reservations enable row level security;

drop policy if exists "Authenticated can read own booking drafts" on public.booking_drafts;
create policy "Authenticated can read own booking drafts"
  on public.booking_drafts for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Authenticated can manage own booking drafts" on public.booking_drafts;
create policy "Authenticated can manage own booking drafts"
  on public.booking_drafts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Service role can manage booking drafts" on public.booking_drafts;
create policy "Service role can manage booking drafts"
  on public.booking_drafts for all to service_role using (true) with check (true);

drop policy if exists "Authenticated can read booking waitlist" on public.booking_waitlist_entries;
create policy "Authenticated can read booking waitlist"
  on public.booking_waitlist_entries for select to authenticated using (true);

drop policy if exists "Authenticated can manage booking waitlist" on public.booking_waitlist_entries;
create policy "Authenticated can manage booking waitlist"
  on public.booking_waitlist_entries for all to authenticated using (true) with check (true);

drop policy if exists "Service role can manage booking waitlist" on public.booking_waitlist_entries;
create policy "Service role can manage booking waitlist"
  on public.booking_waitlist_entries for all to service_role using (true) with check (true);

drop policy if exists "Authenticated can read booking capacity reservations" on public.booking_capacity_reservations;
create policy "Authenticated can read booking capacity reservations"
  on public.booking_capacity_reservations for select to authenticated using (true);

drop policy if exists "Authenticated can manage booking capacity reservations" on public.booking_capacity_reservations;
create policy "Authenticated can manage booking capacity reservations"
  on public.booking_capacity_reservations for all to authenticated using (true) with check (true);

drop policy if exists "Service role can manage booking capacity reservations" on public.booking_capacity_reservations;
create policy "Service role can manage booking capacity reservations"
  on public.booking_capacity_reservations for all to service_role using (true) with check (true);
