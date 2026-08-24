\set ON_ERROR_STOP on

insert into public.roles (id, name, level)
select '1a000000-0000-0000-0000-000000000001', 'Admin', 10
where not exists (
  select 1 from public.roles where lower(btrim(name)) = 'admin'
);

insert into public.roles (id, name, level)
select '1a000000-0000-0000-0000-000000000002', 'Manager', 5
where not exists (
  select 1 from public.roles where lower(btrim(name)) = 'manager'
);

insert into auth.users (id, email)
values
  ('4a000000-0000-0000-0000-000000000001', 'attribution-admin@example.test'),
  ('4a000000-0000-0000-0000-000000000002', 'attribution-primary-a@example.test'),
  ('4a000000-0000-0000-0000-000000000003', 'attribution-assistant-a@example.test'),
  ('4a000000-0000-0000-0000-000000000004', 'attribution-primary-b@example.test'),
  ('4a000000-0000-0000-0000-000000000005', 'attribution-assistant-b@example.test'),
  ('4a000000-0000-0000-0000-000000000006', 'attribution-manager@example.test')
on conflict (id) do nothing;

insert into public.employees (
  id,
  full_name,
  email,
  role_id,
  location_id,
  is_active
)
values
  (
    '4a000000-0000-0000-0000-000000000001',
    'Attribution Admin',
    'attribution-admin@example.test',
    (select id from public.roles where lower(btrim(name)) = 'admin' limit 1),
    '30000000-0000-0000-0000-000000000001',
    true
  ),
  (
    '4a000000-0000-0000-0000-000000000002',
    'Attribution Primary A',
    'attribution-primary-a@example.test',
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    true
  ),
  (
    '4a000000-0000-0000-0000-000000000003',
    'Attribution Assistant A',
    'attribution-assistant-a@example.test',
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    true
  ),
  (
    '4a000000-0000-0000-0000-000000000004',
    'Attribution Primary B',
    'attribution-primary-b@example.test',
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    true
  ),
  (
    '4a000000-0000-0000-0000-000000000005',
    'Attribution Assistant B',
    'attribution-assistant-b@example.test',
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    true
  ),
  (
    '4a000000-0000-0000-0000-000000000006',
    'Attribution Manager',
    'attribution-manager@example.test',
    (select id from public.roles where lower(btrim(name)) = 'manager' limit 1),
    '30000000-0000-0000-0000-000000000001',
    true
  )
on conflict (id) do update set is_active = true;

insert into public.employee_departments (employee_id, department_id)
select employee_id, '20000000-0000-0000-0000-000000000001'::uuid
from unnest(array[
  '4a000000-0000-0000-0000-000000000002'::uuid,
  '4a000000-0000-0000-0000-000000000003'::uuid,
  '4a000000-0000-0000-0000-000000000004'::uuid,
  '4a000000-0000-0000-0000-000000000005'::uuid
]) membership(employee_id)
on conflict do nothing;

do $$
declare
  status_value jsonb;
