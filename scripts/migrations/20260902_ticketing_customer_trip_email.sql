-- Link normal Ticketing-ledger journeys to an authenticated customer without exposing them to guest lookup.
alter table public.ticket_bookings
  add column if not exists contact_email text;

alter table public.ticket_bookings
  drop constraint if exists ticket_bookings_contact_email_check;
alter table public.ticket_bookings
  add constraint ticket_bookings_contact_email_check
  check (
    contact_email is null
    or (
      contact_email = lower(btrim(contact_email))
      and length(contact_email) between 3 and 254
      and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    )
  );

create index if not exists ticket_bookings_contact_email_active_idx
  on public.ticket_bookings (lower(contact_email), departure_date, id)
  where contact_email is not null and archived_at is null;

comment on column public.ticket_bookings.contact_email is
  'Optional normalized customer email used only to show this ticket to the same authenticated customer portal account.';

