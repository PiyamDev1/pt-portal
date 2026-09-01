\set ON_ERROR_STOP on

do $gateway_structure$
declare
  relation_name text;
  rls_enabled boolean;
begin
  foreach relation_name in array array[
    'customer_integration_nonces',
    'customer_integration_idempotency',
    'customer_portal_resource_aliases',
    'customer_portal_access_grants',
    'customer_portal_otp_challenges',
    'customer_portal_availability_slots',
    'customer_portal_trip_invitations',
    'customer_portal_audit_events',
    'customer_loyalty_awards',
    'customer_loyalty_source_links',
    'customer_loyalty_service_states',
    'customer_loyalty_service_events',
    'customer_loyalty_lifecycle_events'
  ]
  loop
    if to_regclass(format('public.%I', relation_name)) is null then
      raise exception 'Required customer portal relation is missing: %', relation_name;
    end if;
    select class_row.relrowsecurity
      into rls_enabled
    from pg_class class_row
    where class_row.oid = to_regclass(format('public.%I', relation_name));
    if not rls_enabled then
      raise exception 'RLS is disabled on customer portal relation: %', relation_name;
    end if;
  end loop;

  if not has_table_privilege(
    'service_role', 'public.customer_integration_nonces', 'SELECT'
  ) or not has_table_privilege(
    'service_role', 'public.customer_integration_nonces', 'INSERT'
  ) or has_table_privilege(
    'authenticated', 'public.customer_integration_nonces', 'SELECT'
  ) or has_table_privilege(
    'anon', 'public.customer_portal_access_grants', 'SELECT'
  ) then
    raise exception 'Customer integration gateway table ACL is not service-only';
  end if;

  if not has_table_privilege(
    'service_role', 'public.customer_loyalty_awards', 'SELECT'
  ) or has_table_privilege(
    'service_role', 'public.customer_loyalty_awards', 'INSERT'
  ) or has_table_privilege(
    'authenticated', 'public.customer_loyalty_awards', 'SELECT'
  ) then
    raise exception 'Customer loyalty award ACL bypasses the lifecycle boundary';
  end if;

  if has_function_privilege(
    'service_role',
    'public.customer_loyalty_award_pending(uuid,text,text,text,integer,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'public.customer_loyalty_award_activate(text)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'public.customer_loyalty_award_reverse(text,text,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.customer_loyalty_register_code_source_v1(text,text,text,uuid,text,integer)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.customer_loyalty_record_service_event_v1(text,uuid,text,text,timestamptz)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.customer_loyalty_register_code_source_v1(text,text,text,uuid,text,integer)',
    'EXECUTE'
  ) then
    raise exception 'Customer loyalty function ACL bypasses the source-aware API';
  end if;
end
$gateway_structure$;

do $gateway_runtime$
declare
  existing_reference text;
  generated_reference text;
  existing_version integer;
  audit_id bigint;
  audit_rejected boolean := false;
  replay_rejected boolean := false;
begin
  select customer_public_reference, customer_version
    into existing_reference, existing_version
  from public.bookings
  where id = '30000000-0000-0000-0000-000000000001';
  if existing_reference !~ '^APT-[0-9A-F]{16}$' or existing_version <> 1 then
    raise exception 'Existing appointment reference/version was not backfilled safely';
  end if;

  insert into public.bookings (id, contact_name)
  values ('30000000-0000-0000-0000-000000000002', 'New customer')
  returning customer_public_reference into generated_reference;
  if generated_reference !~ '^APT-[0-9A-F]{16}$'
    or generated_reference = existing_reference
  then
    raise exception 'Appointment reference generator is invalid or repeated';
  end if;

  update public.bookings
  set customer_subject = 'customer-subject-1'
  where id = '30000000-0000-0000-0000-000000000001';
  if (
    select customer_version
    from public.bookings
    where id = '30000000-0000-0000-0000-000000000001'
  ) <> 2 then
    raise exception 'Appointment optimistic-concurrency version did not advance';
  end if;

  insert into public.customer_integration_nonces (
    key_id, nonce, request_id, expires_at
  ) values (
    'integration-v1', 'nonce-00000001', 'request-00000001',
    clock_timestamp() + interval '5 minutes'
  );
  begin
    insert into public.customer_integration_nonces (
      key_id, nonce, request_id, expires_at
    ) values (
      'integration-v1', 'nonce-00000001', 'request-00000002',
      clock_timestamp() + interval '5 minutes'
    );
  exception when unique_violation then
    replay_rejected := true;
  end;
  if not replay_rejected then
    raise exception 'Customer integration nonce replay was accepted';
  end if;

  insert into public.customer_portal_audit_events (
    request_id, event_type, actor_kind, outcome
  ) values (
    'request-00000003', 'integration.test', 'system', 'success'
  ) returning id into audit_id;
  begin
    update public.customer_portal_audit_events
    set outcome = 'error'
    where id = audit_id;
  exception when raise_exception then
    audit_rejected := true;
  end;
  if not audit_rejected then
    raise exception 'Customer portal audit event was mutable';
  end if;
