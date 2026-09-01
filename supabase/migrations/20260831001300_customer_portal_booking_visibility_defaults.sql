begin;

alter table public.booking_services
  alter column customer_visible set default false;

update public.booking_services
set customer_visible = false
where customer_visible
  and location_id is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'booking_services_customer_visible_requires_location'
      and conrelid = 'public.booking_services'::regclass
  ) then
    alter table public.booking_services
      add constraint booking_services_customer_visible_requires_location
      check (not customer_visible or location_id is not null);
  end if;
end
$$;

commit;
