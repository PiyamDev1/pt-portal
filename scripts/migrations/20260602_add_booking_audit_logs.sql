-- Booking audit trail for amendments, cancellations, and creations.
create table if not exists public.booking_audit_logs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  action_type text not null,
  actor_identifier text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_booking_audit_logs_booking_created
  on public.booking_audit_logs (booking_id, created_at desc);

create index if not exists idx_booking_audit_logs_location_created
  on public.booking_audit_logs (location_id, created_at desc);
