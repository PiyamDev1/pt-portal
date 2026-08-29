\set ON_ERROR_STOP on

insert into public.roles (id, name, level)
values
  ('10000000-0000-0000-0000-000000000002', 'Admin', 90),
  ('10000000-0000-0000-0000-000000000003', 'Employee', 1)
on conflict (id) do nothing;

insert into auth.users (id, email)
values
  ('40000000-0000-0000-0000-000000000002', 'admin@example.test'),
  ('40000000-0000-0000-0000-000000000003', 'assistant@example.test'),
  ('40000000-0000-0000-0000-000000000004', 'finder@example.test'),
  ('40000000-0000-0000-0000-000000000005', 'unassigned@example.test'),
  ('40000000-0000-0000-0000-000000000006', 'tiered@example.test'),
  ('40000000-0000-0000-0000-000000000007', 'variable@example.test')
on conflict (id) do nothing;

insert into public.employees (id, full_name, email, role_id, location_id)
values
  (
    '40000000-0000-0000-0000-000000000002', 'Test Admin', 'admin@example.test',
    '10000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001'
  ),
  (
    '40000000-0000-0000-0000-000000000003', 'Test Assistant', 'assistant@example.test',
    '10000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001'
  ),
  (
    '40000000-0000-0000-0000-000000000004', 'Test Finder', 'finder@example.test',
    '10000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001'
  ),
  (
    '40000000-0000-0000-0000-000000000005', 'Test Unassigned',
    'unassigned@example.test', '10000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001'
  ),
  (
    '40000000-0000-0000-0000-000000000006', 'Test Tiered Agent',
    'tiered@example.test', '10000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001'
  ),
  (
    '40000000-0000-0000-0000-000000000007', 'Test Variable Agent',
    'variable@example.test', '10000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001'
  )
on conflict (id) do nothing;

