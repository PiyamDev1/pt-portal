\set ON_ERROR_STOP on

do $$
declare
  status_value jsonb;
begin
  status_value := public.ticketing_schema_status();
  if (status_value ->> 'ready')::boolean is not true
    or (status_value ->> 'version')::bigint <> 2026082304
    or (status_value ->> 'requiredVersion')::bigint <> 2026082304
    or not (status_value #> '{details,capabilities}' ?& array[
      'atomic-dc-rer-entry',
      'root-transaction-lineage',
      'affected-passenger-quantity-guard',
      'target-safe-service-events',
      'service-transaction-payment',
      'rer-monotonic-chronology',
      'serialized-service-lineage',
      'unique-issued-reissue-successor',
      'service-business-date-responses',
      'immutable-service-replay-dates',
      'historical-reissue-lineage',
      'unique-historical-reissue-successor',
      'immutable-completed-idempotency'
    ])
  then
    raise exception 'DC/R-ER capability is incorrect: %', status_value;
  end if;

  if not has_function_privilege(
    'service_role',
    'public.ticketing_append_service_transaction(uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.ticketing_append_service_transaction(uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.ticketing_append_service_transaction(uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'DC/R-ER append RPC grants are incorrect';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.ticketing_mark_service_transaction_paid(uuid,uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.ticketing_mark_service_transaction_paid(uuid,uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.ticketing_mark_service_transaction_paid(uuid,uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'DC/R-ER payment RPC grants are incorrect';
  end if;

  if position(
    'pg_advisory_xact_lock'
    in pg_get_functiondef(
      'public.ticketing_append_service_transaction_core_2026082303(uuid,uuid,text,jsonb)'::regprocedure
    )
  ) = 0 or position(
    'for update'
    in lower(pg_get_functiondef(
      'public.ticketing_append_service_transaction_core_2026082303(uuid,uuid,text,jsonb)'::regprocedure
    ))
  ) = 0 then
    raise exception 'DC/R-ER append RPC lacks retry and optimistic locks';
  end if;

  if position(
    'pg_advisory_xact_lock'
    in pg_get_functiondef(
      'public.ticketing_mark_service_transaction_paid_core_2026082303(uuid,uuid,uuid,text,jsonb)'::regprocedure
    )
  ) = 0 or position(
    'for update'
    in lower(pg_get_functiondef(
      'public.ticketing_mark_service_transaction_paid_core_2026082303(uuid,uuid,uuid,text,jsonb)'::regprocedure
    ))
  ) = 0 then
    raise exception 'DC/R-ER payment RPC lacks retry and optimistic locks';
  end if;

  if has_function_privilege(
      'service_role',
      'public.ticketing_append_service_transaction_core_2026082303(uuid,uuid,text,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'public.ticketing_mark_service_transaction_paid_core_2026082303(uuid,uuid,uuid,text,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'public.ticketing_enrich_service_business_dates_2026082304(uuid,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'public.ticketing_transaction_has_been_issued_2026082304(text,timestamptz)',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'public.protect_completed_ticket_idempotency_2026082304()',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'public.validate_ticket_service_transaction_lineage_2026082304()',
      'EXECUTE'
    )
    or position(
      'ticketing_enrich_service_business_dates_2026082304'
      in pg_get_functiondef(
        'public.ticketing_append_service_transaction(uuid,uuid,text,jsonb)'::regprocedure
      )
    ) = 0
    or position(
      'ticketing_enrich_service_business_dates_2026082304'
      in pg_get_functiondef(
        'public.ticketing_mark_service_transaction_paid(uuid,uuid,uuid,text,jsonb)'::regprocedure
      )
    ) = 0
  then
    raise exception 'DC/R-ER response adapters or internal-core grants are incorrect';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'ticket_transactions'
      and indexname = 'ticket_transactions_one_historical_rer_successor_idx'
      and indexdef ilike 'create unique index%'
      and indexdef ilike '%cancelled%'
      and indexdef ilike '%part_refunded%'
      and indexdef ilike '%refunded%'
  ) or exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'ticket_transactions_one_issued_rer_successor_idx'
  ) then
    raise exception 'Historical R-ER unique-successor backstop is incorrect';
  end if;

  if position(
    'for update of booking'
    in lower(pg_get_functiondef(
      'public.validate_ticket_service_transaction_lineage_2026082304()'::regprocedure
    ))
  ) = 0 or position(
    'ticketing_reissue_chain_conflict'
    in lower(pg_get_functiondef(
      'public.validate_ticket_service_transaction_lineage_2026082304()'::regprocedure
    ))
  ) = 0 or position(
    'ticketing_transaction_has_been_issued_2026082304'
    in lower(pg_get_functiondef(
      'public.validate_ticket_service_transaction_lineage_2026082304()'::regprocedure
    ))
  ) = 0 or not exists (
    select 1
    from pg_trigger trigger_row
    join pg_proc procedure_row on procedure_row.oid = trigger_row.tgfoid
    where trigger_row.tgrelid = 'public.ticket_transactions'::regclass
      and trigger_row.tgname = 'ticket_transactions_validate_service_lineage'
      and procedure_row.proname = 'validate_ticket_service_transaction_lineage_2026082304'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'R-ER lineage trigger lacks historical serialized enforcement';
  end if;

  if position(
      'stored_transaction'
      in lower(pg_get_functiondef(
        'public.ticketing_enrich_service_business_dates_2026082304(uuid,jsonb)'::regprocedure
      ))
    ) = 0
    or position(
      'source_fact_key'
      in lower(pg_get_functiondef(
        'public.ticketing_enrich_service_business_dates_2026082304(uuid,jsonb)'::regprocedure
      ))
    ) = 0
  then
    raise exception 'Service replay adapter does not use immutable stored response facts';
  end if;

  if not exists (
      select 1
      from pg_proc procedure_row
      where procedure_row.oid = to_regprocedure(
        'public.validate_ticket_service_transaction_lineage()'
      )
        and procedure_row.prokind = 'p'
    )
    or not exists (
      select 1
      from pg_proc procedure_row
      where procedure_row.oid = to_regprocedure(
        'public.ticketing_enrich_service_business_dates_2026082303(uuid,jsonb)'
      )
        and procedure_row.prokind = 'p'
    )
    or has_function_privilege(
      'service_role',
      'public.validate_ticket_service_transaction_lineage()',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'public.ticketing_enrich_service_business_dates_2026082303(uuid,jsonb)',
      'EXECUTE'
    )
  then
    raise exception 'Historical migration routine tombstones are incorrect';
  end if;

  if not exists (
      select 1
      from pg_trigger trigger_row
      where trigger_row.tgrelid = 'public.ticket_idempotency_keys'::regclass
        and trigger_row.tgname = 'ticket_idempotency_keys_protect_completed_2304'
        and not trigger_row.tgisinternal
    )
    or not exists (
      select 1
      from pg_constraint constraint_row
      where constraint_row.conrelid = 'public.ticket_idempotency_keys'::regclass
        and constraint_row.conname = 'ticket_idempotency_keys_completion_pair_check'
    )
  then
    raise exception 'Completed idempotency immutability boundary is missing';
  end if;

  if not has_table_privilege(
      'service_role', 'public.ticket_idempotency_keys', 'SELECT'
    )
    or has_table_privilege(
      'service_role', 'public.ticket_idempotency_keys', 'INSERT'
    )
    or has_table_privilege(
      'service_role', 'public.ticket_idempotency_keys', 'UPDATE'
    )
    or has_table_privilege(
      'service_role', 'public.ticket_idempotency_keys', 'DELETE'
    )
  then
    raise exception 'Service role can mutate Ticketing idempotency facts directly';
  end if;
end
$$;

set role service_role;
do $$
begin
  begin
    update public.ticket_idempotency_keys
    set response_payload = response_payload
    where completed_at is not null;
    raise exception 'Service role mutated completed Ticketing idempotency facts directly';
  exception when insufficient_privilege then
    null;
  end;
end
$$;
reset role;

insert into public.travel_packages (id, package_reference, package_type, status)
values ('60000000-0000-0000-0000-000000000020', 'PKG-SERVICE-1', 'umrah', 'selected');

insert into public.travel_package_reservations (
  id,
  package_id,
  reservation_type,
  booking_reference,
  status
) values (
  '70000000-0000-0000-0000-000000000020',
  '60000000-0000-0000-0000-000000000020',
  'flight',
  'PKG-SVC2',
  'confirmed'
);

-- Package-linked service movements retain package scope in both issuance and
-- payment facts; Ticketing still publishes variables rather than a result.
do $$
declare
  created jsonb;
  appended jsonb;
  booking_id_value uuid;
  root_transaction_id_value uuid;
  transaction_id_value uuid;
  source_event record;
begin
  created := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'service-package-root',
    jsonb_build_object(
      'customerName', 'Package Service Customer',
      'pnr', 'PKG-SVC2',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-23',
      'timeLimitAt', null,
      'issuedAt', '2026-08-23',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'quantity', 2, 'unitSupplierCost', 250),
        jsonb_build_object('passengerType', 'INF', 'quantity', 1, 'unitSupplierCost', 50)
      )
    )
  );

  booking_id_value := (created #>> '{booking,id}')::uuid;
  root_transaction_id_value := (created #>> '{transaction,id}')::uuid;

  appended := public.ticketing_append_service_transaction(
    '40000000-0000-0000-0000-000000000001',
    booking_id_value,
    'service-package-dc',
    jsonb_build_object(
      'expectedBookingVersion', (created #>> '{booking,version}')::bigint,
      'expectedRootTransactionVersion', (created #>> '{transaction,version}')::bigint,
      'serviceType', 'DC',
      'bookingDate', '2026-08-23',
      'issuedAt', '2026-08-24',
      'paymentStatus', 'paid',
      'paidAt', '2026-08-23',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT', 'quantity', 2,
          'unitSupplierCost', 10, 'unitSalePrice', 35
        )
      )
    )
  );
  transaction_id_value := (appended #>> '{transaction,id}')::uuid;

  if appended #>> '{packageMatch,status}' <> 'matched'
    or appended #>> '{packageMatch,scope}' <> 'package'
    or appended #>> '{transaction,bookingDate}' <> '2026-08-23'
    or appended #>> '{transaction,issuedOn}' <> '2026-08-24'
    or appended #>> '{transaction,paidOn}' <> '2026-08-23'
    or appended #>> '{packageMatch,packageId}'
      <> '60000000-0000-0000-0000-000000000020'
    or appended #>> '{packageMatch,reservationId}'
      <> '70000000-0000-0000-0000-000000000020'
    or jsonb_array_length(appended -> 'sourceEvents') <> 2
    or appended ?| array['commission', 'profit', 'margin', 'earnings']
  then
    raise exception 'Package DC response lost package scope or exposed calculated output: %', appended;
  end if;

  for source_event in
    select event_type, variables
    from public.commission_source_events
    where source_record_id = transaction_id_value
    order by event_type
  loop
    if source_event.event_type not in ('ticket_date_changed', 'ticket_paid')
      or source_event.variables ->> 'commission_scope' <> 'package'
      or source_event.variables ->> 'package_id'
        <> '60000000-0000-0000-0000-000000000020'
      or source_event.variables ->> 'reservation_id'
        <> '70000000-0000-0000-0000-000000000020'
      or source_event.variables ->> 'parent_transaction_id'
        <> root_transaction_id_value::text
      or source_event.variables ?| array[
        'commission', 'commission_amount', 'agent_commission', 'earnings', 'profit', 'margin'
      ]
    then
      raise exception 'Package service source fact is incorrect: %, %',
        source_event.event_type, source_event.variables;
    end if;
  end loop;

  if (select count(*) from public.commission_source_events
      where source_record_id = transaction_id_value) <> 2
    or (select commission_scope from public.ticket_bookings where id = booking_id_value)
      <> 'package'
  then
    raise exception 'Package DC did not retain exactly two package-scoped source facts';
  end if;
end
$$;

set role authenticated;
do $$
begin
  begin
    perform public.ticketing_append_service_transaction(
      '40000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000001',
      'authenticated-service-bypass',
      '{}'::jsonb
    );
    raise exception 'authenticated executed the server-only DC/R-ER append RPC';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.ticketing_mark_service_transaction_paid(
      '40000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000001',
      '81000000-0000-0000-0000-000000000001',
      'authenticated-service-payment-bypass',
      '{}'::jsonb
    );
    raise exception 'authenticated executed the server-only DC/R-ER payment RPC';
  exception when insufficient_privilege then
    null;
  end;
end
$$;
reset role;

-- Root fixture: child movements are aggregate fare/service entries. They do
-- not allocate individual passengers and do not claim itinerary completeness.
do $$
declare
  created jsonb;
begin
  created := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'service-root-create',
    jsonb_build_object(
      'customerName', 'Service Movement Customer',
      'pnr', 'SVC-U1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-23',
      'timeLimitAt', null,
      'issuedAt', '2026-08-23',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'quantity', 2, 'unitSupplierCost', 100),
        jsonb_build_object('passengerType', 'CHD', 'quantity', 1, 'unitSupplierCost', 75)
      )
    )
  );

  if created #>> '{transaction,passengerTicketCount}' <> '3' then
    raise exception 'DC/R-ER root fixture was not created';
  end if;
