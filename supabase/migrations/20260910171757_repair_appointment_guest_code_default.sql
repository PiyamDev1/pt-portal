begin;

alter table public.bookings
  alter column customer_guest_code set default (
    'VISIT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  );

drop function if exists public.generate_customer_appointment_guest_code();

commit;