do $policy_setup$
declare policy_result jsonb;
declare version_result jsonb;
declare policy_id uuid;
declare version_id uuid;
begin
  policy_result := public.commission_create_policy_2026082901(
    '40000000-0000-0000-0000-000000000002',
    'Extended Ticketing Example',
    'Primary, assistance, Low Fare and sales bonus',
    'processor-policy-0001'
  );
  policy_id := (policy_result ->> 'id')::uuid;
  version_result := public.commission_create_policy_version_2026082901(
    '40000000-0000-0000-0000-000000000002',
    policy_id,
    '[
      {"componentType":"fixed_per_unit","sourceVariable":"passenger_ticket_count","recipientRole":"primary","rateValue":"5.00"},
      {"componentType":"fixed_per_unit","sourceVariable":"passenger_ticket_count","recipientRole":"assistant","rateValue":"1.00"},
      {"componentType":"fixed_per_event","recipientRole":"low_fare_actor","rateValue":"10.00"},
      {"componentType":"sales_profit_bonus","recipientRole":"sales_bonus","thresholdGbp":"1000.00","rewardKind":"fixed_gbp","rewardValue":"100.00","eligibleServices":["tk_primary"]}
    ]'::jsonb,
    'processor-version-0001'
  );
  version_id := (version_result ->> 'id')::uuid;
  perform public.commission_activate_policy_version_2026082901(
    '40000000-0000-0000-0000-000000000002', policy_id, version_id,
    'processor-activate-0001'
  );
  perform public.commission_create_assignment_2026082901(
    '40000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001', version_id,
    'ticketing', 'tk_primary', 'primary', null,
    '2026-08-01', null, 'processor-assignment-primary'
  );
  perform public.commission_create_assignment_2026082901(
    '40000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001', version_id,
    'ticketing', 'sales_bonus', 'sales_bonus', null,
    '2026-08-01', null, 'processor-assignment-bonus'
  );
  perform public.commission_create_assignment_2026082901(
    '40000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000003', version_id,
    'ticketing', 'tk_assistance', 'assistant', null,
    '2026-08-01', null, 'processor-assignment-assist'
  );
  perform public.commission_create_assignment_2026082901(
    '40000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000004', version_id,
    'ticketing', 'low_fare', 'low_fare_actor', null,
    '2026-08-01', null, 'processor-assignment-lowfare'
  );
  perform public.commission_create_assignment_2026082901(
    '40000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001', version_id,
    'ticketing', 'dc', 'primary', null,
    '2026-08-01', null, 'processor-assignment-dc'
  );

  begin
    perform public.commission_create_assignment_2026082901(
      '40000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000005', version_id,
      'ticketing', 'tk_primary', 'primary', null,
      '2026-08-15', null, 'processor-invalid-midmonth'
    );
    raise exception 'Expected aggregate assignment month-boundary rejection';
  exception when check_violation then null;
  end;

  policy_result := public.commission_create_policy_2026082901(
    '40000000-0000-0000-0000-000000000002',
    'Marginal Ticketing Example', 'Monthly marginal ticket bands',
    'processor-tier-policy-0001'
  );
  policy_id := (policy_result ->> 'id')::uuid;
  version_result := public.commission_create_policy_version_2026082901(
    '40000000-0000-0000-0000-000000000002', policy_id,
    '[{"componentType":"marginal_ticket_tier","recipientRole":"primary","tiers":[{"minUnit":1,"rateGbp":"1.00"},{"minUnit":3,"rateGbp":"2.00"}]}]'::jsonb,
    'processor-tier-version-0001'
  );
  version_id := (version_result ->> 'id')::uuid;
  perform public.commission_activate_policy_version_2026082901(
    '40000000-0000-0000-0000-000000000002', policy_id, version_id,
    'processor-tier-activate-0001'
  );
  perform public.commission_create_assignment_2026082901(
    '40000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000006', version_id,
    'ticketing', 'tk_primary', 'primary', null,
    '2026-08-01', '2026-08-31', 'processor-tier-assignment-0001'
  );

  policy_result := public.commission_create_policy_2026082901(
    '40000000-0000-0000-0000-000000000002',
    'Required Variable Example', 'Percentage requires an authoritative source variable',
    'processor-variable-policy-0001'
  );
  policy_id := (policy_result ->> 'id')::uuid;
  version_result := public.commission_create_policy_version_2026082901(
    '40000000-0000-0000-0000-000000000002', policy_id,
    '[{"componentType":"percentage_of_variable","sourceVariable":"commissionable_profit_gbp","recipientRole":"primary","rateValue":"10.00"}]'::jsonb,
    'processor-variable-version-0001'
  );
  version_id := (version_result ->> 'id')::uuid;
  perform public.commission_activate_policy_version_2026082901(
    '40000000-0000-0000-0000-000000000002', policy_id, version_id,
    'processor-variable-activate-0001'
  );
  perform public.commission_create_assignment_2026082901(
    '40000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000007', version_id,
    'ticketing', 'tk_primary', 'primary', null,
    '2026-08-01', null, 'processor-variable-assignment-0001'
  );
end
$policy_setup$;

select public.append_commission_source_event(jsonb_build_object(
  'source_module', 'ticketing',
  'source_event_id', '91000000-0000-0000-0000-000000000001',
  'source_fact_key', 'transaction:90000000-0000-0000-0000-000000000001:issued',
  'source_record_id', '90000000-0000-0000-0000-000000000001',
  'event_type', 'ticket_issued', 'contract_version', 1, 'event_version', 1,
  'supersedes_event_id', null,
  'employee_id', '40000000-0000-0000-0000-000000000002',
  'owner_employee_id', '40000000-0000-0000-0000-000000000001',
  'location_id', '30000000-0000-0000-0000-000000000001',
  'occurred_at', '2026-08-10T10:00:00Z', 'effective_on', '2026-08-10',
  'source_path', '/dashboard/ticketing/ledger/test',
  'variables', jsonb_build_object(
    'passenger_ticket_count', 50, 'commission_scope', 'ticket',
    'sale_price_gbp', null, 'supplier_cost_gbp', 0,
    'assistant_employee_ids', jsonb_build_array(
      '40000000-0000-0000-0000-000000000003'
    )
  ),
  'idempotency_key', 'processor-issued-0001'
));