end
$$;

-- Append an Unpaid DC, replay it, prove the root row remains unchanged, and
-- ensure only a target-safe service event is emitted.
do $$
declare
  booking_id_value uuid;
  root_transaction_id_value uuid;
  root_before jsonb;
  root_after jsonb;
  booking_version_value bigint;
  root_version_value bigint;
  entry_value jsonb;
  first_result jsonb;
  replay_result jsonb;
  child_transaction_id_value uuid;
  source_variables jsonb;
  stored_response jsonb;
  error_hint text;
begin
  select booking.id, root.id, booking.version, root.version, to_jsonb(root)
  into
    booking_id_value,
    root_transaction_id_value,
    booking_version_value,
    root_version_value,
    root_before
  from public.ticket_bookings booking
  join public.ticket_transactions root
    on root.booking_id = booking.id
    and root.service_type = 'TK'
    and root.parent_transaction_id is null
  where booking.normalized_pnr = 'SVC-U1';

  entry_value := jsonb_build_object(
    'expectedBookingVersion', booking_version_value,
    'expectedRootTransactionVersion', root_version_value,
    'serviceType', 'DC',
    'bookingDate', '2026-08-24',
    'issuedAt', '2026-08-25',
    'paymentStatus', 'unpaid',
    'paidAt', null,
    'currency', 'GBP',
    'fares', jsonb_build_array(
      jsonb_build_object(
        'passengerType', 'CHD', 'quantity', 1,
        'unitSupplierCost', 5, 'unitSalePrice', 20
      ),
      jsonb_build_object(
        'passengerType', 'ADT', 'quantity', 1,
        'unitSupplierCost', 10, 'unitSalePrice', 30
      )
    )
  );

  first_result := public.ticketing_append_service_transaction(
    '40000000-0000-0000-0000-000000000001',
    booking_id_value,
    'service-dc-unpaid',
    entry_value
  );

  -- Simulate a response persisted by pre-2303 live code. The public wrapper
  -- must restore explicit branch dates without changing replay semantics.
  update public.ticket_idempotency_keys
  set response_payload = response_payload
    #- '{transaction,bookingDate}'
    #- '{transaction,issuedOn}'
    #- '{transaction,paidOn}'
  where action_name = 'ticketing.append_service_transaction.v1'
    and actor_employee_id = '40000000-0000-0000-0000-000000000001'
    and idempotency_key = 'service-dc-unpaid';

  replay_result := public.ticketing_append_service_transaction(
    '40000000-0000-0000-0000-000000000001',
    booking_id_value,
    'service-dc-unpaid',
    entry_value
  );

  child_transaction_id_value := (first_result #>> '{transaction,id}')::uuid;
  select source_event.variables
  into source_variables
  from public.commission_source_events source_event
  where source_event.source_record_id = child_transaction_id_value
    and source_event.event_type = 'ticket_date_changed';

  select to_jsonb(root)
  into root_after
  from public.ticket_transactions root
  where root.id = root_transaction_id_value;

  if first_result #>> '{transaction,serviceType}' <> 'DC'
    or first_result #>> '{transaction,parentTransactionId}' <> root_transaction_id_value::text
    or jsonb_typeof(first_result #> '{transaction,supersedesTransactionId}') <> 'null'
    or first_result #>> '{transaction,operationalStatus}' <> 'issued'
    or first_result #>> '{transaction,paymentStatus}' <> 'unpaid'
    or first_result #>> '{transaction,bookingDate}' <> '2026-08-24'
    or first_result #>> '{transaction,issuedOn}' <> '2026-08-25'
    or jsonb_typeof(first_result #> '{transaction,paidOn}') is distinct from 'null'
    or first_result #>> '{transaction,passengerTicketCount}' <> '2'
    or first_result #>> '{transaction,supplierCost}' <> '15.00'
    or first_result #>> '{transaction,salePrice}' <> '50.00'
    or first_result #>> '{sourceEvents,0,eventType}' <> 'ticket_date_changed'
    or jsonb_array_length(first_result -> 'sourceEvents') <> 1
    or (replay_result ->> 'idempotentReplay')::boolean is not true
    or replay_result #>> '{transaction,id}' <> child_transaction_id_value::text
    or replay_result #>> '{transaction,bookingDate}' <> '2026-08-24'
    or replay_result #>> '{transaction,issuedOn}' <> '2026-08-25'
    or jsonb_typeof(replay_result #> '{transaction,paidOn}') is distinct from 'null'
  then
    raise exception 'Unpaid DC response or replay is incorrect: %', first_result;
  end if;

  if root_after is distinct from root_before then
    raise exception 'DC append overwrote the immutable root TK row';
  end if;

  if source_variables ->> 'service_type' <> 'DC'
    or source_variables ->> 'commission_scope' <> 'ticket'
    or source_variables ->> 'parent_transaction_id' <> root_transaction_id_value::text
    or source_variables ->> 'root_transaction_id' <> root_transaction_id_value::text
    or jsonb_typeof(source_variables -> 'supersedes_transaction_id') <> 'null'
    or source_variables ->> 'passenger_ticket_count' <> '2'
    or source_variables ->> 'supplier_cost_gbp' <> '15.00'
    or source_variables ->> 'sale_price_gbp' <> '50.00'
    or source_variables ?| array[
      'commission', 'commission_amount', 'agent_commission', 'earnings', 'profit', 'margin'
    ]
  then
    raise exception 'DC variables contain incomplete lineage/scope or calculated output: %',
      source_variables;
  end if;

  if exists (
    select 1
    from public.commission_source_events source_event
    where source_event.source_record_id = child_transaction_id_value
      and source_event.event_type = 'ticket_issued'
  ) or exists (
    select 1
    from public.ticket_transaction_passengers allocation
    where allocation.transaction_id = child_transaction_id_value
  ) or exists (
    select 1
    from public.ticket_itinerary_sectors sector
    where sector.booking_id = booking_id_value
      and sector.source_transaction_id = child_transaction_id_value
  ) then
    raise exception 'Aggregate DC incorrectly emitted target credit or claimed passenger/itinerary detail';
  end if;

  if (select version from public.ticket_bookings where id = booking_id_value)
      <> booking_version_value + 1
    or (select version from public.ticket_transactions where id = root_transaction_id_value)
      <> root_version_value
    or (select count(*) from public.ticket_transactions where id = child_transaction_id_value) <> 1
    or (select count(*) from public.ticket_audit_events
        where transaction_id = child_transaction_id_value
          and action = 'append_service_transaction') <> 1
    or (select count(*) from public.ticket_idempotency_keys
        where action_name = 'ticketing.append_service_transaction.v1'
          and actor_employee_id = '40000000-0000-0000-0000-000000000001'
          and idempotency_key = 'service-dc-unpaid') <> 1
  then
    raise exception 'DC append left incorrect version/audit/idempotency state';
  end if;

  select response_payload
  into stored_response
  from public.ticket_idempotency_keys
  where action_name = 'ticketing.append_service_transaction.v1'
    and actor_employee_id = '40000000-0000-0000-0000-000000000001'
    and idempotency_key = 'service-dc-unpaid';

  update public.ticket_idempotency_keys
  set response_payload = response_payload #- '{transaction,paymentStatus}'
  where action_name = 'ticketing.append_service_transaction.v1'
    and actor_employee_id = '40000000-0000-0000-0000-000000000001'
    and idempotency_key = 'service-dc-unpaid';

  begin
    perform public.ticketing_append_service_transaction(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      'service-dc-unpaid',
      entry_value
    );
    raise exception 'Replay accepted a stored response without paymentStatus';
  exception when object_not_in_prerequisite_state then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint is distinct from 'TICKETING_CORRECTION_REQUIRED' then
      raise exception 'Corrupt stored response rejection omitted its stable hint';
    end if;
  end;

  update public.ticket_idempotency_keys
  set response_payload = stored_response
  where action_name = 'ticketing.append_service_transaction.v1'
    and actor_employee_id = '40000000-0000-0000-0000-000000000001'
    and idempotency_key = 'service-dc-unpaid';

  begin
    perform public.ticketing_append_service_transaction(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      'service-dc-unpaid',
      jsonb_set(entry_value, '{fares,0,unitSalePrice}', '21'::jsonb)
    );
    raise exception 'Changed DC payload reused an idempotency key';
  exception when invalid_parameter_value then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint is distinct from 'TICKETING_IDEMPOTENCY_CONFLICT' then
      raise exception 'DC idempotency conflict omitted its stable hint';
    end if;
  end;
end
$$;

-- Payment may precede airline issuance, but not the child booking date. The
-- transition emits one payment-state fact and leaves root/booking payment facts
-- alone. Replays and same-state no-ops cannot duplicate that fact.
do $$
declare
  booking_id_value uuid;
  root_transaction_id_value uuid;
  transaction_id_value uuid;
  location_id_value uuid;
  booking_version_value bigint;
  transaction_version_value bigint;
  root_before jsonb;
  payment_value jsonb;
  append_entry_value jsonb;
  first_result jsonb;
  replay_result jsonb;
  noop_result jsonb;
  append_replay_after_lifecycle jsonb;
  payment_replay_after_lifecycle jsonb;
  source_count_before integer;
  audit_count_before integer;
  original_timezone text;
  error_hint text;
begin
  select
    (response_payload #>> '{booking,id}')::uuid,
    (response_payload #>> '{rootTransaction,id}')::uuid,
    (response_payload #>> '{transaction,id}')::uuid
  into booking_id_value, root_transaction_id_value, transaction_id_value
  from public.ticket_idempotency_keys
  where action_name = 'ticketing.append_service_transaction.v1'
    and actor_employee_id = '40000000-0000-0000-0000-000000000001'
    and idempotency_key = 'service-dc-unpaid';

  select booking.version, transaction.version, to_jsonb(root)
  into booking_version_value, transaction_version_value, root_before
  from public.ticket_bookings booking
  join public.ticket_transactions transaction on transaction.id = transaction_id_value
  join public.ticket_transactions root on root.id = root_transaction_id_value
  where booking.id = booking_id_value;

  payment_value := jsonb_build_object(
    'expectedBookingVersion', booking_version_value,
    'expectedTransactionVersion', transaction_version_value,
    'paidAt', '2026-08-24'
  );

  first_result := public.ticketing_mark_service_transaction_paid(
    '40000000-0000-0000-0000-000000000001',
    booking_id_value,
    transaction_id_value,
    'service-dc-paid',
    payment_value
  );

  -- Payment replays created before 2303 are enriched from the same immutable
  -- transaction and booking-branch facts.
  update public.ticket_idempotency_keys
  set response_payload = response_payload
    #- '{transaction,bookingDate}'
    #- '{transaction,issuedOn}'
    #- '{transaction,paidOn}'
  where action_name = 'ticketing.mark_service_transaction_paid.v1'
    and actor_employee_id = '40000000-0000-0000-0000-000000000001'
    and idempotency_key = 'service-dc-paid';

  replay_result := public.ticketing_mark_service_transaction_paid(
    '40000000-0000-0000-0000-000000000001',
    booking_id_value,
    transaction_id_value,
    'service-dc-paid',
    payment_value
  );

  if first_result #>> '{transaction,paymentStatus}' <> 'paid'
    or first_result #>> '{transaction,bookingDate}' <> '2026-08-24'
    or first_result #>> '{transaction,issuedOn}' <> '2026-08-25'
    or first_result #>> '{transaction,paidOn}' <> '2026-08-24'
    or (first_result ->> 'changed')::boolean is not true
    or first_result #>> '{sourceEvent,eventType}' <> 'ticket_paid'
    or (replay_result ->> 'idempotentReplay')::boolean is not true
    or replay_result #>> '{transaction,bookingDate}' <> '2026-08-24'
    or replay_result #>> '{transaction,issuedOn}' <> '2026-08-25'
    or replay_result #>> '{transaction,paidOn}' <> '2026-08-24'
    or (select payment_status from public.ticket_bookings where id = booking_id_value) <> 'unpaid'
    or (select payment_status from public.ticket_transactions
        where id = root_transaction_id_value) <> 'unpaid'
    or (select to_jsonb(root) from public.ticket_transactions root
        where root.id = root_transaction_id_value) is distinct from root_before
    or (select count(*) from public.commission_source_events source_event
        where source_event.source_record_id = transaction_id_value
          and source_event.event_type = 'ticket_paid') <> 1
    or (select effective_on from public.commission_source_events source_event
        where source_event.source_record_id = transaction_id_value
          and source_event.event_type = 'ticket_paid') <> date '2026-08-24'
  then
    raise exception 'DC payment transition/replay or temporal semantics are incorrect: %', first_result;
  end if;

  select booking.version, transaction.version
  into booking_version_value, transaction_version_value
  from public.ticket_bookings booking
  join public.ticket_transactions transaction on transaction.id = transaction_id_value
  where booking.id = booking_id_value;

  select count(*) into source_count_before
  from public.commission_source_events where source_record_id = transaction_id_value;
  select count(*) into audit_count_before
  from public.ticket_audit_events where transaction_id = transaction_id_value;

  noop_result := public.ticketing_mark_service_transaction_paid(
    '40000000-0000-0000-0000-000000000001',
    booking_id_value,
    transaction_id_value,
    'service-dc-paid-noop',
    jsonb_build_object(
      'expectedBookingVersion', booking_version_value,
      'expectedTransactionVersion', transaction_version_value,
      'paidAt', '2026-08-24'
    )
  );

  if (noop_result ->> 'changed')::boolean is not false
    or noop_result #>> '{transaction,bookingDate}' <> '2026-08-24'
    or noop_result #>> '{transaction,issuedOn}' <> '2026-08-25'
    or noop_result #>> '{transaction,paidOn}' <> '2026-08-24'
    or jsonb_typeof(noop_result -> 'sourceEvent') <> 'null'
    or jsonb_typeof(noop_result -> 'auditEventId') <> 'null'
    or (select count(*) from public.commission_source_events
        where source_record_id = transaction_id_value) <> source_count_before
    or (select count(*) from public.ticket_audit_events
        where transaction_id = transaction_id_value) <> audit_count_before
    or (select version from public.ticket_bookings where id = booking_id_value)
      <> booking_version_value
    or (select version from public.ticket_transactions where id = transaction_id_value)
      <> transaction_version_value
  then
    raise exception 'Already-Paid no-op emitted events or advanced versions: %', noop_result;
  end if;

  begin
    perform public.ticketing_mark_service_transaction_paid(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      transaction_id_value,
      'service-dc-paid-correction',
      jsonb_build_object(
        'expectedBookingVersion', booking_version_value,
        'expectedTransactionVersion', transaction_version_value,
        'paidAt', '2026-08-25'
      )
    );
    raise exception 'Paid DC date was overwritten without correction';
  exception when object_not_in_prerequisite_state then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint is distinct from 'TICKETING_CORRECTION_REQUIRED' then
      raise exception 'Paid DC correction rejection omitted its stable hint';
    end if;
  end;

  select request_payload - 'bookingId'
  into append_entry_value
  from public.ticket_idempotency_keys
  where action_name = 'ticketing.append_service_transaction.v1'
    and actor_employee_id = '40000000-0000-0000-0000-000000000001'
    and idempotency_key = 'service-dc-unpaid';

  select count(*) into source_count_before
  from public.commission_source_events where source_record_id = transaction_id_value;
  select count(*) into audit_count_before
  from public.ticket_audit_events where transaction_id = transaction_id_value;

  update public.ticket_transactions
  set operational_status = 'cancelled',
      cancelled_at = '2026-08-30T00:00:00Z'
  where id = transaction_id_value;

  select booking.location_id, location.timezone
  into location_id_value, original_timezone
  from public.ticket_bookings booking
  join public.locations location on location.id = booking.location_id
  where booking.id = booking_id_value;

  -- Business dates are action-time facts. A later branch-timezone change must
  -- not reinterpret stored timestamps or make a valid replay fail.
  update public.locations
  set timezone = 'America/Los_Angeles'
  where id = location_id_value;

  append_replay_after_lifecycle := public.ticketing_append_service_transaction(
    '40000000-0000-0000-0000-000000000001',
    booking_id_value,
    'service-dc-unpaid',
    append_entry_value
  );
  payment_replay_after_lifecycle := public.ticketing_mark_service_transaction_paid(
    '40000000-0000-0000-0000-000000000001',
    booking_id_value,
    transaction_id_value,
    'service-dc-paid',
    payment_value
  );

  update public.locations
  set timezone = original_timezone
  where id = location_id_value;

  if (append_replay_after_lifecycle ->> 'idempotentReplay')::boolean is not true
    or append_replay_after_lifecycle #>> '{transaction,operationalStatus}' <> 'issued'
    or append_replay_after_lifecycle #>> '{transaction,paymentStatus}' <> 'unpaid'
    or append_replay_after_lifecycle #>> '{transaction,bookingDate}' <> '2026-08-24'
    or append_replay_after_lifecycle #>> '{transaction,issuedOn}' <> '2026-08-25'
    or jsonb_typeof(
      append_replay_after_lifecycle #> '{transaction,paidOn}'
    ) is distinct from 'null'
    or (payment_replay_after_lifecycle ->> 'idempotentReplay')::boolean is not true
    or payment_replay_after_lifecycle #>> '{transaction,operationalStatus}' <> 'issued'
    or payment_replay_after_lifecycle #>> '{transaction,paymentStatus}' <> 'paid'
    or payment_replay_after_lifecycle #>> '{transaction,bookingDate}' <> '2026-08-24'
    or payment_replay_after_lifecycle #>> '{transaction,issuedOn}' <> '2026-08-25'
    or payment_replay_after_lifecycle #>> '{transaction,paidOn}' <> '2026-08-24'
    or (select operational_status from public.ticket_transactions
        where id = transaction_id_value) <> 'cancelled'
    or (select payment_status from public.ticket_transactions
        where id = transaction_id_value) <> 'paid'
    or (select count(*) from public.commission_source_events
        where source_record_id = transaction_id_value) <> source_count_before
    or (select count(*) from public.ticket_audit_events
        where transaction_id = transaction_id_value) <> audit_count_before
  then
    raise exception 'Service replay drifted after later payment/lifecycle changes: %, %',
      append_replay_after_lifecycle, payment_replay_after_lifecycle;
  end if;
end
$$;

-- First R-ER supersedes the root TK; the next supersedes the latest issued
-- R-ER. Paid-at-create emits the service and payment facts atomically.
do $$
declare
  booking_id_value uuid;
  root_transaction_id_value uuid;
  booking_version_value bigint;
  root_version_value bigint;
  first_reissue jsonb;
  second_reissue jsonb;
  first_reissue_id uuid;
  second_reissue_id uuid;
  root_before jsonb;
begin
  select booking.id, root.id, booking.version, root.version, to_jsonb(root)
  into
    booking_id_value,
    root_transaction_id_value,
    booking_version_value,
    root_version_value,
    root_before
  from public.ticket_bookings booking
  join public.ticket_transactions root
    on root.booking_id = booking.id
    and root.service_type = 'TK'
    and root.parent_transaction_id is null
  where booking.normalized_pnr = 'SVC-U1';

  first_reissue := public.ticketing_append_service_transaction(
    '40000000-0000-0000-0000-000000000001',
    booking_id_value,
    'service-rer-first',
    jsonb_build_object(
      'expectedBookingVersion', booking_version_value,
      'expectedRootTransactionVersion', root_version_value,
      'serviceType', 'R-ER',
      'bookingDate', '2026-08-26',
      'issuedAt', '2026-08-27',
      'paymentStatus', 'paid',
      'paidAt', '2026-08-26',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT', 'quantity', 2,
          'unitSupplierCost', 12.50, 'unitSalePrice', 30
        )
      )
    )
  );
  first_reissue_id := (first_reissue #>> '{transaction,id}')::uuid;

  select version into booking_version_value
  from public.ticket_bookings where id = booking_id_value;

  second_reissue := public.ticketing_append_service_transaction(
    '40000000-0000-0000-0000-000000000001',
    booking_id_value,
    'service-rer-second',
    jsonb_build_object(
      'expectedBookingVersion', booking_version_value,
      'expectedRootTransactionVersion', root_version_value,
      'serviceType', 'R-ER',
      'bookingDate', '2026-08-28',
      'issuedAt', '2026-08-29',
      'paymentStatus', 'unpaid',
      'paidAt', null,
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT', 'quantity', 1,
          'unitSupplierCost', 8, 'unitSalePrice', 22
        )
      )
    )
  );
  second_reissue_id := (second_reissue #>> '{transaction,id}')::uuid;

  if first_reissue #>> '{transaction,parentTransactionId}' <> root_transaction_id_value::text
    or first_reissue #>> '{transaction,supersedesTransactionId}'
      <> root_transaction_id_value::text
    or first_reissue #>> '{sourceEvents,0,eventType}' <> 'ticket_reissued'
    or first_reissue #>> '{sourceEvents,1,eventType}' <> 'ticket_paid'
    or jsonb_array_length(first_reissue -> 'sourceEvents') <> 2
    or second_reissue #>> '{transaction,parentTransactionId}'
      <> root_transaction_id_value::text
    or second_reissue #>> '{transaction,supersedesTransactionId}' <> first_reissue_id::text
    or second_reissue #>> '{sourceEvents,0,eventType}' <> 'ticket_reissued'
    or jsonb_array_length(second_reissue -> 'sourceEvents') <> 1
    or (select to_jsonb(root) from public.ticket_transactions root
        where root.id = root_transaction_id_value) is distinct from root_before
  then
    raise exception 'R-ER root/latest lineage or Paid event set is incorrect: %, %',
      first_reissue, second_reissue;
  end if;

  if (select variables ->> 'supersedes_transaction_id'
      from public.commission_source_events
      where source_record_id = first_reissue_id
        and event_type = 'ticket_reissued') <> root_transaction_id_value::text
    or (select variables ->> 'supersedes_transaction_id'
        from public.commission_source_events
        where source_record_id = second_reissue_id
          and event_type = 'ticket_reissued') <> first_reissue_id::text
    or (select count(*) from public.commission_source_events
        where source_record_id = first_reissue_id
          and event_type = 'ticket_paid') <> 1
    or (select effective_on from public.commission_source_events
        where source_record_id = first_reissue_id
          and event_type = 'ticket_paid') <> date '2026-08-26'
  then
    raise exception 'R-ER Commission facts lost replacement or payment lineage';
  end if;

  -- The trigger independently rejects child-as-parent and stale reissue chains.
  begin
    insert into public.ticket_transactions (
      booking_id,
      parent_transaction_id,
      service_type,
      owner_employee_id,
      acting_employee_id,
      operational_status,
      payment_status,
      booking_date,
      currency,
      idempotency_key
    ) values (
      booking_id_value,
      first_reissue_id,
      'DC',
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      'draft',
      'unpaid',
      '2026-08-30',
      'GBP',
      'service-invalid-child-parent'
    );
    raise exception 'Lineage trigger accepted a child transaction as DC parent';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.ticket_transactions (
      booking_id,
      parent_transaction_id,
      supersedes_transaction_id,
      service_type,
      owner_employee_id,
      acting_employee_id,
      operational_status,
      payment_status,
      booking_date,
      currency,
      idempotency_key
    ) values (
      booking_id_value,
      root_transaction_id_value,
      root_transaction_id_value,
      'R-ER',
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      'draft',
      'unpaid',
      '2026-08-30',
      'GBP',
      'service-invalid-stale-supersedes'
    );
    raise exception 'Lineage trigger accepted a stale R-ER supersedes target';
  exception when check_violation then
    null;
  end;

  if (select count(*)
      from public.commission_source_events source_event
      join public.ticket_transactions transaction
        on transaction.id = source_event.source_record_id
      where transaction.booking_id = booking_id_value
        and source_event.event_type = 'ticket_issued') <> 1
  then
    raise exception 'DC/R-ER facts inflated the issued-TK target event count';
  end if;
end
$$;

-- A later-created reissue cannot be backdated before the current predecessor.
-- Rejection is atomic and carries a stable API hint.
do $$
declare
  booking_id_value uuid;
  root_transaction_id_value uuid;
  second_reissue_id uuid;
  booking_version_value bigint;
  root_version_value bigint;
  child_count_before integer;
  error_hint text;
begin
  select
    (response_payload #>> '{booking,id}')::uuid,
    (response_payload #>> '{rootTransaction,id}')::uuid,
    (response_payload #>> '{transaction,id}')::uuid
  into booking_id_value, root_transaction_id_value, second_reissue_id
  from public.ticket_idempotency_keys
  where action_name = 'ticketing.append_service_transaction.v1'
    and idempotency_key = 'service-rer-second';

  select booking.version, root.version
  into booking_version_value, root_version_value
  from public.ticket_bookings booking
  join public.ticket_transactions root on root.id = root_transaction_id_value
  where booking.id = booking_id_value;

  select count(*) into child_count_before
  from public.ticket_transactions where booking_id = booking_id_value;

  begin
    perform public.ticketing_append_service_transaction(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      'service-rer-backdated',
      jsonb_build_object(
        'expectedBookingVersion', booking_version_value,
        'expectedRootTransactionVersion', root_version_value,
        'serviceType', 'R-ER',
        'bookingDate', '2026-08-28',
        'issuedAt', '2026-08-28',
        'paymentStatus', 'unpaid',
        'paidAt', null,
        'currency', 'GBP',
        'fares', jsonb_build_array(
          jsonb_build_object(
            'passengerType', 'ADT', 'quantity', 1,
            'unitSupplierCost', 9, 'unitSalePrice', 23
          )
        )
      )
    );
    raise exception 'Backdated R-ER was accepted after a later-issued predecessor';
  exception when invalid_parameter_value then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint is distinct from 'TICKETING_REISSUE_DATE_BEFORE_PREDECESSOR' then
      raise exception 'Backdated R-ER rejection omitted its stable hint';
    end if;
  end;

  if (select version from public.ticket_bookings where id = booking_id_value)
      <> booking_version_value
    or (select version from public.ticket_transactions where id = root_transaction_id_value)
      <> root_version_value
    or (select count(*) from public.ticket_transactions where booking_id = booking_id_value)
      <> child_count_before
    or exists (
      select 1 from public.ticket_idempotency_keys
      where action_name = 'ticketing.append_service_transaction.v1'
        and idempotency_key = 'service-rer-backdated'
    )
    or exists (
      select 1 from public.ticket_audit_events
      where booking_id = booking_id_value
        and action = 'append_service_transaction'
        and after_state ->> 'supersedes_transaction_id' = second_reissue_id::text
        and created_at > (
          select created_at from public.ticket_transactions where id = second_reissue_id
        )
    )
  then
    raise exception 'Rejected backdated R-ER left partial state';
  end if;
end
$$;

-- Same-business-date reissues remain valid. Separate statements ensure their
-- created_at/id ordering is visible, and each must link to the true chain tail.
do $$
declare
  booking_id_value uuid;
  root_transaction_id_value uuid;
  second_reissue_id uuid;
  booking_version_value bigint;
  root_version_value bigint;
  third_reissue jsonb;
begin
  select
    (response_payload #>> '{booking,id}')::uuid,
    (response_payload #>> '{rootTransaction,id}')::uuid,
    (response_payload #>> '{transaction,id}')::uuid
  into booking_id_value, root_transaction_id_value, second_reissue_id
  from public.ticket_idempotency_keys
  where action_name = 'ticketing.append_service_transaction.v1'
    and idempotency_key = 'service-rer-second';

  select booking.version, root.version
  into booking_version_value, root_version_value
  from public.ticket_bookings booking
  join public.ticket_transactions root on root.id = root_transaction_id_value
  where booking.id = booking_id_value;

  third_reissue := public.ticketing_append_service_transaction(
    '40000000-0000-0000-0000-000000000001',
    booking_id_value,
    'service-rer-same-date-third',
    jsonb_build_object(
      'expectedBookingVersion', booking_version_value,
      'expectedRootTransactionVersion', root_version_value,
      'serviceType', 'R-ER',
      'bookingDate', '2026-08-29',
      'issuedAt', '2026-08-29',
      'paymentStatus', 'unpaid',
      'paidAt', null,
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT', 'quantity', 1,
          'unitSupplierCost', 9, 'unitSalePrice', 23
        )
      )
    )
  );

  if third_reissue #>> '{transaction,supersedesTransactionId}' <> second_reissue_id::text then
    raise exception 'Valid same-date R-ER did not follow the true predecessor tail: %',
      third_reissue;
  end if;
end
$$;

do $$
declare
  booking_id_value uuid;
  root_transaction_id_value uuid;
  third_reissue_id uuid;
  booking_version_value bigint;
  root_version_value bigint;
  fourth_reissue jsonb;
begin
  select
    (response_payload #>> '{booking,id}')::uuid,
    (response_payload #>> '{rootTransaction,id}')::uuid,
    (response_payload #>> '{transaction,id}')::uuid
  into booking_id_value, root_transaction_id_value, third_reissue_id
  from public.ticket_idempotency_keys
  where action_name = 'ticketing.append_service_transaction.v1'
    and idempotency_key = 'service-rer-same-date-third';

  select booking.version, root.version
  into booking_version_value, root_version_value
  from public.ticket_bookings booking
  join public.ticket_transactions root on root.id = root_transaction_id_value
  where booking.id = booking_id_value;

  fourth_reissue := public.ticketing_append_service_transaction(
    '40000000-0000-0000-0000-000000000001',
    booking_id_value,
    'service-rer-same-date-fourth',
    jsonb_build_object(
      'expectedBookingVersion', booking_version_value,
      'expectedRootTransactionVersion', root_version_value,
      'serviceType', 'R-ER',
      'bookingDate', '2026-08-29',
      'issuedAt', '2026-08-29',
      'paymentStatus', 'unpaid',
      'paidAt', null,
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT', 'quantity', 1,
          'unitSupplierCost', 10, 'unitSalePrice', 24
        )
      )
    )
  );

  if fourth_reissue #>> '{transaction,supersedesTransactionId}' <> third_reissue_id::text then
    raise exception 'Second same-date R-ER branched from an older predecessor: %', fourth_reissue;
  end if;
end
$$;

-- A replacement remains in historical lineage after cancellation. The 2303
-- append core still considers only currently-Issued tails, so its attempted
-- stale predecessor is rejected atomically rather than branching. A direct
-- privileged maintenance-only write that names the true terminal tail remains
-- valid and proves the trigger/index predicate is lifecycle-stable. Normal RPC
-- append stays closed once its current replacement tail is terminal.
do $$
declare
  booking_id_value uuid;
  root_transaction_id_value uuid;
  fourth_reissue_id uuid;
  booking_version_value bigint;
  root_version_value bigint;
  child_count_before integer;
  audit_count_before integer;
  source_count_before integer;
  fifth_reissue_id constant uuid := '8b000000-0000-0000-0000-000000000001';
  error_hint text;
begin
  select
    (response_payload #>> '{booking,id}')::uuid,
    (response_payload #>> '{rootTransaction,id}')::uuid,
    (response_payload #>> '{transaction,id}')::uuid
  into booking_id_value, root_transaction_id_value, fourth_reissue_id
  from public.ticket_idempotency_keys
  where action_name = 'ticketing.append_service_transaction.v1'
    and idempotency_key = 'service-rer-same-date-fourth';

  update public.ticket_transactions
  set operational_status = 'cancelled',
      cancelled_at = '2026-08-30T00:00:00Z'
  where id = fourth_reissue_id;

  select booking.version, root.version
  into booking_version_value, root_version_value
  from public.ticket_bookings booking
  join public.ticket_transactions root on root.id = root_transaction_id_value
  where booking.id = booking_id_value;

  select count(*) into child_count_before
  from public.ticket_transactions where booking_id = booking_id_value;
  select count(*) into audit_count_before
  from public.ticket_audit_events where booking_id = booking_id_value;
  select count(*) into source_count_before
  from public.commission_source_events source_event
  join public.ticket_transactions transaction
    on transaction.id = source_event.source_record_id
  where transaction.booking_id = booking_id_value;

  begin
    perform public.ticketing_append_service_transaction(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      'service-rer-after-terminal-tail',
      jsonb_build_object(
        'expectedBookingVersion', booking_version_value,
        'expectedRootTransactionVersion', root_version_value,
        'serviceType', 'R-ER',
        'bookingDate', '2026-08-30',
        'issuedAt', '2026-08-30',
        'paymentStatus', 'unpaid',
        'paidAt', null,
        'currency', 'GBP',
        'fares', jsonb_build_array(
          jsonb_build_object(
            'passengerType', 'ADT', 'quantity', 1,
            'unitSupplierCost', 11, 'unitSalePrice', 25
          )
        )
      )
    );
    raise exception 'R-ER append branched after the latest replacement was cancelled';
  exception when check_violation then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint is distinct from 'TICKETING_REISSUE_CHAIN_CONFLICT' then
      raise exception 'Historical-tail rejection omitted its stable hint';
    end if;
  end;

  if (select count(*) from public.ticket_transactions where booking_id = booking_id_value)
      <> child_count_before
    or (select count(*) from public.ticket_audit_events where booking_id = booking_id_value)
      <> audit_count_before
    or (select count(*)
        from public.commission_source_events source_event
        join public.ticket_transactions transaction
          on transaction.id = source_event.source_record_id
        where transaction.booking_id = booking_id_value) <> source_count_before
    or exists (
      select 1 from public.ticket_idempotency_keys
      where action_name = 'ticketing.append_service_transaction.v1'
        and idempotency_key = 'service-rer-after-terminal-tail'
    )
  then
    raise exception 'Rejected terminal-tail R-ER append left partial state';
  end if;

  insert into public.ticket_transactions (
    id,
    booking_id,
    parent_transaction_id,
    supersedes_transaction_id,
    service_type,
    owner_employee_id,
    acting_employee_id,
    operational_status,
    payment_status,
    booking_date,
    currency,
    idempotency_key
  ) values (
    fifth_reissue_id,
    booking_id_value,
    root_transaction_id_value,
    fourth_reissue_id,
    'R-ER',
    '40000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    'draft',
    'unpaid',
    '2026-08-30',
    'GBP',
    'service-direct-after-terminal-tail'
  );

  insert into public.ticket_passenger_fare_lines (
    transaction_id,
    passenger_type,
    quantity,
    currency,
    unit_supplier_cost_source,
    unit_supplier_cost_gbp,
    unit_sale_price_source,
    unit_sale_price_gbp
  ) values (
    fifth_reissue_id,
    'ADT',
    1,
    'GBP',
    11,
    11,
    25,
    25
  );

  update public.ticket_transactions
  set operational_status = 'issued',
      issued_at = '2026-08-30T00:00:00Z'
  where id = fifth_reissue_id;

  if (select operational_status from public.ticket_transactions
      where id = fourth_reissue_id) <> 'cancelled'
    or (select operational_status from public.ticket_transactions
        where id = fifth_reissue_id) <> 'issued'
    or (select supersedes_transaction_id from public.ticket_transactions
        where id = fifth_reissue_id) <> fourth_reissue_id
    or (select count(*) from public.ticket_transactions
        where supersedes_transaction_id = fourth_reissue_id
          and issued_at is not null
          and operational_status in ('issued', 'cancelled', 'part_refunded', 'refunded')) <> 1
  then
    raise exception 'Historical R-ER tail could not continue linearly after cancellation';
  end if;

  update public.ticket_transactions
  set operational_status = 'part_refunded'
  where id = fifth_reissue_id;

  if (select count(*) from public.ticket_transactions
      where supersedes_transaction_id = fourth_reissue_id
        and issued_at is not null
        and operational_status in ('issued', 'cancelled', 'part_refunded', 'refunded')) <> 1
  then
    raise exception 'Part-refunded R-ER disappeared from historical successor lineage';
  end if;

  update public.ticket_transactions
  set operational_status = 'refunded',
      refunded_at = '2026-08-31T00:00:00Z'
  where id = fifth_reissue_id;

  select count(*) into child_count_before
  from public.ticket_transactions where booking_id = booking_id_value;

  begin
    perform public.ticketing_append_service_transaction(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      'service-rer-after-refunded-tail',
      jsonb_build_object(
        'expectedBookingVersion', booking_version_value,
        'expectedRootTransactionVersion', root_version_value,
        'serviceType', 'R-ER',
        'bookingDate', '2026-08-31',
        'issuedAt', '2026-08-31',
        'paymentStatus', 'unpaid',
        'paidAt', null,
        'currency', 'GBP',
        'fares', jsonb_build_array(
          jsonb_build_object(
            'passengerType', 'ADT', 'quantity', 1,
            'unitSupplierCost', 12, 'unitSalePrice', 26
          )
        )
      )
    );
    raise exception 'R-ER append branched after the latest replacement was refunded';
  exception when check_violation then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint is distinct from 'TICKETING_REISSUE_CHAIN_CONFLICT' then
      raise exception 'Refunded-tail rejection omitted its stable hint';
    end if;
  end;

  if (select operational_status from public.ticket_transactions
      where id = fifth_reissue_id) <> 'refunded'
    or (select count(*) from public.ticket_transactions where booking_id = booking_id_value)
      <> child_count_before
    or exists (
      select 1 from public.ticket_idempotency_keys
      where action_name = 'ticketing.append_service_transaction.v1'
        and idempotency_key = 'service-rer-after-refunded-tail'
    )
  then
    raise exception 'Refunded R-ER tail was dropped from linear history';
  end if;
end
$$;

-- Strict boundary, own-record access, root-date floor, affected quantity, and
-- optimistic-version failures are atomic and carry stable API hints.
do $$
declare
  booking_id_value uuid;
  root_transaction_id_value uuid;
  booking_version_value bigint;
  root_version_value bigint;
  child_count_before integer;
  audit_count_before integer;
  error_hint text;
  valid_entry jsonb;
begin
  select booking.id, root.id, booking.version, root.version
  into booking_id_value, root_transaction_id_value, booking_version_value, root_version_value
  from public.ticket_bookings booking
  join public.ticket_transactions root
    on root.booking_id = booking.id
    and root.service_type = 'TK'
    and root.parent_transaction_id is null
  where booking.normalized_pnr = 'SVC-U1';

  select count(*) into child_count_before
  from public.ticket_transactions where booking_id = booking_id_value;
  select count(*) into audit_count_before
  from public.ticket_audit_events where booking_id = booking_id_value;

  valid_entry := jsonb_build_object(
    'expectedBookingVersion', booking_version_value,
    'expectedRootTransactionVersion', root_version_value,
    'serviceType', 'DC',
    'bookingDate', '2026-09-01',
    'issuedAt', '2026-09-01',
    'paymentStatus', 'unpaid',
    'paidAt', null,
    'currency', 'GBP',
    'fares', jsonb_build_array(
      jsonb_build_object(
        'passengerType', 'ADT', 'quantity', 1,
        'unitSupplierCost', 5, 'unitSalePrice', 15
      )
    )
  );

  begin
    perform public.ticketing_append_service_transaction(
      '40000000-0000-0000-0000-000000000001', booking_id_value,
      'service-stale-version',
      jsonb_set(valid_entry, '{expectedBookingVersion}',
        to_jsonb(booking_version_value - 1))
    );
    raise exception 'Stale DC versions committed';
  exception when serialization_failure then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint is distinct from 'TICKETING_VERSION_CONFLICT' then
      raise exception 'Stale DC rejection omitted its stable hint';
    end if;
  end;

  begin
    perform public.ticketing_append_service_transaction(
      '40000000-0000-0000-0000-000000000003', booking_id_value,
      'service-cross-owner', valid_entry
    );
    raise exception 'Another Ticketing agent appended to a private booking';
  exception when no_data_found then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint is distinct from 'TICKETING_RECORD_NOT_FOUND' then
      raise exception 'Cross-owner rejection omitted its non-disclosing hint';
    end if;
  end;

  begin
    perform public.ticketing_append_service_transaction(
      '40000000-0000-0000-0000-000000000001', booking_id_value,
      'service-quantity-exceeded',
      jsonb_set(valid_entry, '{fares,0,quantity}', '3'::jsonb)
    );
    raise exception 'DC quantity exceeded its root passenger type';
  exception when invalid_parameter_value then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint is distinct from 'TICKETING_AFFECTED_QUANTITY_EXCEEDED' then
      raise exception 'Affected-quantity rejection omitted its stable hint';
    end if;
  end;

  begin
    perform public.ticketing_append_service_transaction(
      '40000000-0000-0000-0000-000000000001', booking_id_value,
      'service-type-absent',
      jsonb_set(valid_entry, '{fares,0,passengerType}', '"INF"'::jsonb)
    );
    raise exception 'DC used a passenger type absent from the root TK';
  exception when invalid_parameter_value then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint is distinct from 'TICKETING_AFFECTED_QUANTITY_EXCEEDED' then
      raise exception 'Absent passenger-type rejection omitted its stable hint';
    end if;
  end;

  begin
    perform public.ticketing_append_service_transaction(
      '40000000-0000-0000-0000-000000000001', booking_id_value,
      'service-before-root',
      jsonb_set(
        jsonb_set(valid_entry, '{bookingDate}', '"2026-08-22"'::jsonb),
        '{issuedAt}', '"2026-08-22"'::jsonb
      )
    );
    raise exception 'DC was backdated before the root TK issuance business date';
  exception when invalid_parameter_value then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint is distinct from 'TICKETING_SERVICE_DATE_BEFORE_ROOT' then
      raise exception 'Root-date rejection omitted its stable hint';
    end if;
  end;

  begin
    perform public.ticketing_append_service_transaction(
      '40000000-0000-0000-0000-000000000001', booking_id_value,
      'service-paid-before-booking',
      jsonb_set(
        jsonb_set(valid_entry, '{paymentStatus}', '"paid"'::jsonb),
        '{paidAt}', '"2026-08-31"'::jsonb
      )
    );
    raise exception 'DC payment predated its booking date';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_append_service_transaction(
      '40000000-0000-0000-0000-000000000001', booking_id_value,
      'service-invalid-kind',
      jsonb_set(valid_entry, '{serviceType}', '"TK"'::jsonb)
    );
    raise exception 'Child append accepted TK service type';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_append_service_transaction(
      '40000000-0000-0000-0000-000000000001', booking_id_value,
      'service-unknown-field',
      valid_entry || jsonb_build_object('commission', 5)
    );
    raise exception 'Child append accepted an unknown/calculated field';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_append_service_transaction(
      '40000000-0000-0000-0000-000000000001', booking_id_value,
      'service-duplicate-fare',
      jsonb_set(valid_entry, '{fares}', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT', 'quantity', 1,
          'unitSupplierCost', 5, 'unitSalePrice', 15
        ),
        jsonb_build_object(
          'passengerType', 'ADT', 'quantity', 1,
          'unitSupplierCost', 5, 'unitSalePrice', 15
        )
      ))
    );
    raise exception 'Child append accepted duplicate fare types';
  exception when invalid_parameter_value then
    null;
  end;

  if (select version from public.ticket_bookings where id = booking_id_value)
      <> booking_version_value
    or (select version from public.ticket_transactions where id = root_transaction_id_value)
      <> root_version_value
    or (select count(*) from public.ticket_transactions where booking_id = booking_id_value)
      <> child_count_before
    or (select count(*) from public.ticket_audit_events where booking_id = booking_id_value)
      <> audit_count_before
    or exists (
      select 1 from public.ticket_idempotency_keys
      where action_name = 'ticketing.append_service_transaction.v1'
        and idempotency_key like 'service-%'
        and idempotency_key in (
          'service-stale-version', 'service-cross-owner', 'service-quantity-exceeded',
          'service-type-absent', 'service-before-root', 'service-paid-before-booking',
          'service-invalid-kind', 'service-unknown-field', 'service-duplicate-fare'
        )
    )
  then
    raise exception 'Rejected DC/R-ER requests left partial state';
  end if;
end
$$;

-- The payment path has the same own-record, strict, optimistic, and temporal
-- boundary as creation.
do $$
declare
  booking_id_value uuid;
  transaction_id_value uuid;
  booking_version_value bigint;
  transaction_version_value bigint;
  error_hint text;
  payment_value jsonb;
begin
  select
    (response_payload #>> '{booking,id}')::uuid,
    (response_payload #>> '{transaction,id}')::uuid
  into booking_id_value, transaction_id_value
  from public.ticket_idempotency_keys
  where action_name = 'ticketing.append_service_transaction.v1'
    and idempotency_key = 'service-rer-second';

  select booking.version, transaction.version
  into booking_version_value, transaction_version_value
  from public.ticket_bookings booking
  join public.ticket_transactions transaction on transaction.id = transaction_id_value
  where booking.id = booking_id_value;

  payment_value := jsonb_build_object(
    'expectedBookingVersion', booking_version_value,
    'expectedTransactionVersion', transaction_version_value,
    'paidAt', '2026-08-28'
  );

  begin
    perform public.ticketing_mark_service_transaction_paid(
      '40000000-0000-0000-0000-000000000003',
      booking_id_value,
      transaction_id_value,
      'service-payment-cross-owner',
      payment_value
    );
    raise exception 'Another agent marked a private service transaction Paid';
  exception when no_data_found then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint is distinct from 'TICKETING_RECORD_NOT_FOUND' then
      raise exception 'Cross-owner service-payment rejection omitted its stable hint';
    end if;
  end;

  begin
    perform public.ticketing_mark_service_transaction_paid(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      transaction_id_value,
      'service-payment-stale',
      jsonb_set(
        payment_value,
        '{expectedTransactionVersion}',
        to_jsonb(transaction_version_value - 1)
      )
    );
    raise exception 'Stale service-payment versions committed';
  exception when serialization_failure then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint is distinct from 'TICKETING_VERSION_CONFLICT' then
      raise exception 'Stale service-payment rejection omitted its stable hint';
    end if;
  end;

  begin
    perform public.ticketing_mark_service_transaction_paid(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      transaction_id_value,
      'service-payment-before-booking',
      jsonb_set(payment_value, '{paidAt}', '"2026-08-27"'::jsonb)
    );
    raise exception 'Service payment predated its booking date';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_mark_service_transaction_paid(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      transaction_id_value,
      'service-payment-unknown-field',
      payment_value || jsonb_build_object('commission', 5)
    );
    raise exception 'Service payment accepted an unknown/calculated field';
  exception when invalid_parameter_value then
    null;
  end;

  if (select payment_status from public.ticket_transactions where id = transaction_id_value)
      <> 'unpaid'
    or (select version from public.ticket_transactions where id = transaction_id_value)
      <> transaction_version_value
    or (select version from public.ticket_bookings where id = booking_id_value)
      <> booking_version_value
    or exists (
      select 1 from public.ticket_idempotency_keys
      where action_name = 'ticketing.mark_service_transaction_paid.v1'
        and idempotency_key in (
          'service-payment-cross-owner', 'service-payment-stale',
          'service-payment-before-booking', 'service-payment-unknown-field'
        )
    )
  then
    raise exception 'Rejected service-payment requests left partial state';
  end if;
end
$$;

-- A payment source-event conflict rolls the Unpaid-to-Paid state change back.
do $$
declare
  booking_id_value uuid;
  transaction_id_value uuid;
  booking_version_value bigint;
  transaction_version_value bigint;
  conflict_key constant text := 'service-payment-source-conflict';
  source_key text;
begin
  select
    (response_payload #>> '{booking,id}')::uuid,
    (response_payload #>> '{transaction,id}')::uuid
  into booking_id_value, transaction_id_value
  from public.ticket_idempotency_keys
  where action_name = 'ticketing.append_service_transaction.v1'
    and idempotency_key = 'service-rer-second';

  select booking.version, transaction.version
  into booking_version_value, transaction_version_value
  from public.ticket_bookings booking
  join public.ticket_transactions transaction on transaction.id = transaction_id_value
  where booking.id = booking_id_value;

  source_key := 'tksp:v1:' || encode(digest(
    '40000000-0000-0000-0000-000000000001:' || conflict_key || ':paid',
    'sha256'
  ), 'hex');

  perform public.append_commission_source_event(jsonb_build_object(
    'source_module', 'ticketing',
    'source_event_id', gen_random_uuid(),
    'source_fact_key', 'fixture:service-payment-source-conflict',
    'source_record_id', transaction_id_value,
    'event_type', 'fixture_service_payment_conflict',
    'contract_version', 1,
    'event_version', 1,
    'supersedes_event_id', null,
    'employee_id', '40000000-0000-0000-0000-000000000001',
    'owner_employee_id', '40000000-0000-0000-0000-000000000001',
    'location_id', '30000000-0000-0000-0000-000000000001',
    'occurred_at', '2026-08-28T12:00:00Z',
    'effective_on', '2026-08-28',
    'source_path', '/dashboard/ticketing/fixture',
    'variables', '{}'::jsonb,
    'idempotency_key', source_key
  ));

  begin
    perform public.ticketing_mark_service_transaction_paid(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      transaction_id_value,
      conflict_key,
      jsonb_build_object(
        'expectedBookingVersion', booking_version_value,
        'expectedTransactionVersion', transaction_version_value,
        'paidAt', '2026-08-28'
      )
    );
    raise exception 'Commission source conflict did not abort service payment';
  exception when invalid_parameter_value then
    null;
  end;

  if (select payment_status from public.ticket_transactions where id = transaction_id_value)
      <> 'unpaid'
    or (select paid_at from public.ticket_transactions where id = transaction_id_value) is not null
    or (select version from public.ticket_transactions where id = transaction_id_value)
      <> transaction_version_value
    or (select version from public.ticket_bookings where id = booking_id_value)
      <> booking_version_value
    or exists (
      select 1 from public.ticket_audit_events
      where transaction_id = transaction_id_value
        and action = 'mark_service_transaction_paid'
    )
    or exists (
      select 1 from public.ticket_idempotency_keys
      where action_name = 'ticketing.mark_service_transaction_paid.v1'
        and idempotency_key = conflict_key
    )
  then
    raise exception 'Failed service payment source append left partial state';
  end if;
end
$$;

-- A downstream source-event conflict must roll back the child, fare rows,
-- booking version, audit row, and retry record as one transaction.
do $$
declare
  created jsonb;
  booking_id_value uuid;
  root_transaction_id_value uuid;
  booking_version_value bigint;
  root_version_value bigint;
  conflict_key constant text := 'service-source-conflict';
  source_key text;
begin
  created := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'service-conflict-root',
    jsonb_build_object(
      'customerName', 'Service Atomic Conflict',
      'pnr', 'SVC-A1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-23',
      'timeLimitAt', null,
      'issuedAt', '2026-08-23',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'quantity', 1, 'unitSupplierCost', 80)
      )
    )
  );
  booking_id_value := (created #>> '{booking,id}')::uuid;
  root_transaction_id_value := (created #>> '{transaction,id}')::uuid;
  booking_version_value := (created #>> '{booking,version}')::bigint;
  root_version_value := (created #>> '{transaction,version}')::bigint;

  source_key := 'tkst:v1:' || encode(digest(
    '40000000-0000-0000-0000-000000000001:' || conflict_key || ':issued',
    'sha256'
  ), 'hex');

  perform public.append_commission_source_event(jsonb_build_object(
    'source_module', 'ticketing',
    'source_event_id', gen_random_uuid(),
    'source_fact_key', 'fixture:service-source-conflict',
    'source_record_id', root_transaction_id_value,
    'event_type', 'fixture_service_conflict',
    'contract_version', 1,
    'event_version', 1,
    'supersedes_event_id', null,
    'employee_id', '40000000-0000-0000-0000-000000000001',
    'owner_employee_id', '40000000-0000-0000-0000-000000000001',
    'location_id', '30000000-0000-0000-0000-000000000001',
    'occurred_at', '2026-08-23T12:00:00Z',
    'effective_on', '2026-08-23',
    'source_path', '/dashboard/ticketing/fixture',
    'variables', '{}'::jsonb,
    'idempotency_key', source_key
  ));

  begin
    perform public.ticketing_append_service_transaction(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      conflict_key,
      jsonb_build_object(
        'expectedBookingVersion', booking_version_value,
        'expectedRootTransactionVersion', root_version_value,
        'serviceType', 'DC',
        'bookingDate', '2026-08-24',
        'issuedAt', '2026-08-24',
        'paymentStatus', 'unpaid',
        'paidAt', null,
        'currency', 'GBP',
        'fares', jsonb_build_array(
          jsonb_build_object(
            'passengerType', 'ADT', 'quantity', 1,
            'unitSupplierCost', 5, 'unitSalePrice', 15
          )
        )
      )
    );
    raise exception 'Commission source conflict did not abort service append';
  exception when invalid_parameter_value then
    null;
  end;

  if (select version from public.ticket_bookings where id = booking_id_value)
      <> booking_version_value
    or (select version from public.ticket_transactions where id = root_transaction_id_value)
      <> root_version_value
    or (select count(*) from public.ticket_transactions
        where booking_id = booking_id_value and parent_transaction_id is not null) <> 0
    or exists (
      select 1 from public.ticket_audit_events
      where booking_id = booking_id_value and action = 'append_service_transaction'
    )
    or exists (
      select 1 from public.ticket_idempotency_keys
      where action_name = 'ticketing.append_service_transaction.v1'
        and idempotency_key = conflict_key
    )
  then
    raise exception 'Failed service source append left partial operational state';
  end if;
end
$$;

-- The below-RPC trigger refuses to post either DC or R-ER while the root TK is
-- not Issued, even if a privileged writer builds a complete Draft child.
do $$
declare
  created jsonb;
  booking_id_value uuid;
  root_transaction_id_value uuid;
  child_transaction_id_value constant uuid := '8c000000-0000-0000-0000-000000000001';
begin
  created := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'service-held-root-trigger',
    jsonb_build_object(
      'customerName', 'Held Root Trigger Customer',
      'pnr', 'SVC-H1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'held',
      'bookingDate', '2026-08-23',
      'timeLimitAt', '2026-09-10T12:00',
      'issuedAt', null,
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'quantity', 1, 'unitSupplierCost', 80)
      )
    )
  );
  booking_id_value := (created #>> '{booking,id}')::uuid;
  root_transaction_id_value := (created #>> '{transaction,id}')::uuid;

  insert into public.ticket_transactions (
    id,
    booking_id,
    parent_transaction_id,
    service_type,
    owner_employee_id,
    acting_employee_id,
    operational_status,
    payment_status,
    booking_date,
    currency,
    idempotency_key
  ) values (
    child_transaction_id_value,
    booking_id_value,
    root_transaction_id_value,
    'DC',
    '40000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    'draft',
    'unpaid',
    '2026-08-24',
    'GBP',
    'service-held-root-direct-child'
  );

  insert into public.ticket_passenger_fare_lines (
    transaction_id,
    passenger_type,
    quantity,
    currency,
    unit_supplier_cost_source,
    unit_supplier_cost_gbp,
    unit_sale_price_source,
    unit_sale_price_gbp
  ) values (
    child_transaction_id_value,
    'ADT',
    1,
    'GBP',
    5,
    5,
    15,
    15
  );

  begin
    update public.ticket_transactions
    set operational_status = 'issued',
        issued_at = '2026-08-24T00:00:00Z'
    where id = child_transaction_id_value;
    raise exception 'Direct child write posted against a non-Issued root TK';
  exception when check_violation then
    null;
  end;

  if (select operational_status from public.ticket_transactions
      where id = child_transaction_id_value) <> 'draft'
    or (select issued_at from public.ticket_transactions
        where id = child_transaction_id_value) is not null
  then
    raise exception 'Rejected non-Issued-root child left a posted transaction';
  end if;
end
$$;

-- Prepare a deterministic two-session same-version race for the shell harness.
do $$
declare
  created jsonb;
begin
  created := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'service-concurrency-root',
    jsonb_build_object(
      'customerName', 'Service Concurrency Customer',
      'pnr', 'SVC-C1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-23',
      'timeLimitAt', null,
      'issuedAt', '2026-08-23',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'quantity', 1, 'unitSupplierCost', 90)
      )
    )
  );

  if created #>> '{booking,normalizedPnr}' <> 'SVC-C1' then
    raise exception 'Service concurrency fixture was not created';
  end if;
end
$$;

create or replace function public.ticketing_test_pause_service_race()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.action = 'append_service_transaction'
    and exists (
      select 1
      from public.ticket_bookings booking
      where booking.id = new.booking_id
        and booking.normalized_pnr = 'SVC-C1'
    )
  then
    perform pg_sleep(5);
  end if;
  return new;
end
$$;

drop trigger if exists ticketing_test_pause_service_race
  on public.ticket_audit_events;
create trigger ticketing_test_pause_service_race
  after insert on public.ticket_audit_events
  for each row execute function public.ticketing_test_pause_service_race();

-- Two privileged Draft R-ER writes can initially name the same predecessor.
-- The shell harness races their transition to Issued; booking serialization
-- plus the unique-successor index must allow exactly one.
do $$
declare
  created jsonb;
  booking_id_value uuid;
  root_transaction_id_value uuid;
  candidate_id uuid;
begin
  created := public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'service-direct-lineage-root',
    jsonb_build_object(
      'customerName', 'Direct Lineage Race Customer',
      'pnr', 'SVC-D1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-23',
      'timeLimitAt', null,
      'issuedAt', '2026-08-23',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'quantity', 1, 'unitSupplierCost', 90)
      )
    )
  );
  booking_id_value := (created #>> '{booking,id}')::uuid;
  root_transaction_id_value := (created #>> '{transaction,id}')::uuid;

  foreach candidate_id in array array[
    '8d000000-0000-0000-0000-000000000001'::uuid,
    '8d000000-0000-0000-0000-000000000002'::uuid
  ]
  loop
    insert into public.ticket_transactions (
      id,
      booking_id,
      parent_transaction_id,
      supersedes_transaction_id,
      service_type,
      owner_employee_id,
      acting_employee_id,
      operational_status,
      payment_status,
      booking_date,
      currency,
      idempotency_key
    ) values (
      candidate_id,
      booking_id_value,
      root_transaction_id_value,
      root_transaction_id_value,
      'R-ER',
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      'draft',
      'unpaid',
      '2026-08-24',
      'GBP',
      'service-direct-lineage-' || candidate_id::text
    );

    insert into public.ticket_passenger_fare_lines (
      transaction_id,
      passenger_type,
      quantity,
      currency,
      unit_supplier_cost_source,
      unit_supplier_cost_gbp,
      unit_sale_price_source,
      unit_sale_price_gbp
    ) values (
      candidate_id,
      'ADT',
      1,
      'GBP',
      5,
      5,
      15,
      15
    );
  end loop;
end
$$;

create or replace function public.ticketing_test_pause_direct_lineage_race()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id = '8d000000-0000-0000-0000-000000000001'
    and old.operational_status = 'draft'
    and new.operational_status = 'issued'
  then
    perform pg_sleep(5);
  end if;
  return new;
end
$$;

drop trigger if exists ticketing_test_pause_direct_lineage_race
  on public.ticket_transactions;
create trigger ticketing_test_pause_direct_lineage_race
  after update of operational_status on public.ticket_transactions
  for each row execute function public.ticketing_test_pause_direct_lineage_race();

select 'Ticketing DC/R-ER integration checks passed.' as result;
