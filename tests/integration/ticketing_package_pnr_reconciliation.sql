-- Integration assertions for Ticketing capability 2026082902.

insert into public.ticket_bookings (
  id, owner_employee_id, location_id, airline_id, pnr, customer_name, booking_date,
  operational_status, payment_status, package_match_status, commission_scope, created_by, updated_by
)
values
  (
    '92000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    'late pkg 1',
    'Late Package Match',
    '2026-08-29',
    'draft',
    'unpaid',
    'unmatched',
    'ticket',
    '40000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001'
  ),
  (
    '92000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    'ambig pkg 1',
    'Ambiguous Package Match',
    '2026-08-29',
    'draft',
    'unpaid',
    'unmatched',
    'ticket',
    '40000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001'
  );

insert into public.travel_packages (id, package_reference, package_type, status)
values
  ('93000000-0000-0000-0000-000000000001', 'PKG-LATE-1', 'holiday', 'selected'),
  ('93000000-0000-0000-0000-000000000002', 'PKG-AMBIG-1', 'umrah', 'selected'),
  ('93000000-0000-0000-0000-000000000003', 'PKG-AMBIG-2', 'ziyarat', 'selected');

-- Entering a flight PNR in Packages after the ticket exists must classify the ticket immediately.
insert into public.travel_package_reservations (
  id, package_id, reservation_type, booking_reference, status
)
values (
  '94000000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000001',
  'flight',
  ' LATEPKG1 ',
  'confirmed'
);

do $$
begin
  if not exists (
    select 1
    from public.ticket_bookings booking
    join public.ticket_package_links link on link.booking_id = booking.id
    where booking.id = '92000000-0000-0000-0000-000000000001'
      and booking.package_match_status = 'matched'
      and booking.commission_scope = 'package'
      and link.package_id = '93000000-0000-0000-0000-000000000001'
      and link.reservation_id = '94000000-0000-0000-0000-000000000001'
      and link.match_status = 'matched'
      and link.resolution_method = 'automatic'
      and link.retired_at is null
  ) then
    raise exception 'Late package reservation PNR did not classify the existing ticket';
  end if;

  if not exists (
    select 1 from public.ticket_audit_events audit
    where audit.booking_id = '92000000-0000-0000-0000-000000000001'
      and audit.action = 'auto_reconcile_package_pnr'
      and audit.after_state ->> 'commission_scope' = 'package'
  ) then
    raise exception 'Late package PNR classification did not record audit evidence';
  end if;
end
$$;

-- Changing package PNR evidence retires the old link and reclassifies without blocking Packages.
update public.travel_package_reservations
set booking_reference = 'OTHER-PNR'
where id = '94000000-0000-0000-0000-000000000001';

do $$
begin
  if not exists (
    select 1 from public.ticket_bookings
    where id = '92000000-0000-0000-0000-000000000001'
      and package_match_status = 'unmatched'
      and commission_scope = 'ticket'
  ) or exists (
    select 1 from public.ticket_package_links
    where booking_id = '92000000-0000-0000-0000-000000000001'
      and retired_at is null
  ) then
    raise exception 'Changing a package reservation PNR did not retire package classification';
  end if;
end
$$;

update public.travel_package_reservations
set booking_reference = 'late pkg 1'
where id = '94000000-0000-0000-0000-000000000001';

update public.travel_packages
set status = 'archived'
where id = '93000000-0000-0000-0000-000000000001';

do $$
begin
  if not exists (
    select 1 from public.ticket_bookings
    where id = '92000000-0000-0000-0000-000000000001'
      and package_match_status = 'unmatched'
      and commission_scope = 'ticket'
  ) then
    raise exception 'Archived package still classified a ticket as a package item';
  end if;
end
$$;

update public.travel_packages
set status = 'selected'
where id = '93000000-0000-0000-0000-000000000001';

-- Two unrelated packages with the same PNR remain unresolved until package grouping proves they
-- are one operational package group.
insert into public.travel_package_reservations (
  id, package_id, reservation_type, booking_reference, status
)
values
  (
    '94000000-0000-0000-0000-000000000002',
    '93000000-0000-0000-0000-000000000002',
    'flight',
    'AMBIGPKG1',
    'confirmed'
  ),
  (
    '94000000-0000-0000-0000-000000000003',
    '93000000-0000-0000-0000-000000000003',
    'flight',
    ' ambig pkg 1 ',
    'confirmed'
  );

do $$
begin
  if not exists (
    select 1 from public.ticket_bookings
    where id = '92000000-0000-0000-0000-000000000002'
      and package_match_status = 'ambiguous'
      and commission_scope = 'unresolved'
  ) or (
    select count(*) from public.ticket_package_links
    where booking_id = '92000000-0000-0000-0000-000000000002'
      and match_status = 'ambiguous'
      and retired_at is null
  ) <> 2 then
    raise exception 'Unrelated duplicate package PNRs were not held as ambiguous';
  end if;
end
$$;

insert into public.travel_package_groups (id, group_reference, status)
values ('95000000-0000-0000-0000-000000000001', 'GROUP-LATE-PNR', 'active');

insert into public.travel_package_group_members (
  id, group_id, package_id, is_lead_family, sort_order
)
values
  (
    '96000000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000002',
    true,
    0
  ),
  (
    '96000000-0000-0000-0000-000000000002',
    '95000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000003',
    false,
    1
  );

do $$
begin
  if not exists (
    select 1
    from public.ticket_bookings booking
    join public.ticket_package_links link on link.booking_id = booking.id
    where booking.id = '92000000-0000-0000-0000-000000000002'
      and booking.package_match_status = 'matched'
      and booking.commission_scope = 'package'
      and link.match_status = 'matched'
      and link.group_id = '95000000-0000-0000-0000-000000000001'
      and link.retired_at is null
  ) then
    raise exception 'Late package grouping did not resolve same-PNR packages as one package item';
  end if;
end
$$;

update public.travel_package_groups
set status = 'archived'
where id = '95000000-0000-0000-0000-000000000001';

do $$
begin
  if not exists (
    select 1 from public.ticket_bookings
    where id = '92000000-0000-0000-0000-000000000002'
      and package_match_status = 'ambiguous'
      and commission_scope = 'unresolved'
  ) then
    raise exception 'Inactive package group still resolved unrelated package candidates';
  end if;
end
$$;

update public.travel_package_groups
set status = 'active'
where id = '95000000-0000-0000-0000-000000000001';

do $$
begin
  if public.ticketing_schema_status() ->> 'ready' <> 'true'
    or public.ticketing_schema_status() ->> 'version' <> '2026082902'
    or has_function_privilege(
      'authenticated',
      'public.ticketing_reconcile_package_booking_2026082902(uuid)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.ticketing_reconcile_package_booking_2026082902(uuid)',
      'EXECUTE'
    )
  then
    raise exception 'Package PNR reconciliation readiness or grants are incorrect';
  end if;
end
$$;