select public.append_commission_source_event(jsonb_build_object(
  'source_module', 'ticketing',
  'source_event_id', '91000000-0000-0000-0000-000000000002',
  'source_fact_key', 'transaction:90000000-0000-0000-0000-000000000001:sale-completed',
  'source_record_id', '90000000-0000-0000-0000-000000000001',
  'event_type', 'ticket_sale_completed', 'contract_version', 1, 'event_version', 1,
  'supersedes_event_id', null,
  'employee_id', '40000000-0000-0000-0000-000000000002',
  'owner_employee_id', '40000000-0000-0000-0000-000000000001',
  'location_id', '30000000-0000-0000-0000-000000000001',
  'occurred_at', '2026-08-10T11:00:00Z', 'effective_on', '2026-08-10',
  'source_path', '/dashboard/ticketing/ledger/test',
  'variables', jsonb_build_object(
    'passenger_ticket_count', 50, 'commission_scope', 'ticket',
    'sale_price_gbp', 1250, 'supplier_cost_gbp', 0,
    'assistant_employee_ids', jsonb_build_array(
      '40000000-0000-0000-0000-000000000003'
    )
  ),
  'idempotency_key', 'processor-sale-0001'
));

select public.append_commission_source_event(jsonb_build_object(
  'source_module', 'ticketing',
  'source_event_id', '91000000-0000-0000-0000-000000000003',
  'source_fact_key', 'fare-adjustment:90000000-0000-0000-0000-000000000002:recorded',
  'source_record_id', '90000000-0000-0000-0000-000000000002',
  'event_type', 'ticket_low_fare_adjusted', 'contract_version', 1, 'event_version', 1,
  'supersedes_event_id', null,
  'employee_id', '40000000-0000-0000-0000-000000000004',
  'owner_employee_id', '40000000-0000-0000-0000-000000000001',
  'location_id', '30000000-0000-0000-0000-000000000001',
  'occurred_at', '2026-08-11T10:00:00Z', 'effective_on', '2026-08-11',
  'source_path', '/dashboard/ticketing/low-fare',
  'variables', jsonb_build_object(
    'passenger_ticket_count', 50, 'commission_scope', 'ticket',
    'difference_gbp', 100,
    'booking_location_id', '30000000-0000-0000-0000-000000000001'
  ),
  'idempotency_key', 'processor-lowfare-0001'
));

do $process_extended_example$
declare result jsonb;
declare period_row public.commission_period_results%rowtype;
begin
  result := public.commission_process_shadow_2026082902(
    '40000000-0000-0000-0000-000000000002', 20, 'processor-run-0001'
  );
  if (result ->> 'processedEvents')::integer <> 3
    or (result ->> 'heldEvents')::integer <> 0
    or (result ->> 'ordinaryEntries')::integer <> 3
  then raise exception 'Unexpected Commission processing result: %', result; end if;
  result := public.commission_process_shadow_2026082902(
    '40000000-0000-0000-0000-000000000002', 20, 'processor-run-0001'
  );
  if not (result ->> 'idempotentReplay')::boolean
    or (result ->> 'processedEvents')::integer <> 3
  then raise exception 'Commission processor idempotency replay failed: %', result; end if;

  if (
    select coalesce(sum(entry.amount_gbp), 0)
    from public.commission_entries entry
    where entry.entry_kind = 'ordinary'
      and not exists (
        select 1 from public.commission_entries newer
        where newer.supersedes_entry_id = entry.id
      )
  ) <> 310 then
    raise exception 'Primary, assistant and Low Fare costs did not total GBP 310';
  end if;

  select * into period_row from public.commission_period_results
  where employee_id = '40000000-0000-0000-0000-000000000001'
    and period_start = '2026-08-01'
  order by revision desc limit 1;
  if period_row.gross_contributed_profit_gbp <> 1350
    or period_row.ordinary_commission_cost_gbp <> 310
    or period_row.qualifying_profit_gbp <> 1040
    or not period_row.achieved
    or period_row.reward_gbp <> 100
    or period_row.incomplete_input_count <> 0
  then raise exception 'Extended sales bonus result is incorrect: %', row_to_json(period_row); end if;

  if exists (
    select 1 from public.commission_period_results
    where employee_id in (
      '40000000-0000-0000-0000-000000000003',
      '40000000-0000-0000-0000-000000000004'
    )
  ) then raise exception 'Assistant or Low Fare actor received primary bonus progress'; end if;
