\set ON_ERROR_STOP on

do $$
declare
  status_value jsonb;
  function_definition text;
begin
  status_value := public.ticketing_schema_status();
  if (status_value ->> 'ready')::boolean is not true
    or (status_value ->> 'version')::bigint <> 2026082403
    or (status_value ->> 'requiredVersion')::bigint <> 2026082403
    or not (status_value #> '{details,capabilities}' ?& array[
      'admin-on-behalf-tk-completion',
      'reasoned-on-behalf-audit',
      'root-completion-source-attribution'
    ])
  then
    raise exception 'Authorised completion capability is incorrect: %', status_value;
  end if;

  if pg_catalog.to_regprocedure(
    'public.ticketing_complete_tk_details_authorized(uuid,uuid,text,jsonb)'
  ) is null
    or not has_function_privilege(
      'service_role',
      'public.ticketing_complete_tk_details_authorized(uuid,uuid,text,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.ticketing_complete_tk_details_authorized(uuid,uuid,text,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.ticketing_complete_tk_details_authorized(uuid,uuid,text,jsonb)',
      'EXECUTE'
    )
  then
    raise exception 'Authorised completion RPC grants are incorrect';
  end if;

  if has_function_privilege(
    'service_role',
    'public.enrich_ticketing_source_event_attribution_2026082403()',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.enrich_ticketing_source_event_attribution_2026082403()',
    'EXECUTE'
  ) then
    raise exception 'Internal completion-source trigger function is callable';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.commission_source_events'::regclass
      and trigger_row.tgname = 'commission_source_events_enrich_ticket_attribution_2403'
      and not trigger_row.tgisinternal
  ) or exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.commission_source_events'::regclass
      and trigger_row.tgname = 'commission_source_events_enrich_ticket_attribution_2402'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'Root completion source attribution trigger was not converged';
  end if;

  function_definition := pg_get_functiondef(
    'public.ticketing_complete_tk_details_authorized(uuid,uuid,text,jsonb)'::regprocedure
  );
  if position('for update' in lower(function_definition)) = 0
    or position('ticket_booking_attribution_versions' in function_definition) = 0
    or position('TICKETING_ON_BEHALF_FORBIDDEN' in function_definition) = 0
    or position('booking.owner_employee_id = p_actor_employee_id' in function_definition) > 0
  then
    raise exception 'Authorised completion does not derive and lock attribution safely';
  end if;
end
$$;

-- Disposable rows used by the shell runner's two-session optimistic and
-- department-membership lock races.
do $$
declare
  fixture_pnr text;
begin
  foreach fixture_pnr in array array['AC-RACE1', 'AC-MEM1']
  loop
    perform public.ticketing_create_quick_tk_attributed(
      '4a000000-0000-0000-0000-000000000001',
      'admin-completion-fixture-' || lower(fixture_pnr),
      jsonb_build_object(
        'customerName', 'Admin Completion Race Fixture',
        'pnr', fixture_pnr,
        'airlineId', '50000000-0000-0000-0000-000000000001',
        'serviceType', 'TK',
        'operationalStatus', 'held',
        'bookingDate', '2026-08-24',
        'timeLimitAt', '2026-09-10T12:00',
        'issuedAt', null,
        'currency', 'GBP',
        'fares', jsonb_build_array(
          jsonb_build_object(
            'passengerType', 'ADT',
            'quantity', 1,
            'unitSupplierCost', 100
          )
        ),
        'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000002',
        'assistantEmployeeIds', '[]'::jsonb,
        'attributionReason', 'Admin completion race fixture ownership'
      )
    );
  end loop;
end
$$;

set role authenticated;
do $$
begin
  begin
    perform public.ticketing_complete_tk_details_authorized(
      '4a000000-0000-0000-0000-000000000001',
      gen_random_uuid(),
      'authenticated-authorised-completion-bypass',
      '{}'::jsonb
    );
    raise exception 'Authenticated executed the service-only authorised completion RPC';
  exception when insufficient_privilege then
    null;
  end;
end
$$;
reset role;

-- The migration appends immutable v2 tails for both legacy completion facts.
do $$
declare
  root_transaction_id_value uuid;
  source_kind text;
  first_event_id uuid;
