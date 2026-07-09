-- Add the manual override flag required by appointment rescheduling and custom time entry.
-- This migration is idempotent so it can be safely re-run.

alter table public.bookings
  add column if not exists manual_override boolean not null default false;