end
$process_extended_example$;

select public.append_commission_source_event(jsonb_build_object(
  'source_module', 'ticketing',
  'source_event_id', '91000000-0000-0000-0000-000000000005',
  'source_fact_key', 'transaction:90000000-0000-0000-0000-000000000001:issued',
  'source_record_id', '90000000-0000-0000-0000-000000000001',
  'event_type', 'ticket_entry_archived', 'contract_version', 1, 'event_version', 2,
  'supersedes_event_id', '91000000-0000-0000-0000-000000000001',
  'employee_id', '40000000-0000-0000-0000-000000000002',
  'owner_employee_id', '40000000-0000-0000-0000-000000000001',
  'location_id', '30000000-0000-0000-0000-000000000001',
  'occurred_at', '2026-09-01T10:00:00Z', 'effective_on', '2026-09-01',
  'source_path', '/dashboard/ticketing/ledger/test',
  'variables', jsonb_build_object(
    'passenger_ticket_count', 50, 'commission_scope', 'ticket',
    'sale_price_gbp', null, 'supplier_cost_gbp', 0, 'archived', true,
    'assistant_employee_ids', jsonb_build_array(
      '40000000-0000-0000-0000-000000000003'
    )
  ),
  'idempotency_key', 'processor-archive-issued-0001'
));

do $archive_correction$
declare result jsonb;
declare period_row public.commission_period_results%rowtype;
begin
  result := public.commission_process_shadow_2026082902(
    '40000000-0000-0000-0000-000000000002', 20, 'processor-run-archive-0001'
  );
  if (result ->> 'processedEvents')::integer <> 1
    or (result ->> 'ordinaryEntries')::integer <> 2
    or (result ->> 'bonusPeriods')::integer <> 1
  then raise exception 'Archive correction did not append expected revisions: %', result; end if;

  if (
    select coalesce(sum(entry.amount_gbp), 0)
    from public.commission_entries entry
    where entry.entry_kind = 'ordinary'
      and entry.source_case_key =
        'ticketing:transaction:90000000-0000-0000-0000-000000000001:issued'
      and not exists (
        select 1 from public.commission_entries newer
        where newer.supersedes_entry_id = entry.id
      )
  ) <> 0 then raise exception 'Archived issuance retained active Commission cost'; end if;

  select * into period_row from public.commission_period_results
  where employee_id = '40000000-0000-0000-0000-000000000001'
    and period_start = '2026-08-01'
    and not exists (
      select 1 from public.commission_period_results newer
      where newer.supersedes_result_id = commission_period_results.id
    )
  order by revision desc limit 1;
  if period_row.ordinary_commission_cost_gbp <> 10
    or period_row.qualifying_profit_gbp <> 1340
    or period_row.revision <> 2
  then raise exception 'Archive did not recompute its historical bonus period: %',
    row_to_json(period_row); end if;
end
$archive_correction$;