end
$gateway_runtime$;

insert into public.mobile_users (
  id, external_customer_subject, customer_code, customer_lifecycle_status
) values (
  '40000000-0000-0000-0000-000000000001',
  'customer-subject-1',
  'PYM-7K4M-9Q2D-H',
  'active'
);

insert into public.ticket_bookings (id, commission_scope)
values ('50000000-0000-0000-0000-000000000001', 'ticket');

insert into public.ticket_transactions (
  id, booking_id, service_type, operational_status, payment_status
) values (
  '51000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'TK', 'held', 'unpaid'
);

set role service_role;
select public.customer_loyalty_register_code_source_v1(
  'PYM-7K4M-9Q2D-H',
  'ticket',
  null,
  '51000000-0000-0000-0000-000000000001',
  'Test issued ticket',
  120
);
-- An identical registration must return the same pending award, not duplicate it.
select public.customer_loyalty_register_code_source_v1(
  'PYM-7K4M-9Q2D-H',
  'ticket',
  null,
  '51000000-0000-0000-0000-000000000001',
  'Test issued ticket',
  120
);
reset role;

do $ticket_pending$
begin
  if (
    select count(*) = 1 and bool_and(state = 'pending')
    from public.customer_loyalty_awards
    where source_reference = 'ticket.v1:51000000-0000-0000-0000-000000000001'
  ) is not true then
    raise exception 'Ticket award was not created exactly once as pending';
  end if;
  if exists (
    select 1
    from public.loyalty_points_ledger
    where customer_source_reference = 'ticket.v1:51000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Pending ticket award leaked into the available legacy ledger';
  end if;
end
$ticket_pending$;

update public.ticket_transactions
set operational_status = 'issued', payment_status = 'paid'
where id = '51000000-0000-0000-0000-000000000001';

do $ticket_available$
begin
  if (
    select state
    from public.customer_loyalty_awards
    where source_reference = 'ticket.v1:51000000-0000-0000-0000-000000000001'
  ) <> 'available' then
    raise exception 'Issued-and-paid ticket award did not activate';
  end if;
  if (
    select count(*) = 1
      and sum(points_change) = 120
      and bool_and(transaction_type = 'Earned')
    from public.loyalty_points_ledger
    where customer_source_reference = 'ticket.v1:51000000-0000-0000-0000-000000000001'
  ) is not true then
    raise exception 'Available ticket points were not projected idempotently';
  end if;
end
$ticket_available$;

insert into public.ticket_refunds (id, transaction_id, status)
values (
  '52000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  'requested'
);
update public.ticket_refunds
set status = 'processed'
where id = '52000000-0000-0000-0000-000000000001';

do $ticket_reversed$
declare
  original_award_id uuid;
begin
  select id into original_award_id
  from public.customer_loyalty_awards
  where source_reference = 'ticket.v1:51000000-0000-0000-0000-000000000001';

  if (
    select state
    from public.customer_loyalty_awards
    where id = original_award_id
  ) <> 'reversed' then
    raise exception 'Refunded ticket award was not reversed';
  end if;
  if (
    select count(*) = 1
      and bool_and(points = -120 and state = 'reversed' and source_type = 'adjustment')
    from public.customer_loyalty_awards
    where reversal_of = original_award_id
  ) is not true then
    raise exception 'Ticket reversal award was missing or duplicated';
  end if;
  if (
    select count(*) = 2 and sum(points_change) = 0
    from public.loyalty_points_ledger
    where customer_source_reference in (
      'ticket.v1:51000000-0000-0000-0000-000000000001',
      'ticket.v1:51000000-0000-0000-0000-000000000001:reversal.v1'
    )
  ) is not true then
    raise exception 'Ticket reversal did not net the legacy ledger to zero exactly once';
  end if;
  if (
    select count(*)
    from public.customer_loyalty_lifecycle_events
    where source_reference = 'ticket.v1:51000000-0000-0000-0000-000000000001'
  ) <> 3 then
    raise exception 'Ticket lifecycle did not record one pending/activated/reversed event';
  end if;
end
$ticket_reversed$;

insert into public.travel_packages (id, status, payment_status)
values ('60000000-0000-0000-0000-000000000001', 'active', 'partial');

set role service_role;
select public.customer_loyalty_register_code_source_v1(
  'PYM-7K4M-9Q2D-H',
  'package',
  null,
  '60000000-0000-0000-0000-000000000001',
  'Test package',
  250
);
reset role;

update public.travel_packages
set payment_status = 'paid'
where id = '60000000-0000-0000-0000-000000000001';
update public.travel_packages
set status = 'cancelled'
where id = '60000000-0000-0000-0000-000000000001';

do $package_lifecycle$
begin
  if (
    select state
    from public.customer_loyalty_awards
    where source_reference = 'package.v1:60000000-0000-0000-0000-000000000001'
  ) <> 'reversed' then
    raise exception 'Fully-paid then cancelled package did not reverse';
  end if;
  if (
    select count(*) = 2 and sum(points_change) = 0
    from public.loyalty_points_ledger
    where customer_source_reference in (
      'package.v1:60000000-0000-0000-0000-000000000001',
      'package.v1:60000000-0000-0000-0000-000000000001:reversal.v1'
    )
  ) is not true then
    raise exception 'Package activation/reversal ledger invariant failed';
  end if;
end
$package_lifecycle$;

set role service_role;
select public.customer_loyalty_register_code_source_v1(
  'PYM-7K4M-9Q2D-H',
  'service',
  'visa',
  '70000000-0000-0000-0000-000000000001',
  'Test completed service',
  80
);
select public.customer_loyalty_record_service_event_v1(
  'visa', '70000000-0000-0000-0000-000000000001',
  'service-event-completed-1', 'completed', clock_timestamp()
);
select public.customer_loyalty_record_service_event_v1(
  'visa', '70000000-0000-0000-0000-000000000001',
  'service-event-paid-1', 'paid', clock_timestamp()
);
select public.customer_loyalty_record_service_event_v1(
  'visa', '70000000-0000-0000-0000-000000000001',
  'service-event-refunded-1', 'refunded', clock_timestamp()
);
-- Delivery retries with the same event reference must remain idempotent.
select public.customer_loyalty_record_service_event_v1(
  'visa', '70000000-0000-0000-0000-000000000001',
  'service-event-refunded-1', 'refunded', clock_timestamp()
);
reset role;

do $service_lifecycle$
begin
  if (
    select state
    from public.customer_loyalty_awards
    where source_reference = 'service.v1:visa:70000000-0000-0000-0000-000000000001'
  ) <> 'reversed' then
    raise exception 'Completed-and-paid then refunded service did not reverse';
  end if;
  if (
    select count(*)
    from public.customer_loyalty_service_events
    where source_namespace = 'visa'
      and source_record_id = '70000000-0000-0000-0000-000000000001'
  ) <> 3 then
    raise exception 'Service event retry created duplicate evidence';
  end if;
  if (
    select count(*) = 2 and sum(points_change) = 0
    from public.loyalty_points_ledger
    where customer_source_reference in (
      'service.v1:visa:70000000-0000-0000-0000-000000000001',
      'service.v1:visa:70000000-0000-0000-0000-000000000001:reversal.v1'
    )
  ) is not true then
    raise exception 'Service activation/reversal ledger invariant failed';
  end if;
end
$service_lifecycle$;

select 'customer portal integration and loyalty lifecycle assertions passed' as result;
