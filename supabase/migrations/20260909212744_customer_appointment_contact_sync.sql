begin;

create or replace function public.generate_customer_appointment_guest_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'VISIT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
$$;

alter table public.bookings
  add column if not exists customer_guest_code text;
update public.bookings
set customer_guest_code = public.generate_customer_appointment_guest_code()
where customer_guest_code is null;
alter table public.bookings
  alter column customer_guest_code set default public.generate_customer_appointment_guest_code(),
  alter column customer_guest_code set not null;
create unique index if not exists bookings_customer_guest_code_uq
  on public.bookings(customer_guest_code);

revoke all on function public.generate_customer_appointment_guest_code()
  from public, anon, authenticated, service_role;

commit;