select public.append_commission_source_event(jsonb_build_object(
  'source_module', 'ticketing',
  'source_event_id', '91000000-0000-0000-0000-000000000008',
  'source_fact_key', 'transaction:90000000-0000-0000-0000-000000000008:issued',
  'source_record_id', '90000000-0000-0000-0000-000000000008',
  'event_type', 'ticket_date_changed', 'contract_version', 1, 'event_version', 1,
  'supersedes_event_id', null,
  'employee_id', '40000000-0000-0000-0000-000000000002',
  'owner_employee_id', '40000000-0000-0000-0000-000000000001',
  'location_id', '30000000-0000-0000-0000-000000000001',
  'occurred_at', '2026-08-18T10:00:00Z', 'effective_on', '2026-08-18',
  'source_path', '/dashboard/ticketing/ledger/test',
  'variables', jsonb_build_object(
    'passenger_ticket_count', 1, 'commission_scope', 'ticket',
    'service_type', 'DC', 'sale_price_gbp', 50, 'supplier_cost_gbp', 20
  ),
  'idempotency_key', 'processor-dc-issued-0001'
));

do $dc_service$
declare result jsonb;
declare period_row public.commission_period_results%rowtype;
begin
  result := public.commission_process_shadow_2026082902(
    '40000000-0000-0000-0000-000000000002', 20, 'processor-run-dc-0001'
  );
  if (result ->> 'processedEvents')::integer <> 1
    or (result ->> 'ordinaryEntries')::integer <> 1
  then raise exception 'DC service event did not process: %', result; end if;
  if not exists (
    select 1 from public.commission_entries entry
    where entry.source_event_id = (
      select id from public.commission_source_events
      where source_event_id = '91000000-0000-0000-0000-000000000008'
    )
      and entry.amount_gbp = 5
      and entry.explanation ->> 'serviceCode' = 'dc'
  ) then raise exception 'DC service did not use its effective ordinary policy'; end if;

  select * into period_row from public.commission_period_results
  where employee_id = '40000000-0000-0000-0000-000000000001'
    and period_start = '2026-08-01'
    and not exists (
      select 1 from public.commission_period_results newer
      where newer.supersedes_result_id = commission_period_results.id
    )
  order by revision desc limit 1;
  if period_row.gross_contributed_profit_gbp <> 1350
    or period_row.ordinary_commission_cost_gbp <> 10
    or period_row.qualifying_profit_gbp <> 1340
  then raise exception 'DC affected a TK-only sales-bonus basis: %', row_to_json(period_row); end if;
end
$dc_service$;

select public.append_commission_source_event(jsonb_build_object(
  'source_module', 'ticketing',
  'source_event_id', '91000000-0000-0000-0000-000000000006',
  'source_fact_key', 'transaction:90000000-0000-0000-0000-000000000006:issued',
  'source_record_id', '90000000-0000-0000-0000-000000000006',
  'event_type', 'ticket_issued', 'contract_version', 1, 'event_version', 1,
  'supersedes_event_id', null,
  'employee_id', '40000000-0000-0000-0000-000000000006',
  'owner_employee_id', '40000000-0000-0000-0000-000000000006',
  'location_id', '30000000-0000-0000-0000-000000000001',
  'occurred_at', '2026-08-20T10:00:00Z', 'effective_on', '2026-08-20',
  'source_path', '/dashboard/ticketing/ledger/test',
  'variables', jsonb_build_object(
    'passenger_ticket_count', 2, 'commission_scope', 'ticket',
    'sale_price_gbp', null, 'supplier_cost_gbp', 0
  ),
  'idempotency_key', 'processor-tier-issued-0001'
));

