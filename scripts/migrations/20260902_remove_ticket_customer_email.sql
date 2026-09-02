-- Remove the short-lived email-based ticket linking design.
-- Normal ticket access now verifies PNR plus passenger last name at request time.
drop index if exists public.ticket_bookings_contact_email_active_idx;

alter table public.ticket_bookings
  drop constraint if exists ticket_bookings_contact_email_check;

alter table public.ticket_bookings
  drop column if exists contact_email;