begin
  if pg_catalog.to_regclass('public.ticket_booking_attribution_versions') is null
    or pg_catalog.to_regclass('public.ticket_booking_attribution_assistants') is null
    or pg_catalog.to_regclass('public.ticket_booking_current_attribution') is null
    or pg_catalog.to_regclass('public.ticket_attribution_write_contexts') is null
  then
    raise exception 'Ticket attribution relations are missing';
  end if;

  if pg_catalog.to_regprocedure(
    'public.ticketing_create_quick_tk_attributed(uuid,text,jsonb)'
  ) is null or pg_catalog.to_regprocedure(
    'public.ticketing_correct_booking_attribution(uuid,uuid,bigint,text,jsonb)'
  ) is null then
    raise exception 'Ticket attribution RPCs are missing';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.ticketing_create_quick_tk_attributed(uuid,text,jsonb)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.ticketing_correct_booking_attribution(uuid,uuid,bigint,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.ticketing_create_quick_tk_attributed(uuid,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.ticketing_correct_booking_attribution(uuid,uuid,bigint,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Ticket attribution RPC grants are incorrect';
  end if;

  if has_table_privilege(
    'service_role', 'public.ticket_attribution_write_contexts', 'SELECT'
  ) or has_table_privilege(
    'service_role', 'public.ticket_attribution_write_contexts', 'INSERT'
  ) or has_table_privilege(
    'service_role', 'public.ticket_booking_attribution_versions', 'INSERT'
  ) or has_table_privilege(
    'service_role', 'public.ticket_booking_attribution_versions', 'UPDATE'
  ) or has_table_privilege(
    'service_role', 'public.ticket_booking_attribution_assistants', 'INSERT'
  ) or not has_table_privilege(
    'service_role', 'public.ticket_booking_attribution_versions', 'SELECT'
  ) or not has_table_privilege(
    'service_role', 'public.ticket_booking_current_attribution', 'SELECT'
  ) then
    raise exception 'Ticket attribution table boundary is incorrect';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid =
      'public.ticket_booking_attribution_versions'::regclass
      and constraint_row.conname =
        'ticket_booking_attribution_versions_primary_employee_id_fkey'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid =
      'public.ticket_booking_attribution_assistants'::regclass
      and constraint_row.conname =
        'ticket_booking_attribution_assistants_employee_id_fkey'
  ) then
    raise exception 'PostgREST attribution employee relationships are missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.ticket_transactions'::regclass
      and trigger_row.tgname = 'ticket_transactions_record_initial_attribution_2402'
      and not trigger_row.tgisinternal
  ) or not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.commission_source_events'::regclass
      and trigger_row.tgname = 'commission_source_events_enrich_ticket_attribution_2402'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'Post-ratchet attribution invariant triggers are missing';
  end if;

  status_value := public.ticketing_schema_status();
  if (status_value ->> 'ready')::boolean is not true
    or (status_value ->> 'version')::bigint <> 2026082402
    or (status_value ->> 'requiredVersion')::bigint <> 2026082402
    or not (
      status_value #> '{details,capabilities}' ?& array[
        'primary-ticket-attribution',
        'assistant-attribution-with-zero-target-units',
        'root-tk-only-assistant-attribution',
        'primary-only-issued-ticket-target-units',
        'immutable-attribution-history',
        'audited-attribution-corrections',
        'legacy-quick-entry-attribution-invariant'
      ]
    )
  then
    raise exception 'Ticket attribution capability status is incorrect: %', status_value;
  end if;

  if exists (
    select 1
    from public.commission_source_events source_event
    join public.ticket_transactions transaction
      on transaction.id = source_event.source_record_id
    where transaction.service_type in ('DC', 'R-ER')
      and source_event.source_fact_key =
        'transaction:' || transaction.id::text || ':issued'
      and (
        source_event.variables ? 'primary_responsible_employee_id'
        or source_event.variables ? 'assistant_employee_ids'
        or source_event.variables ? 'assistant_target_units'
      )
  ) then
    raise exception 'Root-TK attribution backfill leaked into DC/R-ER facts';
  end if;
end
$$;

-- A legacy Quick TK call remains supported, but it can no longer bypass the
-- post-ratchet version-1 attribution and target-source invariant.
do $$
declare
  created jsonb;
  booking_id_value uuid;
  transaction_id_value uuid;