select public.append_commission_source_event(jsonb_build_object(
  'source_module', 'ticketing',
  'source_event_id', '91000000-0000-0000-0000-000000000007',
  'source_fact_key', 'transaction:90000000-0000-0000-0000-000000000007:issued',
  'source_record_id', '90000000-0000-0000-0000-000000000007',
  'event_type', 'ticket_issued', 'contract_version', 1, 'event_version', 1,
  'supersedes_event_id', null,
  'employee_id', '40000000-0000-0000-0000-000000000006',
  'owner_employee_id', '40000000-0000-0000-0000-000000000006',
  'location_id', '30000000-0000-0000-0000-000000000001',
  'occurred_at', '2026-08-21T10:00:00Z', 'effective_on', '2026-08-21',
  'source_path', '/dashboard/ticketing/ledger/test',
  'variables', jsonb_build_object(
    'passenger_ticket_count', 2, 'commission_scope', 'ticket',
    'sale_price_gbp', null, 'supplier_cost_gbp', 0
  ),
  'idempotency_key', 'processor-tier-issued-0002'
));

do $marginal_tiers$
declare result jsonb;
begin
  result := public.commission_process_shadow_2026082902(
    '40000000-0000-0000-0000-000000000002', 20, 'processor-run-tier-0001'
  );
  if (result ->> 'processedEvents')::integer <> 2
    or (result ->> 'ordinaryEntries')::integer <> 2
  then raise exception 'Marginal ticket events did not process: %', result; end if;
  if not exists (
    select 1 from public.commission_entries entry
    where entry.recipient_employee_id = '40000000-0000-0000-0000-000000000006'
      and entry.amount_gbp = 2
      and (entry.basis_snapshot ->> 'priorMarginalUnits')::integer = 0
  ) or not exists (
    select 1 from public.commission_entries entry
    where entry.recipient_employee_id = '40000000-0000-0000-0000-000000000006'
      and entry.amount_gbp = 4
      and (entry.basis_snapshot ->> 'priorMarginalUnits')::integer = 2
  ) then raise exception 'Marginal ticket bands were not applied incrementally'; end if;
end
$marginal_tiers$;

select public.append_commission_source_event(jsonb_build_object(
  'source_module', 'ticketing',
  'source_event_id', '91000000-0000-0000-0000-000000000009',
  'source_fact_key', 'transaction:90000000-0000-0000-0000-000000000009:sale-completed',
  'source_record_id', '90000000-0000-0000-0000-000000000009',
  'event_type', 'ticket_sale_completed', 'contract_version', 1, 'event_version', 1,
  'supersedes_event_id', null,
  'employee_id', '40000000-0000-0000-0000-000000000007',
  'owner_employee_id', '40000000-0000-0000-0000-000000000007',
  'location_id', '30000000-0000-0000-0000-000000000001',
  'occurred_at', '2026-08-22T10:00:00Z', 'effective_on', '2026-08-22',
  'source_path', '/dashboard/ticketing/ledger/test',
  'variables', jsonb_build_object(
    'passenger_ticket_count', 1, 'commission_scope', 'ticket',
    'sale_price_gbp', 100, 'supplier_cost_gbp', 50
  ),
  'idempotency_key', 'processor-variable-missing-0001'
));

do $missing_variable$
declare result jsonb;
begin
  result := public.commission_process_shadow_2026082902(
    '40000000-0000-0000-0000-000000000002', 20, 'processor-run-variable-0001'
  );
  if (result ->> 'heldEvents')::integer <> 1 then
    raise exception 'Missing required variable was not held: %', result;
  end if;
  if not exists (
    select 1 from public.commission_exceptions commission_exception
    join public.commission_source_events event
      on event.id = commission_exception.source_event_id
    where event.source_event_id = '91000000-0000-0000-0000-000000000009'
      and commission_exception.exception_code = 'missing_required_variable'
      and commission_exception.status = 'open'
  ) then raise exception 'Missing input did not create its typed exception'; end if;
end
$missing_variable$;