begin
  select root.id
  into root_transaction_id_value
  from public.ticket_bookings booking
  join public.ticket_transactions root
    on root.booking_id = booking.id
    and root.service_type = 'TK'
    and root.parent_transaction_id is null
  where booking.normalized_pnr = 'AC-UPG1';

  foreach source_kind in array array['sale-completed', 'paid']
  loop
    select source_event.id
    into first_event_id
    from public.commission_source_events source_event
    where source_event.source_record_id = root_transaction_id_value
      and source_event.source_fact_key =
        'transaction:' || root_transaction_id_value::text || ':' || source_kind
      and source_event.event_version = 1;

    if first_event_id is null or not exists (
      select 1
      from public.commission_source_events source_event
      where source_event.source_record_id = root_transaction_id_value
        and source_event.source_fact_key =
          'transaction:' || root_transaction_id_value::text || ':' || source_kind
        and source_event.event_version = 2
        and source_event.supersedes_event_id = first_event_id
        and source_event.employee_id = '4a000000-0000-0000-0000-000000000002'
        and source_event.owner_employee_id = source_event.employee_id
        and source_event.variables ->> 'acting_employee_id' =
          '4a000000-0000-0000-0000-000000000002'
        and source_event.variables ->> 'primary_responsible_employee_id' =
          '4a000000-0000-0000-0000-000000000002'
        and source_event.variables -> 'assistant_employee_ids' = jsonb_build_array(
          '4a000000-0000-0000-0000-000000000003'
        )
        and source_event.variables -> 'issued_ticket_target_units' = '0'::jsonb
        and source_event.variables -> 'assistant_target_units' = '0'::jsonb
        and source_event.idempotency_key like 'tkac:v1:%'
    ) then
      raise exception 'Legacy % source fact did not receive one attributed v2 tail', source_kind;
    end if;
  end loop;

  if (
    select max(source_event.event_version)
    from public.commission_source_events source_event
    where source_event.source_record_id = root_transaction_id_value
      and source_event.source_fact_key =
        'transaction:' || root_transaction_id_value::text || ':issued'
  ) <> 1 then
    raise exception 'Already-enriched issued source fact received a needless correction';
  end if;
end
$$;

-- Create one issued root TK owned by Primary A but entered by Admin. Admin then
-- completes missing sale/passenger details on behalf of the locked primary.
do $$
declare
  created jsonb;
  booking_id_value uuid;
  transaction_id_value uuid;
  booking_version_value bigint;
  transaction_version_value bigint;
  details jsonb;
  first_result jsonb;
  replay_result jsonb;
  no_op_result jsonb;
  audit_count_value integer;
  source_count_value integer;
  error_hint text;