begin
  created := public.ticketing_create_quick_tk(
    '4a000000-0000-0000-0000-000000000002',
    'attribution-legacy-invariant',
    jsonb_build_object(
      'customerName', 'Legacy Attribution Invariant',
      'pnr', 'ATTR-L1',
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
          'quantity', 2,
          'unitSupplierCost', 100
        )
      )
    )
  );
  booking_id_value := (created #>> '{booking,id}')::uuid;
  transaction_id_value := (created #>> '{transaction,id}')::uuid;

  if (
    select count(*)
    from public.ticket_booking_attribution_versions attribution
    where attribution.booking_id = booking_id_value
      and attribution.attribution_version = 1
      and attribution.primary_employee_id =
        '4a000000-0000-0000-0000-000000000002'
      and attribution.entered_by_employee_id =
        '4a000000-0000-0000-0000-000000000002'
  ) <> 1 or exists (
    select 1
    from public.ticket_booking_attribution_assistants assistant
    where assistant.booking_id = booking_id_value
  ) or (
    select count(*)
    from public.commission_source_events source_event
    where source_event.source_record_id = transaction_id_value
      and source_event.event_version = 1
      and source_event.employee_id =
        '4a000000-0000-0000-0000-000000000002'
      and source_event.variables ->> 'acting_employee_id' =
        '4a000000-0000-0000-0000-000000000002'
      and source_event.variables ->> 'primary_responsible_employee_id' =
        '4a000000-0000-0000-0000-000000000002'
      and source_event.variables -> 'assistant_employee_ids' = '[]'::jsonb
      and (source_event.variables ->> 'issued_ticket_target_units')::integer = 2
      and (source_event.variables ->> 'assistant_target_units')::integer = 0
  ) <> 1 then
    raise exception 'Legacy Quick TK bypassed attribution or target source facts';
  end if;
end
$$;

-- An admin can enter an issued TK for another primary employee and one
-- assistant. The primary owns every row and target unit; the admin remains the
-- immutable actor and the assistant receives zero target units.
do $$
declare
  entry_value jsonb;
  created jsonb;
  replayed jsonb;
  booking_id_value uuid;
  transaction_id_value uuid;
  error_hint text;
begin
  entry_value := jsonb_build_object(
    'customerName', 'Attributed Issued Customer',
    'pnr', 'ATTR-I1',
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
        'quantity', 2,
        'unitSupplierCost', 150
      ),
      jsonb_build_object(
        'passengerType', 'CHD',
        'quantity', 1,
        'unitSupplierCost', 100
      )
    ),
    'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000002',
    'assistantEmployeeIds', jsonb_build_array(
      '4a000000-0000-0000-0000-000000000003'
    ),
    'attributionReason', 'Admin covered entry while the agent was unavailable'
  );

  created := public.ticketing_create_quick_tk_attributed(
    '4a000000-0000-0000-0000-000000000001',
    'attribution-issued-create',
    entry_value
  );
  booking_id_value := (created #>> '{booking,id}')::uuid;
  transaction_id_value := (created #>> '{transaction,id}')::uuid;

  if (created ->> 'idempotentReplay')::boolean is not false
    or created #>> '{booking,ownerEmployeeId}' <>
      '4a000000-0000-0000-0000-000000000002'
    or created #>> '{attribution,primaryEmployeeId}' <>
      '4a000000-0000-0000-0000-000000000002'
    or created #>> '{attribution,enteredByEmployeeId}' <>
      '4a000000-0000-0000-0000-000000000001'
    or created #>> '{attribution,changedByEmployeeId}' <>
      '4a000000-0000-0000-0000-000000000001'
    or created #> '{attribution,assistantEmployeeIds}' <>
      jsonb_build_array('4a000000-0000-0000-0000-000000000003')
  then
    raise exception 'Attributed Quick TK response is incorrect: %', created;
  end if;

  if not exists (
    select 1
    from public.ticket_bookings booking
    join public.ticket_transactions transaction
      on transaction.booking_id = booking.id
    where booking.id = booking_id_value
      and transaction.id = transaction_id_value
      and booking.owner_employee_id =
        '4a000000-0000-0000-0000-000000000002'
      and transaction.owner_employee_id = booking.owner_employee_id
      and transaction.acting_employee_id =
        '4a000000-0000-0000-0000-000000000001'
  ) or not exists (
    select 1
    from public.ticket_booking_current_attribution attribution
    where attribution.booking_id = booking_id_value
      and attribution.attribution_version = 1
      and attribution.primary_employee_id =
        '4a000000-0000-0000-0000-000000000002'
      and attribution.entered_by_employee_id =
        '4a000000-0000-0000-0000-000000000001'
      and attribution.assistant_employee_ids = array[
        '4a000000-0000-0000-0000-000000000003'::uuid
      ]
  ) then
    raise exception 'Attributed Quick TK ownership/history is incorrect';
  end if;

  if (
    select count(*)
    from public.commission_source_events source_event
    where source_event.source_record_id = transaction_id_value
      and source_event.source_fact_key =
        'transaction:' || transaction_id_value::text || ':issued'
      and source_event.event_version = 1
      and source_event.supersedes_event_id is null
      and source_event.employee_id =
        '4a000000-0000-0000-0000-000000000002'
      and source_event.owner_employee_id = source_event.employee_id
      and source_event.variables ->> 'acting_employee_id' =
        '4a000000-0000-0000-0000-000000000001'
      and source_event.variables ->> 'primary_responsible_employee_id' =
        '4a000000-0000-0000-0000-000000000002'
      and source_event.variables -> 'assistant_employee_ids' =
        jsonb_build_array('4a000000-0000-0000-0000-000000000003')
      and (source_event.variables ->> 'issued_ticket_target_units')::integer = 3
      and (source_event.variables ->> 'assistant_target_units')::integer = 0
  ) <> 1 then
    raise exception 'Initial issued attribution source event is incorrect';
  end if;

  if (
    select count(*)
    from public.ticket_audit_events audit
    where audit.booking_id = booking_id_value
      and audit.action = 'initial_ticket_attribution'
      and audit.actor_employee_id =
        '4a000000-0000-0000-0000-000000000001'
      and audit.reason = 'Admin covered entry while the agent was unavailable'
  ) <> 1 then
    raise exception 'Initial ticket attribution audit is missing';
  end if;

  update public.employees
  set is_active = false
  where id = '4a000000-0000-0000-0000-000000000003';

  replayed := public.ticketing_create_quick_tk_attributed(
    '4a000000-0000-0000-0000-000000000001',
    'attribution-issued-create',
    entry_value
  );

  update public.employees
  set is_active = true
  where id = '4a000000-0000-0000-0000-000000000003';

  if (replayed ->> 'idempotentReplay')::boolean is not true
    or replayed #>> '{booking,id}' <> booking_id_value::text
    or (
      select count(*)
      from public.ticket_booking_attribution_versions attribution
      where attribution.booking_id = booking_id_value
    ) <> 1
    or (
      select count(*)
      from public.commission_source_events source_event
      where source_event.source_record_id = transaction_id_value
    ) <> 1
  then
    raise exception 'Attributed Quick TK retry was not side-effect-free';
  end if;

  begin
    perform public.ticketing_create_quick_tk_attributed(
      '4a000000-0000-0000-0000-000000000001',
      'attribution-issued-create',
      jsonb_set(entry_value, '{attributionReason}', '"Changed reason"'::jsonb)
    );
    raise exception 'Changed attributed Quick TK payload reused an idempotency key';
  exception when invalid_parameter_value then
    get stacked diagnostics error_hint = PG_EXCEPTION_HINT;
    if error_hint <> 'TICKETING_IDEMPOTENCY_CONFLICT' then
      raise exception 'Attributed Quick TK conflict omitted stable hint';
    end if;
  end;
end
$$;

-- Non-admin staff cannot assign another primary or assistants. Invalid role,
-- duplicate assistant, primary-as-assistant, and missing-reason requests leave
-- no write context or operational facts behind.
do $$
declare
  base_entry jsonb := jsonb_build_object(
    'customerName', 'Rejected Attribution',
    'pnr', 'ATTR-R1',
    'airlineId', '50000000-0000-0000-0000-000000000001',
    'serviceType', 'TK',
    'operationalStatus', 'issued',
    'bookingDate', '2026-08-24',
    'timeLimitAt', null,
    'issuedAt', '2026-08-24',
    'currency', 'GBP',
    'fares', jsonb_build_array(
      jsonb_build_object(
        'passengerType', 'ADT', 'quantity', 1, 'unitSupplierCost', 100
      )
    )
  );
begin
  begin
    perform public.ticketing_create_quick_tk_attributed(
      '4a000000-0000-0000-0000-000000000002',
      'attribution-non-admin-override',
      base_entry || jsonb_build_object(
        'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000004',
        'assistantEmployeeIds', '[]'::jsonb,
        'attributionReason', 'Attempted non-admin override'
      )
    );
    raise exception 'Non-admin overrode Quick TK attribution';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.ticketing_create_quick_tk_attributed(
      '4a000000-0000-0000-0000-000000000001',
      'attribution-duplicate-assistant',
      base_entry || jsonb_build_object(
        'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000002',
        'assistantEmployeeIds', jsonb_build_array(
          '4a000000-0000-0000-0000-000000000003',
          '4a000000-0000-0000-0000-000000000003'
        ),
        'attributionReason', 'Duplicate assistant rejection'
      )
    );
    raise exception 'Duplicate assistant was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_create_quick_tk_attributed(
      '4a000000-0000-0000-0000-000000000001',
      'attribution-primary-assistant',
      base_entry || jsonb_build_object(
        'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000002',
        'assistantEmployeeIds', jsonb_build_array(
          '4a000000-0000-0000-0000-000000000002'
        ),
        'attributionReason', 'Primary assistant rejection'
      )
    );
    raise exception 'Primary employee was accepted as an assistant';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.ticketing_create_quick_tk_attributed(
      '4a000000-0000-0000-0000-000000000001',
      'attribution-missing-reason',
      base_entry || jsonb_build_object(
        'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000002',
        'assistantEmployeeIds', '[]'::jsonb,
        'attributionReason', null
      )
    );
    raise exception 'Primary override without a reason was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  update public.employees
  set is_active = false
  where id = '4a000000-0000-0000-0000-000000000004';

  begin
    perform public.ticketing_create_quick_tk_attributed(
      '4a000000-0000-0000-0000-000000000001',
      'attribution-inactive-primary',
      base_entry || jsonb_build_object(
        'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000004',
        'assistantEmployeeIds', '[]'::jsonb,
        'attributionReason', 'Inactive primary rejection'
      )
    );
    raise exception 'Inactive Quick TK primary was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  update public.employees
  set is_active = true
  where id = '4a000000-0000-0000-0000-000000000004';

  update public.employees
  set is_active = false
  where id = '4a000000-0000-0000-0000-000000000005';

  begin
    perform public.ticketing_create_quick_tk_attributed(
      '4a000000-0000-0000-0000-000000000001',
      'attribution-inactive-assistant',
      base_entry || jsonb_build_object(
        'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000004',
        'assistantEmployeeIds', jsonb_build_array(
          '4a000000-0000-0000-0000-000000000005'
        ),
        'attributionReason', 'Inactive assistant rejection'
      )
    );
    raise exception 'Inactive Quick TK assistant was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  update public.employees
  set is_active = true
  where id = '4a000000-0000-0000-0000-000000000005';

  update public.employees
  set is_active = false
  where id = '4a000000-0000-0000-0000-000000000001';

  begin
    perform public.ticketing_create_quick_tk_attributed(
      '4a000000-0000-0000-0000-000000000001',
      'attribution-inactive-actor',
      base_entry
    );
    raise exception 'Inactive Quick TK actor was accepted';
  exception when insufficient_privilege then
    null;
  end;

  update public.employees
  set is_active = true
  where id = '4a000000-0000-0000-0000-000000000001';

  if exists (
    select 1
    from public.ticket_attribution_write_contexts
  ) or exists (
    select 1
    from public.ticket_bookings booking
    where booking.normalized_pnr = 'ATTR-R1'
  ) then
    raise exception 'Rejected attributed requests left partial state';
  end if;
end
$$;

-- A real correction advances the booking and attribution versions, updates
-- every transaction owner (including posted rows), never changes acting facts,
-- appends the next issued-event version, and remains replay-safe.
do $$
declare
  booking_id_value uuid;
  transaction_id_value uuid;
  booking_version_value bigint;
  acting_employee_id_before uuid;
  first_event_id uuid;
  correction_entry jsonb;
  corrected jsonb;
  replayed jsonb;
  error_hint text;
  history_count integer;
  audit_count integer;
  source_count integer;
begin
  select booking.id, root.id, booking.version, root.acting_employee_id
  into
    booking_id_value,
    transaction_id_value,
    booking_version_value,
    acting_employee_id_before
  from public.ticket_bookings booking
  join public.ticket_transactions root
    on root.booking_id = booking.id
    and root.service_type = 'TK'
    and root.parent_transaction_id is null
  where booking.normalized_pnr = 'ATTR-I1';

  select source_event.id
  into first_event_id
  from public.commission_source_events source_event
  where source_event.source_record_id = transaction_id_value
    and source_event.event_version = 1;

  select count(*) into history_count
  from public.ticket_booking_attribution_versions
  where booking_id = booking_id_value;
  select count(*) into audit_count
  from public.ticket_audit_events
  where booking_id = booking_id_value;
  select count(*) into source_count
  from public.commission_source_events
  where source_record_id = transaction_id_value;

  begin
    perform public.ticketing_correct_booking_attribution(
      '4a000000-0000-0000-0000-000000000001',
      booking_id_value,
      booking_version_value,
      'attribution-no-change',
      jsonb_build_object(
        'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000002',
        'assistantEmployeeIds', jsonb_build_array(
          '4a000000-0000-0000-0000-000000000003'
        ),
        'reason', 'This is intentionally not a change'
      )
    );
    raise exception 'No-op attribution correction was accepted';
  exception when invalid_parameter_value then
    get stacked diagnostics error_hint = PG_EXCEPTION_HINT;
    if error_hint <> 'TICKETING_ATTRIBUTION_NO_CHANGE' then
      raise exception 'No-op attribution rejection omitted stable hint';
    end if;
  end;

  if (select version from public.ticket_bookings where id = booking_id_value)
      <> booking_version_value
    or (select count(*) from public.ticket_booking_attribution_versions
        where booking_id = booking_id_value) <> history_count
    or (select count(*) from public.ticket_audit_events
        where booking_id = booking_id_value) <> audit_count
    or (select count(*) from public.commission_source_events
        where source_record_id = transaction_id_value) <> source_count
  then
    raise exception 'No-op correction changed ticket state';
  end if;

  begin
    perform public.ticketing_correct_booking_attribution(
      '4a000000-0000-0000-0000-000000000006',
      booking_id_value,
      booking_version_value,
      'attribution-manager-correction',
      jsonb_build_object(
        'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000004',
        'assistantEmployeeIds', '[]'::jsonb,
        'reason', 'Manager correction attempt'
      )
    );
    raise exception 'Manager corrected ticket attribution';
  exception when insufficient_privilege then
    null;
  end;

  correction_entry := jsonb_build_object(
    'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000004',
    'assistantEmployeeIds', jsonb_build_array(
      '4a000000-0000-0000-0000-000000000005'
    ),
    'reason', 'Corrected after the responsible agent confirmed ownership'
  );

  update public.employees
  set is_active = false
  where id = '4a000000-0000-0000-0000-000000000004';

  begin
    perform public.ticketing_correct_booking_attribution(
      '4a000000-0000-0000-0000-000000000001',
      booking_id_value,
      booking_version_value,
      'attribution-correction-inactive-primary',
      correction_entry
    );
    raise exception 'Inactive correction primary was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  update public.employees
  set is_active = true
  where id = '4a000000-0000-0000-0000-000000000004';

  update public.employees
  set is_active = false
  where id = '4a000000-0000-0000-0000-000000000005';

  begin
    perform public.ticketing_correct_booking_attribution(
      '4a000000-0000-0000-0000-000000000001',
      booking_id_value,
      booking_version_value,
      'attribution-correction-inactive-assistant',
      correction_entry
    );
    raise exception 'Inactive correction assistant was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  update public.employees
  set is_active = true
  where id = '4a000000-0000-0000-0000-000000000005';

  update public.employees
  set is_active = false
  where id = '4a000000-0000-0000-0000-000000000001';

  begin
    perform public.ticketing_correct_booking_attribution(
      '4a000000-0000-0000-0000-000000000001',
      booking_id_value,
      booking_version_value,
      'attribution-correction-inactive-actor',
      correction_entry
    );
    raise exception 'Inactive correction actor was accepted';
  exception when insufficient_privilege then
    null;
  end;

  update public.employees
  set is_active = true
  where id = '4a000000-0000-0000-0000-000000000001';

  corrected := public.ticketing_correct_booking_attribution(
    '4a000000-0000-0000-0000-000000000001',
    booking_id_value,
    booking_version_value,
    'attribution-valid-correction',
    correction_entry
  );

  if (corrected ->> 'idempotentReplay')::boolean is not false
    or (corrected ->> 'bookingVersion')::bigint <> booking_version_value + 1
    or corrected #>> '{attribution,version}' <> '2'
    or corrected #>> '{attribution,primaryEmployeeId}' <>
      '4a000000-0000-0000-0000-000000000004'
    or corrected #>> '{attribution,enteredByEmployeeId}' <>
      '4a000000-0000-0000-0000-000000000001'
    or corrected #>> '{attribution,changedByEmployeeId}' <>
      '4a000000-0000-0000-0000-000000000001'
    or jsonb_array_length(corrected -> 'sourceEventCorrections') <> 1
    or corrected #>> '{sourceEventCorrections,0,eventVersion}' <> '2'
  then
    raise exception 'Attribution correction response is incorrect: %', corrected;
  end if;

  if not exists (
    select 1
    from public.ticket_bookings booking
    where booking.id = booking_id_value
      and booking.owner_employee_id =
        '4a000000-0000-0000-0000-000000000004'
      and booking.version = booking_version_value + 1
  ) or exists (
    select 1
    from public.ticket_transactions transaction
    where transaction.booking_id = booking_id_value
      and (
        transaction.owner_employee_id <>
          '4a000000-0000-0000-0000-000000000004'
        or transaction.acting_employee_id <> acting_employee_id_before
      )
  ) then
    raise exception 'Attribution correction changed owner/actor facts incorrectly';
  end if;

  if (
    select count(*)
    from public.ticket_booking_attribution_versions attribution
    where attribution.booking_id = booking_id_value
  ) <> 2 or not exists (
    select 1
    from public.ticket_booking_current_attribution attribution
    where attribution.booking_id = booking_id_value
      and attribution.attribution_version = 2
      and attribution.primary_employee_id =
        '4a000000-0000-0000-0000-000000000004'
      and attribution.entered_by_employee_id =
        '4a000000-0000-0000-0000-000000000001'
      and attribution.changed_by_employee_id =
        '4a000000-0000-0000-0000-000000000001'
      and attribution.assistant_employee_ids = array[
        '4a000000-0000-0000-0000-000000000005'::uuid
      ]
  ) then
    raise exception 'Attribution correction history/current view is incorrect';
  end if;

  if (
    select count(*)
    from public.commission_source_events source_event
    where source_event.source_record_id = transaction_id_value
  ) <> 2 or not exists (
    select 1
    from public.commission_source_events source_event
    where source_event.source_record_id = transaction_id_value
      and source_event.event_version = 2
      and source_event.supersedes_event_id = first_event_id
      and source_event.employee_id =
        '4a000000-0000-0000-0000-000000000004'
      and source_event.owner_employee_id = source_event.employee_id
      and source_event.variables ->> 'acting_employee_id' =
        acting_employee_id_before::text
      and source_event.variables ->> 'primary_responsible_employee_id' =
        '4a000000-0000-0000-0000-000000000004'
      and source_event.variables -> 'assistant_employee_ids' =
        jsonb_build_array('4a000000-0000-0000-0000-000000000005')
      and (source_event.variables ->> 'issued_ticket_target_units')::integer = 3
      and (source_event.variables ->> 'assistant_target_units')::integer = 0
  ) then
    raise exception 'Corrected issued source-event lineage/facts are incorrect';
  end if;

  if (
    select count(*)
    from public.ticket_audit_events audit
    where audit.booking_id = booking_id_value
      and audit.action = 'correct_ticket_attribution'
      and audit.actor_employee_id =
        '4a000000-0000-0000-0000-000000000001'
      and audit.reason =
        'Corrected after the responsible agent confirmed ownership'
      and audit.before_state ->> 'primary_employee_id' =
        '4a000000-0000-0000-0000-000000000002'
      and audit.after_state ->> 'primary_employee_id' =
        '4a000000-0000-0000-0000-000000000004'
      and (audit.after_state ->> 'assistant_target_units')::integer = 0
  ) <> 1 then
    raise exception 'Attribution correction audit is incorrect';
  end if;

  update public.employees
  set is_active = false
  where id = '4a000000-0000-0000-0000-000000000005';

  replayed := public.ticketing_correct_booking_attribution(
    '4a000000-0000-0000-0000-000000000001',
    booking_id_value,
    booking_version_value,
    'attribution-valid-correction',
    correction_entry
  );

  update public.employees
  set is_active = true
  where id = '4a000000-0000-0000-0000-000000000005';

  if (replayed ->> 'idempotentReplay')::boolean is not true
    or replayed ->> 'bookingVersion' <> corrected ->> 'bookingVersion'
    or (select count(*) from public.ticket_booking_attribution_versions
        where booking_id = booking_id_value) <> 2
    or (select count(*) from public.commission_source_events
        where source_record_id = transaction_id_value) <> 2
  then
    raise exception 'Attribution correction retry was not side-effect-free';
  end if;

  begin
    perform public.ticketing_correct_booking_attribution(
      '4a000000-0000-0000-0000-000000000001',
      booking_id_value,
      booking_version_value,
      'attribution-valid-correction',
      jsonb_set(correction_entry, '{reason}', '"Different correction"'::jsonb)
    );
    raise exception 'Changed correction payload reused an idempotency key';
  exception when invalid_parameter_value then
    get stacked diagnostics error_hint = PG_EXCEPTION_HINT;
    if error_hint <> 'TICKETING_IDEMPOTENCY_CONFLICT' then
      raise exception 'Correction conflict omitted stable hint';
    end if;
  end;

  begin
    perform public.ticketing_correct_booking_attribution(
      '4a000000-0000-0000-0000-000000000001',
      booking_id_value,
      booking_version_value,
      'attribution-stale-correction',
      jsonb_build_object(
        'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000002',
        'assistantEmployeeIds', '[]'::jsonb,
        'reason', 'Stale correction rejection'
      )
    );
    raise exception 'Stale correction was accepted';
  exception when serialization_failure then
    get stacked diagnostics error_hint = PG_EXCEPTION_HINT;
    if error_hint <> 'TICKETING_VERSION_CONFLICT' then
      raise exception 'Stale correction omitted version-conflict hint';
    end if;
  end;
end
$$;

-- Booking-level assistants belong to the root TK sale only. Correcting the
-- root attribution must not enrich or supersede an already-issued DC/R-ER
-- fact; a future service assistant needs transaction-scoped attribution.
do $$
declare
  booking_id_value uuid;
  booking_version_value bigint;
  primary_employee_id_value uuid;
  child_transaction_id_value uuid;
  child_source_count_before integer;
  child_source_version_before integer;
  corrected jsonb;
begin
  select
    booking.id,
    booking.version,
    attribution.primary_employee_id,
    child.id
  into
    booking_id_value,
    booking_version_value,
    primary_employee_id_value,
    child_transaction_id_value
  from public.ticket_bookings booking
  join public.ticket_booking_current_attribution attribution
    on attribution.booking_id = booking.id
  join public.ticket_transactions child
    on child.booking_id = booking.id
    and child.service_type in ('DC', 'R-ER')
  where exists (
    select 1
    from public.commission_source_events source_event
    where source_event.source_record_id = child.id
      and source_event.source_fact_key =
        'transaction:' || child.id::text || ':issued'
  )
    and cardinality(attribution.assistant_employee_ids) = 0
  order by booking.created_at, child.created_at, child.id
  limit 1;

  if booking_id_value is null then
    raise exception 'Root-only assistant correction fixture was not found';
  end if;

  select count(*), max(source_event.event_version)
  into child_source_count_before, child_source_version_before
  from public.commission_source_events source_event
  where source_event.source_record_id = child_transaction_id_value
    and source_event.source_fact_key =
      'transaction:' || child_transaction_id_value::text || ':issued';

  corrected := public.ticketing_correct_booking_attribution(
    '4a000000-0000-0000-0000-000000000001',
    booking_id_value,
    booking_version_value,
    'attribution-root-only-assistant-correction',
    jsonb_build_object(
      'responsibleEmployeeId', primary_employee_id_value,
      'assistantEmployeeIds', jsonb_build_array(
        '4a000000-0000-0000-0000-000000000003'
      ),
      'reason', 'Root ticket assistance only; service transaction unchanged'
    )
  );

  if corrected #>> '{attribution,assistantEmployeeIds,0}' <>
      '4a000000-0000-0000-0000-000000000003'
    or (
      select count(*)
      from public.commission_source_events source_event
      where source_event.source_record_id = child_transaction_id_value
        and source_event.source_fact_key =
          'transaction:' || child_transaction_id_value::text || ':issued'
    ) <> child_source_count_before
    or (
      select max(source_event.event_version)
      from public.commission_source_events source_event
      where source_event.source_record_id = child_transaction_id_value
        and source_event.source_fact_key =
          'transaction:' || child_transaction_id_value::text || ':issued'
    ) <> child_source_version_before
    or exists (
      select 1
      from public.commission_source_events source_event
      where source_event.source_record_id = child_transaction_id_value
        and (
          source_event.variables ? 'primary_responsible_employee_id'
          or source_event.variables ? 'assistant_employee_ids'
          or source_event.variables ? 'assistant_target_units'
        )
    )
  then
    raise exception 'Root attribution correction changed a DC/R-ER source fact';
  end if;
end
$$;

-- A Held ticket can be corrected, including changing its primary owner, but no
-- issued source fact or target unit exists until a later issuance operation.
do $$
declare
  created jsonb;
  corrected jsonb;
  booking_id_value uuid;
  transaction_id_value uuid;
begin
  created := public.ticketing_create_quick_tk_attributed(
    '4a000000-0000-0000-0000-000000000001',
    'attribution-held-create',
    jsonb_build_object(
      'customerName', 'Attributed Held Customer',
      'pnr', 'ATTR-H1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'held',
      'bookingDate', '2026-08-24',
      'timeLimitAt', '2026-09-10T12:00',
      'issuedAt', null,
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT', 'quantity', 1, 'unitSupplierCost', 100
        )
      ),
      'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000002',
      'assistantEmployeeIds', jsonb_build_array(
        '4a000000-0000-0000-0000-000000000003'
      ),
      'attributionReason', 'Admin entered a held ticket for the agent'
    )
  );
  booking_id_value := (created #>> '{booking,id}')::uuid;
  transaction_id_value := (created #>> '{transaction,id}')::uuid;

  if jsonb_typeof(created -> 'sourceEvent') <> 'null'
    or exists (
      select 1
      from public.commission_source_events
      where source_record_id = transaction_id_value
    )
  then
    raise exception 'Held attributed Quick TK emitted target/source facts';
  end if;

  corrected := public.ticketing_correct_booking_attribution(
    '4a000000-0000-0000-0000-000000000001',
    booking_id_value,
    (created #>> '{booking,version}')::bigint,
    'attribution-held-correction',
    jsonb_build_object(
      'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000004',
      'assistantEmployeeIds', jsonb_build_array(
        '4a000000-0000-0000-0000-000000000005'
      ),
      'reason', 'Held ticket reassigned before issuance'
    )
  );

  if corrected #>> '{attribution,version}' <> '2'
    or jsonb_array_length(corrected -> 'sourceEventCorrections') <> 0
    or exists (
      select 1
      from public.commission_source_events
      where source_record_id = transaction_id_value
    )
    or not exists (
      select 1
      from public.ticket_transactions transaction
      where transaction.id = transaction_id_value
        and transaction.operational_status = 'held'
        and transaction.owner_employee_id =
          '4a000000-0000-0000-0000-000000000004'
        and transaction.acting_employee_id =
          '4a000000-0000-0000-0000-000000000001'
    )
  then
    raise exception 'Held attribution correction emitted facts or changed actor/state';
  end if;
end
$$;

-- Owner changes and history rewrites outside the audited correction RPC remain
-- blocked even for server/database-owner maintenance paths.
do $$
declare
  booking_id_value uuid;
  transaction_id_value uuid;
begin
  select booking.id, root.id
  into booking_id_value, transaction_id_value
  from public.ticket_bookings booking
  join public.ticket_transactions root
    on root.booking_id = booking.id
    and root.service_type = 'TK'
    and root.parent_transaction_id is null
  where booking.normalized_pnr = 'ATTR-I1';

  begin
    update public.ticket_bookings
    set owner_employee_id = '4a000000-0000-0000-0000-000000000002'
    where id = booking_id_value;
    raise exception 'Direct booking owner rewrite was accepted';
  exception when object_not_in_prerequisite_state then
    null;
  end;

  begin
    update public.ticket_transactions
    set owner_employee_id = '4a000000-0000-0000-0000-000000000002'
    where id = transaction_id_value;
    raise exception 'Direct transaction owner rewrite was accepted';
  exception when object_not_in_prerequisite_state then
    null;
  end;

  begin
    update public.ticket_booking_attribution_versions
    set reason = 'Rewritten history'
    where booking_id = booking_id_value
      and attribution_version = 1;
    raise exception 'Immutable attribution history was rewritten';
  exception when object_not_in_prerequisite_state then
    null;
  end;

  begin
    delete from public.ticket_booking_attribution_assistants
    where booking_id = booking_id_value;
    raise exception 'Immutable attribution assistants were deleted';
  exception when object_not_in_prerequisite_state then
    null;
  end;

  if exists (
    select 1 from public.ticket_attribution_write_contexts
  ) then
    raise exception 'Successful attribution calls leaked write contexts';
  end if;
end
$$;