select public.append_commission_source_event(jsonb_build_object(
  'source_module', 'ticketing',
  'source_event_id', '91000000-0000-0000-0000-000000000004',
  'source_fact_key', 'transaction:90000000-0000-0000-0000-000000000003:issued',
  'source_record_id', '90000000-0000-0000-0000-000000000003',
  'event_type', 'ticket_issued', 'contract_version', 1, 'event_version', 1,
  'supersedes_event_id', null,
  'employee_id', '40000000-0000-0000-0000-000000000005',
  'owner_employee_id', '40000000-0000-0000-0000-000000000005',
  'location_id', '30000000-0000-0000-0000-000000000001',
  'occurred_at', '2026-08-12T10:00:00Z', 'effective_on', '2026-08-12',
  'source_path', '/dashboard/ticketing/ledger/test',
  'variables', jsonb_build_object(
    'passenger_ticket_count', 1, 'commission_scope', 'ticket',
    'sale_price_gbp', null, 'supplier_cost_gbp', 10
  ),
  'idempotency_key', 'processor-unassigned-0001'
));

do $held_and_retry$
declare result jsonb;
declare exception_id uuid;
declare active_version_id uuid;
begin
  result := public.commission_process_shadow_2026082902(
    '40000000-0000-0000-0000-000000000002', 20, 'processor-run-0002'
  );
  if (result ->> 'heldEvents')::integer <> 1 then
    raise exception 'Missing policy source event was not held: %', result;
  end if;
  select id into exception_id from public.commission_exceptions
  where source_event_id = (
    select id from public.commission_source_events
    where source_event_id = '91000000-0000-0000-0000-000000000004'
  ) and exception_code = 'needs_policy' and status = 'open';
  if exception_id is null then raise exception 'needs_policy exception was not recorded'; end if;

  result := public.commission_process_shadow_2026082902(
    '40000000-0000-0000-0000-000000000002', 20, 'processor-run-held-stable'
  );
  if (result ->> 'processedEvents')::integer <> 0
    or (result ->> 'heldEvents')::integer <> 0
  then raise exception 'Held business exception was reclaimed without retry: %', result; end if;

  select id into active_version_id from public.commission_policy_versions
  where status = 'active' order by created_at limit 1;
  perform public.commission_create_assignment_2026082901(
    '40000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000005', active_version_id,
    'ticketing', 'tk_primary', 'primary', null,
    '2026-08-01', null, 'processor-assignment-retry'
  );
  if not exists (
    select 1 from public.commission_source_event_states state
    join public.commission_source_events event on event.id = state.event_id
    where event.source_event_id = '91000000-0000-0000-0000-000000000004'
      and state.processing_status = 'pending'
      and state.last_error is null
  ) then raise exception 'Matching HR assignment did not requeue the held source event'; end if;
  perform public.commission_retry_exception_2026082902(
    '40000000-0000-0000-0000-000000000002', exception_id,
    'processor-retry-0001'
  );
  result := public.commission_process_shadow_2026082902(
    '40000000-0000-0000-0000-000000000002', 20, 'processor-run-0003'
  );
  if (result ->> 'processedEvents')::integer <> 1
    or (result ->> 'heldEvents')::integer <> 0
  then raise exception 'Retried Commission event did not process: %', result; end if;
  if not exists (
    select 1 from public.commission_exceptions
    where id = exception_id and status = 'resolved'
      and resolved_by = '40000000-0000-0000-0000-000000000002'
      and resolved_at is not null
  ) then raise exception 'Successful retry did not resolve its open exception'; end if;
end
$held_and_retry$;

do $least_privilege$
begin
  if has_function_privilege(
    'authenticated', 'public.commission_process_shadow_2026082902(uuid,integer,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated', 'public.commission_retry_exception_2026082902(uuid,uuid,text)',
    'EXECUTE'
  ) then raise exception 'Authenticated received direct Commission processor access'; end if;
end
$least_privilege$;

select 'commission shadow processor assertions passed' as result;