begin
  created := public.ticketing_create_quick_tk_attributed(
    '4a000000-0000-0000-0000-000000000001',
    'admin-completion-create',
    jsonb_build_object(
      'customerName', 'Admin Completion Customer',
      'pnr', 'AC-MAIN1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-24',
      'timeLimitAt', null,
      'issuedAt', '2026-08-24',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT',
          'quantity', 1,
          'unitSupplierCost', 100
        )
      ),
      'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000002',
      'assistantEmployeeIds', jsonb_build_array(
        '4a000000-0000-0000-0000-000000000003'
      ),
      'attributionReason', 'Admin entered for Primary A'
    )
  );

  booking_id_value := (created #>> '{booking,id}')::uuid;
  transaction_id_value := (created #>> '{transaction,id}')::uuid;

  select booking.version, transaction.version
  into booking_version_value, transaction_version_value
  from public.ticket_bookings booking
  join public.ticket_transactions transaction
    on transaction.id = transaction_id_value
  where booking.id = booking_id_value;

  details := jsonb_build_object(
    'expectedBookingVersion', booking_version_value,
    'expectedTransactionVersion', transaction_version_value,
    'contactPhone', '+44 7000 240302',
    'departureDate', '2026-10-01',
    'returnDate', null,
    'paymentStatus', 'unpaid',
    'paidAt', null,
    'fareSales', jsonb_build_array(
      jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', 150)
    ),
    'passengers', jsonb_build_array(
      jsonb_build_object(
        'passengerType', 'ADT',
        'position', 1,
        'fullName', 'Admin Entered Passenger',
        'contactPhone', null,
        'dateOfBirth', null,
        'ticketNumber', 'ADMIN-001'
      )
    ),
    'onBehalfReason', 'Primary agent is unavailable'
  );

  first_result := public.ticketing_complete_tk_details_authorized(
    '4a000000-0000-0000-0000-000000000001',
    booking_id_value,
    'admin-completion-details',
    details
  );
  replay_result := public.ticketing_complete_tk_details_authorized(
    '4a000000-0000-0000-0000-000000000001',
    booking_id_value,
    'admin-completion-details',
    details
  );

  if (first_result ->> 'changed')::boolean is not true
    or (first_result ->> 'idempotentReplay')::boolean is not false
    or (replay_result ->> 'idempotentReplay')::boolean is not true
    or first_result #>> '{booking,id}' is distinct from replay_result #>> '{booking,id}'
  then
    raise exception 'On-behalf completion or replay response is incorrect';
  end if;

  if not exists (
    select 1
    from public.ticket_bookings booking
    join public.ticket_transactions transaction on transaction.id = transaction_id_value
    join public.ticket_transaction_passengers allocation
      on allocation.transaction_id = transaction.id
    join public.ticket_passengers passenger on passenger.id = allocation.passenger_id
    where booking.id = booking_id_value
      and booking.owner_employee_id = '4a000000-0000-0000-0000-000000000002'
      and booking.updated_by = '4a000000-0000-0000-0000-000000000001'
      and transaction.owner_employee_id = booking.owner_employee_id
      and transaction.acting_employee_id = '4a000000-0000-0000-0000-000000000001'
      and passenger.created_by = '4a000000-0000-0000-0000-000000000001'
      and passenger.full_name = 'Admin Entered Passenger'
  ) then
    raise exception 'On-behalf completion impersonated or transferred the responsible owner';
  end if;

  if (
    select count(*)
    from public.ticket_audit_events audit
    where audit.booking_id = booking_id_value
      and audit.action = 'complete_tk_details_on_behalf'
      and audit.actor_employee_id = '4a000000-0000-0000-0000-000000000001'
      and audit.reason = 'Primary agent is unavailable'
      and audit.after_state ->> 'primary_responsible_employee_id' =
        '4a000000-0000-0000-0000-000000000002'
      and audit.after_state ->> 'acting_employee_id' = audit.actor_employee_id::text
      and audit.after_state ->> 'completion_mode' = 'on_behalf'
  ) <> 1 then
    raise exception 'On-behalf completion audit fact is incorrect';
  end if;

  if not exists (
    select 1
    from public.commission_source_events source_event
    where source_event.source_record_id = transaction_id_value
      and source_event.source_fact_key =
        'transaction:' || transaction_id_value::text || ':sale-completed'
      and source_event.event_version = 1
      and source_event.employee_id = '4a000000-0000-0000-0000-000000000002'
      and source_event.owner_employee_id = source_event.employee_id
      and source_event.variables ->> 'acting_employee_id' =
        '4a000000-0000-0000-0000-000000000001'
      and source_event.variables ->> 'primary_responsible_employee_id' =
        '4a000000-0000-0000-0000-000000000002'
      and source_event.variables -> 'assistant_employee_ids' = jsonb_build_array(
        '4a000000-0000-0000-0000-000000000003'
      )
      and source_event.variables -> 'issued_ticket_target_units' = '0'::jsonb
      and source_event.variables -> 'assistant_target_units' = '0'::jsonb
  ) then
    raise exception 'On-behalf sale completion source attribution is incorrect';
  end if;

  if not exists (
    select 1
    from public.commission_source_events source_event
    where source_event.source_record_id = transaction_id_value
      and source_event.source_fact_key =
        'transaction:' || transaction_id_value::text || ':issued'
      and source_event.employee_id = '4a000000-0000-0000-0000-000000000002'
      and source_event.variables -> 'issued_ticket_target_units' = '1'::jsonb
      and source_event.variables -> 'assistant_target_units' = '0'::jsonb
  ) then
    raise exception 'Issued target ownership moved away from the primary';
  end if;

  audit_count_value := (
    select count(*) from public.ticket_audit_events
    where booking_id = booking_id_value
  );
  source_count_value := (
    select count(*) from public.commission_source_events
    where source_record_id = transaction_id_value
  );

  details := details || jsonb_build_object(
    'expectedBookingVersion', (first_result #>> '{booking,version}')::bigint,
    'expectedTransactionVersion', (first_result #>> '{transaction,version}')::bigint
  );
  no_op_result := public.ticketing_complete_tk_details_authorized(
    '4a000000-0000-0000-0000-000000000001',
    booking_id_value,
    'admin-completion-no-op',
    details
  );

  if (no_op_result ->> 'changed')::boolean is not false
    or no_op_result ->> 'auditEventId' is not null
    or (select count(*) from public.ticket_audit_events
        where booking_id = booking_id_value) <> audit_count_value
    or (select count(*) from public.commission_source_events
        where source_record_id = transaction_id_value) <> source_count_value
  then
    raise exception 'On-behalf no-op created an audit or source fact';
  end if;

  begin
    perform public.ticketing_complete_tk_details_authorized(
      '4a000000-0000-0000-0000-000000000001',
      booking_id_value,
      'admin-completion-no-op',
      details || jsonb_build_object('contactPhone', '+44 7000 999999')
    );
    raise exception 'Changed authorised payload reused an idempotency key';
  exception when invalid_parameter_value then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint <> 'TICKETING_IDEMPOTENCY_CONFLICT' then
      raise exception 'Authorised idempotency conflict hint is incorrect: %', error_hint;
    end if;
  end;

  begin
    perform public.ticketing_complete_tk_details_authorized(
      '4a000000-0000-0000-0000-000000000001',
      booking_id_value,
      'admin-completion-missing-reason',
      details || jsonb_build_object(
        'contactPhone', '+44 7000 240303',
        'onBehalfReason', null
      )
    );
    raise exception 'Admin completed another employee''s ticket without a reason';
  exception when invalid_parameter_value then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint <> 'TICKETING_ON_BEHALF_REASON_REQUIRED' then
      raise exception 'Missing reason hint is incorrect: %', error_hint;
    end if;
  end;

  begin
    perform public.ticketing_complete_tk_details_authorized(
      '4a000000-0000-0000-0000-000000000006',
      booking_id_value,
      'manager-on-behalf-forbidden',
      details || jsonb_build_object(
        'contactPhone', '+44 7000 240304',
        'onBehalfReason', 'Manager cover'
      )
    );
    raise exception 'Manager completed another employee''s ticket';
  exception when insufficient_privilege then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint <> 'TICKETING_ON_BEHALF_FORBIDDEN' then
      raise exception 'Manager on-behalf hint is incorrect: %', error_hint;
    end if;
  end;

  begin
    perform public.ticketing_complete_tk_details_authorized(
      '4a000000-0000-0000-0000-000000000002',
      booking_id_value,
      'owner-reason-forbidden',
      details || jsonb_build_object('onBehalfReason', 'Not actually on behalf')
    );
    raise exception 'Self-completion accepted an on-behalf reason';
  exception when invalid_parameter_value then
    get stacked diagnostics error_hint = pg_exception_hint;
    if error_hint <> 'TICKETING_ON_BEHALF_REASON_NOT_ALLOWED' then
      raise exception 'Self reason hint is incorrect: %', error_hint;
    end if;
  end;
end
$$;

-- A second real admin change posts payment. The admin remains the actor while
-- the primary remains the source recipient and payment contributes no target.
do $$
declare
  booking_id_value uuid;
  transaction_id_value uuid;
  booking_version_value bigint;
  transaction_version_value bigint;
  result_value jsonb;
begin
  select booking.id, root.id, booking.version, root.version
  into booking_id_value, transaction_id_value,
    booking_version_value, transaction_version_value
  from public.ticket_bookings booking
  join public.ticket_transactions root
    on root.booking_id = booking.id
    and root.service_type = 'TK'
    and root.parent_transaction_id is null
  where booking.normalized_pnr = 'AC-MAIN1';

  result_value := public.ticketing_complete_tk_details_authorized(
    '4a000000-0000-0000-0000-000000000001',
    booking_id_value,
    'admin-completion-payment',
    jsonb_build_object(
      'expectedBookingVersion', booking_version_value,
      'expectedTransactionVersion', transaction_version_value,
      'contactPhone', '+44 7000 240302',
      'departureDate', '2026-10-01',
      'returnDate', null,
      'paymentStatus', 'paid',
      'paidAt', '2026-08-25',
      'fareSales', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', 150)
      ),
      'passengers', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT',
          'position', 1,
          'fullName', 'Admin Entered Passenger',
          'contactPhone', null,
          'dateOfBirth', null,
          'ticketNumber', 'ADMIN-001'
        )
      ),
      'onBehalfReason', 'Admin received customer payment'
    )
  );

  if (result_value ->> 'changed')::boolean is not true
    or result_value #>> '{transaction,paymentStatus}' <> 'paid'
    or not exists (
      select 1
      from public.commission_source_events source_event
      where source_event.source_record_id = transaction_id_value
        and source_event.source_fact_key =
          'transaction:' || transaction_id_value::text || ':paid'
        and source_event.employee_id = '4a000000-0000-0000-0000-000000000002'
        and source_event.variables ->> 'acting_employee_id' =
          '4a000000-0000-0000-0000-000000000001'
        and source_event.variables -> 'issued_ticket_target_units' = '0'::jsonb
        and source_event.variables -> 'assistant_target_units' = '0'::jsonb
    )
  then
    raise exception 'On-behalf payment source attribution is incorrect';
  end if;
end
$$;

-- Correct a completed and paid booking. Every existing root fact receives one
-- linear tail for the new primary/assistant attribution, while each fact keeps
-- its own immutable acting employee and only issuance keeps target units.
do $$
declare
  booking_id_value uuid;
  transaction_id_value uuid;
  booking_version_value bigint;
  correction_payload jsonb;
  first_result jsonb;
  replay_result jsonb;
  source_count_before integer;
  source_count_after integer;
  source_kind text;
  expected_version integer;
  expected_actor uuid;
  expected_target integer;
begin
  select booking.id, root.id, booking.version
  into booking_id_value, transaction_id_value, booking_version_value
  from public.ticket_bookings booking
  join public.ticket_transactions root
    on root.booking_id = booking.id
    and root.service_type = 'TK'
    and root.parent_transaction_id is null
  where booking.normalized_pnr = 'AC-UPG1';

  select count(*)
  into source_count_before
  from public.commission_source_events source_event
  where source_event.source_record_id = transaction_id_value;

  correction_payload := jsonb_build_object(
    'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000004',
    'assistantEmployeeIds', jsonb_build_array(
      '4a000000-0000-0000-0000-000000000005'
    ),
    'reason', 'Completed booking attribution correction'
  );

  first_result := public.ticketing_correct_booking_attribution(
    '4a000000-0000-0000-0000-000000000001',
    booking_id_value,
    booking_version_value,
    'admin-completion-source-correction',
    correction_payload
  );
  replay_result := public.ticketing_correct_booking_attribution(
    '4a000000-0000-0000-0000-000000000001',
    booking_id_value,
    booking_version_value,
    'admin-completion-source-correction',
    correction_payload
  );

  select count(*)
  into source_count_after
  from public.commission_source_events source_event
  where source_event.source_record_id = transaction_id_value;

  if (first_result ->> 'idempotentReplay')::boolean is not false
    or (replay_result ->> 'idempotentReplay')::boolean is not true
    or jsonb_array_length(first_result -> 'sourceEventCorrections') <> 3
    or source_count_after <> source_count_before + 3
    or not exists (
      select 1
      from public.ticket_bookings booking
      join public.ticket_transactions root on root.id = transaction_id_value
      where booking.id = booking_id_value
        and booking.owner_employee_id = '4a000000-0000-0000-0000-000000000004'
        and root.owner_employee_id = booking.owner_employee_id
    )
  then
    raise exception 'Completed booking attribution correction or replay is incorrect';
  end if;

  foreach source_kind in array array['issued', 'sale-completed', 'paid']
  loop
    expected_version := case when source_kind = 'issued' then 2 else 3 end;
    expected_actor := case
      when source_kind = 'issued'
        then '4a000000-0000-0000-0000-000000000001'::uuid
      else '4a000000-0000-0000-0000-000000000002'::uuid
    end;
    expected_target := case when source_kind = 'issued' then 2 else 0 end;

    if not exists (
      select 1
      from public.commission_source_events latest
      join public.commission_source_events prior
        on prior.id = latest.supersedes_event_id
        and prior.source_fact_key = latest.source_fact_key
        and prior.event_version = latest.event_version - 1
      where latest.source_record_id = transaction_id_value
        and latest.source_fact_key =
          'transaction:' || transaction_id_value::text || ':' || source_kind
        and latest.event_version = expected_version
        and latest.employee_id = '4a000000-0000-0000-0000-000000000004'
        and latest.owner_employee_id = latest.employee_id
        and latest.variables ->> 'acting_employee_id' = expected_actor::text
        and latest.variables ->> 'primary_responsible_employee_id' =
          latest.employee_id::text
        and latest.variables -> 'assistant_employee_ids' = jsonb_build_array(
          '4a000000-0000-0000-0000-000000000005'
        )
        and latest.variables -> 'issued_ticket_target_units' =
          to_jsonb(expected_target)
        and latest.variables -> 'assistant_target_units' = '0'::jsonb
    ) then
      raise exception 'Corrected % source tail lost lineage, actor, recipient, or target facts',
        source_kind;
    end if;
  end loop;

  if (
    select count(*)
    from public.commission_source_events source_event
    where source_event.source_record_id = transaction_id_value
  ) <> source_count_after then
    raise exception 'Attribution correction replay duplicated a source tail';
  end if;
end
$$;

-- Legacy owner RPC remains callable, and the expanded trigger enriches its new
-- sale source fact even though the old function does not build those fields.
do $$
declare
  created jsonb;
  booking_id_value uuid;
  transaction_id_value uuid;
  booking_version_value bigint;
  transaction_version_value bigint;
begin
  created := public.ticketing_create_quick_tk_attributed(
    '4a000000-0000-0000-0000-000000000001',
    'admin-completion-legacy-create',
    jsonb_build_object(
      'customerName', 'Legacy Owner Completion',
      'pnr', 'AC-LEG1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-24',
      'timeLimitAt', null,
      'issuedAt', '2026-08-24',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT',
          'quantity', 1,
          'unitSupplierCost', 90
        )
      ),
      'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000002',
      'assistantEmployeeIds', jsonb_build_array(
        '4a000000-0000-0000-0000-000000000003'
      ),
      'attributionReason', 'Legacy post-2403 trigger fixture'
    )
  );

  booking_id_value := (created #>> '{booking,id}')::uuid;
  transaction_id_value := (created #>> '{transaction,id}')::uuid;
  select booking.version, root.version
  into booking_version_value, transaction_version_value
  from public.ticket_bookings booking
  join public.ticket_transactions root on root.id = transaction_id_value
  where booking.id = booking_id_value;

  perform public.ticketing_complete_tk_details(
    '4a000000-0000-0000-0000-000000000002',
    booking_id_value,
    'admin-completion-legacy-details',
    jsonb_build_object(
      'expectedBookingVersion', booking_version_value,
      'expectedTransactionVersion', transaction_version_value,
      'contactPhone', '+44 7000 240305',
      'departureDate', '2026-11-01',
      'returnDate', null,
      'paymentStatus', 'unpaid',
      'paidAt', null,
      'fareSales', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', 120)
      ),
      'passengers', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT',
          'position', 1,
          'fullName', 'Legacy Owner Passenger',
          'contactPhone', null,
          'dateOfBirth', null,
          'ticketNumber', 'LEG-001'
        )
      )
    )
  );

  if not exists (
    select 1
    from public.commission_source_events source_event
    where source_event.source_record_id = transaction_id_value
      and source_event.source_fact_key =
        'transaction:' || transaction_id_value::text || ':sale-completed'
      and source_event.event_version = 1
      and source_event.employee_id = '4a000000-0000-0000-0000-000000000002'
      and source_event.variables ->> 'acting_employee_id' = source_event.employee_id::text
      and source_event.variables ->> 'primary_responsible_employee_id' =
        source_event.employee_id::text
      and source_event.variables -> 'assistant_employee_ids' = jsonb_build_array(
        '4a000000-0000-0000-0000-000000000003'
      )
      and source_event.variables -> 'issued_ticket_target_units' = '0'::jsonb
      and source_event.variables -> 'assistant_target_units' = '0'::jsonb
  ) then
    raise exception 'Expanded source trigger did not cover legacy owner completion';
  end if;
end
$$;
