-- Focused runtime assertions for Commission capability 2026090201.
-- Prerequisite: the Ticketing 2026090201 and Commission 2026083101 chains.

-- Supabase provides auth.uid(); the compact PostgreSQL fixture does not.
create or replace function auth.uid()
returns uuid
language sql
stable
as $auth_uid_fixture$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$auth_uid_fixture$;

do $commission_refund_workflow_test$
<<commission_refund_workflow>>
declare
  manager_id constant uuid := '4a000000-0000-0000-0000-000000000001';
  employee_id constant uuid := '40000000-0000-0000-0000-000000000001';
  location_id constant uuid := '30000000-0000-0000-0000-000000000001';
  airline_id constant uuid := '50000000-0000-0000-0000-000000000001';
  booking_id constant uuid := '71000000-0000-0000-0000-000000000001';
  transaction_id constant uuid := '72000000-0000-0000-0000-000000000001';
  fare_line_id constant uuid := '73000000-0000-0000-0000-000000000001';
  rule_id constant uuid := '77000000-0000-0000-0000-000000000001';
  version_id constant uuid := '78000000-0000-0000-0000-000000000001';
  reverse_component_id constant uuid := '79000000-0000-0000-0000-000000000001';
  retain_component_id constant uuid := '79000000-0000-0000-0000-000000000002';
  zero_component_id constant uuid := '79000000-0000-0000-0000-000000000003';
  bonus_component_id constant uuid := '79000000-0000-0000-0000-000000000004';
  package_refund_id constant uuid := '76000000-0000-0000-0000-000000000004';
  issue_event_id uuid;
  issue_source_identity uuid := gen_random_uuid();
  correction_event_id uuid;
  package_confirmed_id uuid;
  package_confirmed_identity uuid := gen_random_uuid();
  package_withdrawn_id uuid;
  result_json jsonb;
  current_version bigint;
  feb_result public.commission_period_results%rowtype;
  april_result public.commission_period_results%rowtype;
  error_hint text;
begin
  -- Isolate this workflow from the Ticketing prerequisite suite's unrelated
  -- immutable source facts without bypassing any FK or row trigger.
  update public.commission_source_event_states
  set processing_status = 'processed', next_attempt_at = null, last_error = null;

  insert into public.ticket_bookings (
    id, owner_employee_id, location_id, airline_id, pnr, customer_name,
    booking_date, operational_status, payment_status, departure_date,
    created_by, updated_by
  ) values (
    booking_id, employee_id, location_id, airline_id, 'CMP3PX', 'Commission Three Pax',
    date '2025-01-05', 'issued', 'paid', date '2025-06-01', manager_id, manager_id
  );
  insert into public.ticket_transactions (
    id, booking_id, service_type, owner_employee_id, acting_employee_id,
    operational_status, payment_status, booking_date, passenger_ticket_count,
    currency, idempotency_key
  ) values (
    transaction_id, booking_id, 'TK', employee_id, manager_id,
    'draft', 'unpaid', date '2025-01-05', 0, 'GBP',
    'commission-real-fk-transaction'
  );
  insert into public.ticket_passenger_fare_lines (
    id, transaction_id, passenger_type, quantity, currency,
    unit_supplier_cost_source, unit_supplier_cost_gbp,
    unit_sale_price_source, unit_sale_price_gbp
  ) values (
    fare_line_id, transaction_id, 'ADT', 3, 'GBP',
    66.67, 66.67, 100, 100
  );
  insert into public.ticket_passengers (
    id, booking_id, passenger_type, full_name, created_by
  ) values
    ('74000000-0000-0000-0000-000000000001', booking_id, 'ADT', 'Pax One', manager_id),
    ('74000000-0000-0000-0000-000000000002', booking_id, 'ADT', 'Pax Two', manager_id),
    ('74000000-0000-0000-0000-000000000003', booking_id, 'ADT', 'Pax Three', manager_id);
  insert into public.ticket_transaction_passengers (
    id, booking_id, transaction_id, passenger_id, fare_line_id, ticket_number, position
  ) values
    ('75000000-0000-0000-0000-000000000001', booking_id, transaction_id,
      '74000000-0000-0000-0000-000000000001', fare_line_id, 'CMP-001', 1),
    ('75000000-0000-0000-0000-000000000002', booking_id, transaction_id,
      '74000000-0000-0000-0000-000000000002', fare_line_id, 'CMP-002', 2),
    ('75000000-0000-0000-0000-000000000003', booking_id, transaction_id,
      '74000000-0000-0000-0000-000000000003', fare_line_id, 'CMP-003', 3);

  -- Build the real fare/passenger graph before posting the transaction. The
  -- Ticketing reconciliation trigger intentionally rejects issued/paid rows
  -- until those child facts exist, then derives the authoritative totals.
  update public.ticket_transactions
  set operational_status = 'issued',
      payment_status = 'paid',
      issued_at = timestamptz '2025-01-15 10:00+00',
      paid_at = timestamptz '2025-01-15 10:00+00'
  where id = transaction_id;

  insert into public.ticket_refunds (
    id, booking_id, transaction_id, transaction_passenger_id, passenger_id,
    airline_id, owner_employee_id, created_by_employee_id, pnr, ticket_number,
    passenger_name, passenger_type, settlement_mode, package_match_status,
    commission_scope, formula_version, original_sale_price_gbp,
    original_supplier_cost_gbp, airline_cancellation_fee_gbp,
    supplier_cancellation_charge_gbp, retained_agent_commission_gbp,
    desired_company_markup_gbp, proposed_cancellation_charge_gbp,
    proposed_customer_refund_gbp, expected_airline_recovery_gbp,
    expected_company_result_gbp, customer_settled_gbp, airline_recovered_gbp,
    other_actual_costs_gbp, airline_recovery_final, status, notes, idempotency_key
  )
  select fixture.refund_id, booking_id, transaction_id, fixture.allocation_id,
    fixture.passenger_id, airline_id, employee_id, manager_id, 'CMP3PX',
    fixture.ticket_number, fixture.passenger_name, 'ADT', 'refund', 'unmatched',
    'ticket', 'commission-test-v1', 100, 66.67, 10, 5, 0, 0, 15, 70,
    80, 8.33, 70, 80, 5, true, 'recorded',
    'Real FK Commission refund fixture', 'commission-refund-' || fixture.position
  from (values
    ('76000000-0000-0000-0000-000000000001'::uuid,
      '75000000-0000-0000-0000-000000000001'::uuid,
      '74000000-0000-0000-0000-000000000001'::uuid, 'CMP-001', 'Pax One', 1),
    ('76000000-0000-0000-0000-000000000002'::uuid,
      '75000000-0000-0000-0000-000000000002'::uuid,
      '74000000-0000-0000-0000-000000000002'::uuid, 'CMP-002', 'Pax Two', 2),
    ('76000000-0000-0000-0000-000000000003'::uuid,
      '75000000-0000-0000-0000-000000000003'::uuid,
      '74000000-0000-0000-0000-000000000003'::uuid, 'CMP-003', 'Pax Three', 3)
  ) fixture(refund_id, allocation_id, passenger_id, ticket_number, passenger_name, position);

  -- A structurally valid package row gives defensive package lifecycle facts a
  -- real refund FK while remaining excluded from the active-passenger index.
  insert into public.ticket_refunds (
    id, booking_id, transaction_id, transaction_passenger_id, passenger_id,
    airline_id, owner_employee_id, created_by_employee_id, pnr, ticket_number,
    passenger_name, passenger_type, settlement_mode, package_match_status,
    commission_scope, formula_version, original_sale_price_gbp,
    original_supplier_cost_gbp, airline_cancellation_fee_gbp,
    supplier_cancellation_charge_gbp, retained_agent_commission_gbp,
    desired_company_markup_gbp, proposed_cancellation_charge_gbp,
    proposed_customer_refund_gbp, expected_airline_recovery_gbp,
    expected_company_result_gbp, customer_settled_gbp, airline_recovered_gbp,
    other_actual_costs_gbp, airline_recovery_final, status, notes, idempotency_key
  ) values (
    package_refund_id, booking_id, transaction_id,
    '75000000-0000-0000-0000-000000000001',
    '74000000-0000-0000-0000-000000000001',
    airline_id, employee_id, manager_id, 'CMP3PX', 'CMP-PKG',
    'Pax One', 'ADT', 'refund', 'matched', 'package', 'commission-test-v1',
    100, 66.67, 10, 5, 0, 0, 15, 70, 80, 8.33, 70, 80, 5, true,
    'voided', 'Package no-op Commission fixture', 'commission-package-refund'
  );

  insert into public.commission_rules (id, rule_name, description, created_by)
  values (
    rule_id, 'Penny-safe refund fixture', 'Reverse, retain, zero and bonus fixture',
    manager_id
  );
  insert into public.commission_policy_versions (
    id, rule_id, version_number, status, created_by
  ) values (version_id, rule_id, 1, 'draft', manager_id);
  insert into public.commission_policy_components (
    id, policy_version_id, sequence, component_type, recipient_role,
    rate_value, threshold_gbp, reward_kind, reward_value, eligible_services, config
  ) values
    (reverse_component_id, version_id, 1, 'fixed_per_event', 'primary',
      12.50, null, null, null, '[]',
      '{"payCurrency":"USD","ticketRefundTreatment":"reverse_original"}'),
    (retain_component_id, version_id, 2, 'fixed_per_event', 'primary',
      6.25, null, null, null, '[]',
      '{"payCurrency":"USD","ticketRefundTreatment":"retain"}'),
    (zero_component_id, version_id, 3, 'explicit_zero', 'primary',
      0, null, null, null, '[]',
      '{"payCurrency":"USD","ticketRefundTreatment":"reverse_original"}'),
    (bonus_component_id, version_id, 4, 'sales_profit_bonus', 'sales_bonus',
      null, 100, 'fixed_gbp', 10, '["tk_primary"]',
      '{"payCurrency":"USD"}');
  update public.commission_policy_versions
  set status = 'active', content_hash = repeat('b', 64),
      activated_by = manager_id, activated_at = clock_timestamp()
  where id = version_id;
  insert into public.employee_commission_assignments (
    employee_id, rule_id, start_date, policy_version_id, source_module,
    service_code, recipient_role, created_by
  ) values
    (employee_id, rule_id, date '2025-01-01', version_id,
      'ticketing', 'tk_primary', 'primary', manager_id),
    (employee_id, rule_id, date '2025-01-01', version_id,
      'ticketing', 'sales_bonus', 'sales_bonus', manager_id);
  perform public.commission_set_monthly_exchange_rate_2026083001(
    manager_id, 'USD', date '2025-01-01', 1.25, 'refund-rate-2025-01'
  );
  perform public.commission_set_monthly_exchange_rate_2026083001(
    manager_id, 'USD', date '2025-02-01', 1.25, 'refund-rate-2025-02'
  );
  perform public.commission_set_monthly_exchange_rate_2026083001(
    manager_id, 'USD', date '2025-03-01', 1.25, 'refund-rate-2025-03'
  );
  perform public.commission_set_monthly_exchange_rate_2026083001(
    manager_id, 'USD', date '2025-04-01', 1.25, 'refund-rate-2025-04'
  );

  -- The earlier no-op consumes a bounded core pass, leaving the matching issue
  -- pending while the first refund is claimed.
  perform public.append_commission_source_event(jsonb_build_object(
    'source_module', 'ticketing', 'source_event_id', gen_random_uuid(),
    'source_fact_key', 'bounded-noop:' || transaction_id,
    'source_record_id', transaction_id, 'event_type', 'ticket_paid',
    'contract_version', 1, 'event_version', 1, 'supersedes_event_id', null,
    'employee_id', employee_id, 'owner_employee_id', employee_id,
    'location_id', location_id, 'occurred_at', timestamptz '2025-01-14 09:00+00',
    'effective_on', date '2025-01-14', 'source_path', '/test/commission',
    'variables', jsonb_build_object('transaction_id', transaction_id,
      'commission_scope', 'ticket'),
    'idempotency_key', 'commission-bounded-noop'
  ));
  result_json := public.append_commission_source_event(jsonb_build_object(
    'source_module', 'ticketing', 'source_event_id', issue_source_identity,
    'source_fact_key', 'ticket-transaction:' || transaction_id,
    'source_record_id', transaction_id, 'event_type', 'ticket_issued',
    'contract_version', 1, 'event_version', 1, 'supersedes_event_id', null,
    'employee_id', employee_id, 'owner_employee_id', employee_id,
    'location_id', location_id, 'occurred_at', timestamptz '2025-01-15 10:00+00',
    'effective_on', date '2025-01-15', 'source_path', '/test/commission',
    'variables', jsonb_build_object(
      'transaction_id', transaction_id, 'passenger_ticket_count', 3,
      'sale_price_gbp', 300, 'supplier_cost_gbp', 200,
      'commission_scope', 'ticket', 'assistant_employee_ids', '[]'::jsonb
    ), 'idempotency_key', 'commission-three-pax-issue'
  ));
  issue_event_id := (result_json ->> 'id')::uuid;

  for current_version in 1..3 loop
    perform public.ticketing_append_refund_event_2026090201(
      manager_id,
      ('76000000-0000-0000-0000-00000000000' || current_version::text)::uuid,
      1, 'confirmed_correct', null,
      date '2025-02-10' + (current_version::integer - 1),
      null, null, null, 'commission-confirm-refund-' || current_version::text
    );
  end loop;

  perform public.commission_process_shadow_2026082902(
    manager_id, 1, 'commission-bounded-worker'
  );
  if not exists (
    select 1
    from public.commission_source_events source_event
    join public.commission_source_event_states state on state.event_id = source_event.id
    where source_event.source_fact_key =
      'refund:76000000-0000-0000-0000-000000000001:confirmed'
      and state.processing_status = 'held'
      and state.last_error = 'refund_dependency_pending'
  ) then
    raise exception 'Bounded worker did not hold the refund behind its original earning';
  end if;

  perform public.commission_process_shadow_2026082902(
    manager_id, 200, 'commission-three-pax-process'
  );
  if (
    select array_agg(entry.amount_gbp order by
      (entry.basis_snapshot ->> 'allocationPosition')::integer)
    from public.commission_entries entry
    where entry.entry_kind = 'refund_reversal'
      and entry.component_id = reverse_component_id
      and entry.basis_snapshot ->> 'reversalState' = 'active'
      and not exists (
        select 1 from public.commission_entries newer
        where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
      )
  ) is distinct from array[-3.34, -3.33, -3.33]::numeric[]
  or (
    select array_agg(entry.amount_pay_currency order by
      (entry.basis_snapshot ->> 'allocationPosition')::integer)
    from public.commission_entries entry
    where entry.entry_kind = 'refund_reversal'
      and entry.component_id = reverse_component_id
      and entry.basis_snapshot ->> 'reversalState' = 'active'
      and not exists (
        select 1 from public.commission_entries newer
        where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
      )
  ) is distinct from array[-4.17, -4.17, -4.16]::numeric[] then
    raise exception 'Three-passenger native/GBP apportionment was not penny-safe';
  end if;
  if (select count(*) from public.commission_refund_decisions
      where treatment = 'retain' and reversal_entry_id is null
        and refund_id in (
          '76000000-0000-0000-0000-000000000001',
          '76000000-0000-0000-0000-000000000002',
          '76000000-0000-0000-0000-000000000003'
        )) <> 3
    or (select count(*) from public.commission_entries
      where component_id = zero_component_id and entry_kind = 'refund_reversal'
        and basis_snapshot ->> 'reversalState' = 'active') <> 3
  then
    raise exception 'Retain or zero-value reverse treatment was not preserved';
  end if;

  select version into current_version from public.ticket_refunds
  where id = '76000000-0000-0000-0000-000000000001';
  perform public.ticketing_append_refund_event_2026090201(
    manager_id, '76000000-0000-0000-0000-000000000001', current_version,
    'other_cost', 1, date '2025-03-05', null, null, null,
    'commission-withdraw-refund-1'
  );
  perform public.commission_process_shadow_2026082902(
    manager_id, 200, 'commission-withdraw-process'
  );
  if (select count(*) from public.commission_entries entry
      where entry.source_case_key like
        'ticket-refund:76000000-0000-0000-0000-000000000001:%'
        and entry.basis_snapshot ->> 'reversalState' = 'neutralized'
        and not exists (
          select 1 from public.commission_entries newer
          where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
        )) <> 2
  then
    raise exception 'Withdrawal did not neutralize both paid and zero reversal lineages';
  end if;
  select result.* into feb_result
  from public.commission_period_results result
  where result.employee_id = commission_refund_workflow.employee_id
    and result.period_start = date '2025-02-01'
    and not exists (
      select 1 from public.commission_period_results newer
      where newer.result_mode = result.result_mode and newer.supersedes_result_id = result.id
    );
  if not found or feb_result.gross_contributed_profit_gbp <> 10
    or feb_result.ordinary_commission_cost_gbp <> -6.66
  then
    raise exception 'Withdrawal did not recompute the superseded refund month: %', feb_result;
  end if;

  select version into current_version from public.ticket_refunds
  where id = '76000000-0000-0000-0000-000000000001';
  perform public.ticketing_append_refund_event_2026090201(
    manager_id, '76000000-0000-0000-0000-000000000001', current_version,
    'confirmed_correct', null, date '2025-04-05', null, null, null,
    'commission-reconfirm-refund-1'
  );
  perform public.commission_process_shadow_2026082902(
    manager_id, 200, 'commission-reconfirm-process'
  );
  if not exists (
    select 1 from public.commission_entries entry
    where entry.source_case_key like
      'ticket-refund:76000000-0000-0000-0000-000000000001:%'
      and entry.component_id = reverse_component_id
      and entry.basis_snapshot ->> 'reversalState' = 'active'
      and entry.amount_gbp = -3.34 and entry.amount_pay_currency = -4.17
      and entry.exchange_rate_units_per_gbp = 1.25 and entry.revision = 3
      and not exists (
        select 1 from public.commission_entries newer
        where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
      )
  ) then
    raise exception 'Reconfirmation did not restore the exact snapshotted allocation';
  end if;
  select result.* into april_result
  from public.commission_period_results result
  where result.employee_id = commission_refund_workflow.employee_id
    and result.period_start = date '2025-04-01'
    and not exists (
      select 1 from public.commission_period_results newer
      where newer.result_mode = result.result_mode and newer.supersedes_result_id = result.id
    );
  if not found or april_result.gross_contributed_profit_gbp <> 4
    or april_result.ordinary_commission_cost_gbp <> -3.34
  then
    raise exception 'Reconfirmation did not recompute its actual refund month: %', april_result;
  end if;

  -- Correcting the original immutable source creates new ordinary entries. The
  -- entry trigger must requeue every latest confirmation, neutralize stale
  -- reversal lineages, and build decisions against the corrected entries.
  result_json := public.append_commission_source_event(jsonb_build_object(
    'source_module', 'ticketing', 'source_event_id', gen_random_uuid(),
    'source_fact_key', 'ticket-transaction:' || transaction_id,
    'source_record_id', transaction_id, 'event_type', 'ticket_issued',
    'contract_version', 1, 'event_version', 2,
    'supersedes_event_id', issue_source_identity,
    'employee_id', employee_id, 'owner_employee_id', employee_id,
    'location_id', location_id, 'occurred_at', timestamptz '2025-01-16 10:00+00',
    'effective_on', date '2025-01-15', 'source_path', '/test/commission',
    'variables', jsonb_build_object(
      'transaction_id', transaction_id, 'passenger_ticket_count', 3,
      'sale_price_gbp', 300, 'supplier_cost_gbp', 200,
      'commission_scope', 'ticket', 'assistant_employee_ids', '[]'::jsonb
    ), 'idempotency_key', 'commission-three-pax-correction'
  ));
  correction_event_id := (result_json ->> 'id')::uuid;
  perform public.commission_process_shadow_2026082902(
    manager_id, 200, 'commission-correction-reconcile'
  );
  if (select count(*) from public.commission_refund_decisions decision
      join public.commission_entries entry on entry.id = decision.original_entry_id
      where entry.source_event_id = correction_event_id
        and decision.refund_id in (
          '76000000-0000-0000-0000-000000000001',
          '76000000-0000-0000-0000-000000000002',
          '76000000-0000-0000-0000-000000000003'
        )) <> 9
  then
    raise exception 'Corrected ordinary entries were not reconciled across all refunds';
  end if;

  -- Package confirm/withdraw facts have real refund lineage but no ticket
  -- Commission decisions, including the zero-decision withdrawal case.
  result_json := public.append_commission_source_event(jsonb_build_object(
    'source_module', 'ticketing', 'source_event_id', package_confirmed_identity,
    'source_fact_key', 'refund:' || package_refund_id::text || ':confirmed',
    'source_record_id', package_refund_id, 'event_type', 'ticket_refund_confirmed',
    'contract_version', 1, 'event_version', 1, 'supersedes_event_id', null,
    'employee_id', employee_id, 'owner_employee_id', employee_id,
    'location_id', location_id, 'occurred_at', timestamptz '2025-02-01 00:00+00',
    'effective_on', date '2025-02-01', 'source_path', '/test/commission',
    'variables', jsonb_build_object('refund_id', package_refund_id,
      'transaction_id', transaction_id,
      'transaction_passenger_id', '75000000-0000-0000-0000-000000000001',
      'commission_scope', 'package', 'refund_profit_adjustment_gbp', 0),
    'idempotency_key', 'commission-package-confirmed'
  ));
  package_confirmed_id := (result_json ->> 'id')::uuid;
  result_json := public.append_commission_source_event(jsonb_build_object(
    'source_module', 'ticketing', 'source_event_id', gen_random_uuid(),
    'source_fact_key', 'refund:' || package_refund_id::text || ':confirmed',
    'source_record_id', package_refund_id,
    'event_type', 'ticket_refund_confirmation_withdrawn',
    'contract_version', 1, 'event_version', 2,
    'supersedes_event_id', package_confirmed_identity,
    'employee_id', employee_id, 'owner_employee_id', employee_id,
    'location_id', location_id, 'occurred_at', timestamptz '2025-02-02 00:00+00',
    'effective_on', date '2025-02-02', 'source_path', '/test/commission',
    'variables', jsonb_build_object('refund_id', package_refund_id,
      'transaction_id', transaction_id,
      'transaction_passenger_id', '75000000-0000-0000-0000-000000000001',
      'commission_scope', 'package', 'refund_profit_adjustment_gbp', 0),
    'idempotency_key', 'commission-package-withdrawn'
  ));
  package_withdrawn_id := (result_json ->> 'id')::uuid;
  perform public.commission_process_shadow_2026082902(
    manager_id, 200, 'commission-package-noop'
  );
  if exists (
    select 1 from public.commission_refund_decisions
    where refund_id = package_refund_id
  ) or exists (
    select 1 from public.commission_source_event_states
    where event_id in (package_confirmed_id, package_withdrawn_id)
      and processing_status <> 'processed'
  ) then
    raise exception 'Package refund lifecycle was not a processed monetary no-op';
  end if;

  -- Canonical outer idempotency includes the NULL system actor and full limit.
  result_json := public.commission_process_shadow_2026082902(
    null, 25, '  commission-system-replay  '
  );
  if (public.commission_process_shadow_2026082902(
      null, 25, 'commission-system-replay'
    ) ->> 'idempotentReplay')::boolean is not true
    or (select count(*) from public.commission_audit_events audit
      where audit.actor_employee_id is null
        and audit.actor_type = 'system'
        and audit.action = 'shadow.workflow.processed'
        and audit.request_key = 'commission-system-replay') <> 1
  then
    raise exception 'NULL-system worker idempotency was not canonical';
  end if;
  begin
    perform public.commission_process_shadow_2026082902(
      null, 26, 'commission-system-replay'
    );
    raise exception 'Worker key accepted a different limit';
  exception when sqlstate '22023' then
    get stacked diagnostics error_hint = PG_EXCEPTION_HINT;
    if error_hint <> 'COMMISSION_IDEMPOTENCY_CONFLICT' then
      raise exception 'Worker conflict returned the wrong hint';
    end if;
  end;
end
$commission_refund_workflow_test$;

do $commission_compensation_accounting_workflow_test$
declare
  manager_id constant uuid := '4a000000-0000-0000-0000-000000000001';
  reviewer_id constant uuid := '40000000-0000-0000-0000-000000000006';
  employee_id constant uuid := '40000000-0000-0000-0000-000000000001';
  period_start_value constant date := date '2024-01-01';
  result_json jsonb;
  draft_json jsonb;
  submitted_json jsonb;
  replacement_json jsonb;
  approved_json jsonb;
  batch_id uuid;
  replacement_id uuid;
  error_hint text;
  late_event_id uuid;
  frozen_entry_count integer;
  frozen_content_hash text;
  adjustment_id uuid;
begin
  if to_regprocedure(
    'public.commission_submit_review_batch_2026090201(uuid,uuid,integer,text)'
  ) is null
    or to_regprocedure(
      'public.commission_submit_review_batch_2026090201(uuid,uuid,uuid,integer,text)'
    ) is not null
    or not has_function_privilege(
      'service_role',
      'public.commission_submit_review_batch_2026090201(uuid,uuid,integer,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.commission_submit_review_batch_2026090201(uuid,uuid,integer,text)',
      'EXECUTE'
    )
  then
    raise exception 'Commission review submission signature or grants are unsafe';
  end if;

  perform public.commission_set_monthly_exchange_rate_2026083001(
    manager_id, 'USD', period_start_value, 1.25, 'workflow-test-usd-rate'
  );
  perform public.commission_set_monthly_exchange_rate_2026083001(
    manager_id, 'EUR', period_start_value, 1.10, 'workflow-test-eur-rate'
  );
  if public.commission_exchange_rate_2026083001('USD', period_start_value) <> 1.25
    or public.commission_exchange_rate_2026083001('EUR', period_start_value) <> 1.10
  then
    raise exception 'Arbitrary monthly ISO currency rates were not stored independently';
  end if;

  result_json := public.commission_calculate_bonus_schedule_2026090201(
    '[
      {"thresholdGbp": 1000, "rewardKind": "fixed_gbp", "rewardValue": 50},
      {"thresholdGbp": 2000, "rewardKind": "fixed_gbp", "rewardValue": 100}
    ]'::jsonb,
    '{
      "enabled": true,
      "startsAtGbp": 3000,
      "intervalGbp": 1000,
      "rewardKind": "fixed_gbp",
      "rewardValue": 50,
      "maxOccurrences": null
    }'::jsonb,
    'USD', 5200, 0, period_start_value
  );
  if result_json ->> 'payCurrency' <> 'USD'
    or (result_json ->> 'rewardPayCurrency')::numeric <> 300
    or (result_json ->> 'rewardGbp')::numeric <> 240
    or (result_json ->> 'recurringOccurrences')::integer <> 3
  then
    raise exception 'Multi-target recurring bonus calculation was incorrect: %', result_json;
  end if;

  result_json := public.commission_append_adjustment_2026090201(
    manager_id, employee_id, 'adm', 'debit', 25, 'USD', period_start_value,
    'Airline debit memo for workflow test', '{"fixture": true}'::jsonb,
    null, 'workflow-adjustment-0001'
  );
  adjustment_id := (result_json ->> 'id')::uuid;
  if not (public.commission_append_adjustment_2026090201(
      manager_id, employee_id, 'adm', 'debit', 25, 'USD', period_start_value,
      'Airline debit memo for workflow test', '{"fixture": true}'::jsonb,
      null, '  workflow-adjustment-0001  '
    ) ->> 'idempotentReplay')::boolean
  then
    raise exception 'Canonical adjustment replay did not succeed';
  end if;
  begin
    perform public.commission_append_adjustment_2026090201(
      manager_id, employee_id, 'adm', 'debit', 25, 'USD', period_start_value,
      'Different reason', '{"fixture": true}'::jsonb,
      null, 'workflow-adjustment-0001'
    );
    raise exception 'Adjustment replay accepted a changed reason';
  exception when sqlstate '22023' then
    get stacked diagnostics error_hint = PG_EXCEPTION_HINT;
    if error_hint <> 'COMMISSION_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
  begin
    perform public.commission_append_adjustment_2026090201(
      manager_id, employee_id, 'adm', 'debit', 25, 'USD', period_start_value,
      'Airline debit memo for workflow test', '{"fixture": false}'::jsonb,
      null, 'workflow-adjustment-0001'
    );
    raise exception 'Adjustment replay accepted changed evidence';
  exception when sqlstate '22023' then
    get stacked diagnostics error_hint = PG_EXCEPTION_HINT;
    if error_hint <> 'COMMISSION_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
  result_json := public.commission_append_adjustment_2026090201(
    manager_id, employee_id, 'adm', 'credit', 25, 'USD', period_start_value,
    'Exact reversal of workflow debit memo', '{"fixture": true}'::jsonb,
    adjustment_id, 'workflow-adjustment-reverse'
  );
  if not exists (
    select 1
    from public.commission_adjustments reversal
    join public.commission_adjustments original on original.id = adjustment_id
    where reversal.id = (result_json ->> 'id')::uuid
      and reversal.amount_pay_currency = original.amount_pay_currency
      and reversal.amount_gbp = original.amount_gbp
      and reversal.pay_currency = original.pay_currency
      and reversal.exchange_rate_units_per_gbp = original.exchange_rate_units_per_gbp
  ) then
    raise exception 'Adjustment reversal did not preserve exact native/GBP FX values';
  end if;
  draft_json := public.commission_prepare_review_batch_2026090201(
    manager_id, period_start_value, 'workflow-prepare-0001'
  );
  batch_id := (draft_json ->> 'id')::uuid;
  if draft_json ->> 'status' <> 'draft'
    or (draft_json ->> 'entryCount')::integer < 1
  then
    raise exception 'Prepared Commission review batch did not freeze adjustment rows: %', draft_json;
  end if;

  result_json := public.commission_shadow_staff_report_2026090201(
    manager_id, period_start_value,
    (period_start_value + interval '1 month - 1 day')::date
  );
  if result_json #>> '{reviewBatch,id}' <> batch_id::text
    or result_json #>> '{reviewBatch,state}' <> 'draft'
    or (result_json #>> '{reviewBatch,entryCount}')::integer < 1
    or (result_json #>> '{reviewBatch,isStale}')::boolean
  then
    raise exception 'Staff report did not expose the reload-safe review batch: %', result_json;
  end if;

  begin
    perform public.commission_append_adjustment_2026090201(
      manager_id, employee_id, 'loss', 'debit', 10, 'EUR', period_start_value,
      'Period lock assertion', '{}'::jsonb, null, 'workflow-adjustment-locked'
    );
    raise exception 'Draft Commission period accepted a new adjustment';
  exception when sqlstate '55000' then
    get stacked diagnostics error_hint = PG_EXCEPTION_HINT;
    if error_hint <> 'COMMISSION_REVIEW_PERIOD_LOCKED' then
      raise exception 'Draft-period lock returned the wrong hint: %', error_hint;
    end if;
  end;
  begin
    perform public.commission_set_monthly_exchange_rate_2026083001(
      manager_id, 'USD', period_start_value, 1.30, 'Locked-period rate change'
    );
    raise exception 'Draft Commission period accepted an exchange-rate change';
  exception when sqlstate '55000' then
    get stacked diagnostics error_hint = PG_EXCEPTION_HINT;
    if error_hint <> 'COMMISSION_REVIEW_PERIOD_LOCKED' then
      raise exception 'Draft rate lock returned the wrong hint: %', error_hint;
    end if;
  end;

  begin
    perform public.commission_submit_review_batch_2026090201(
      manager_id, batch_id, 99, 'workflow-submit-stale'
    );
    raise exception 'Stale review revision unexpectedly submitted';
  exception when sqlstate '40001' then null;
  end;

  submitted_json := public.commission_submit_review_batch_2026090201(
    manager_id, batch_id, (draft_json ->> 'revision')::integer,
    'workflow-submit-0001'
  );
  perform set_config('request.jwt.claim.sub', manager_id::text, true);
  begin
    perform public.commission_approve_review_batch_2026090201(
      batch_id, (submitted_json ->> 'revision')::integer
    );
    raise exception 'The submitting employee approved their own Commission batch';
  exception when sqlstate '42501' then
    get stacked diagnostics error_hint = PG_EXCEPTION_HINT;
    if error_hint <> 'COMMISSION_REVIEW_SEPARATION_REQUIRED' then
      raise exception 'Reviewer-separation failure returned the wrong hint: %', error_hint;
    end if;
  end;

  perform set_config('request.jwt.claim.sub', reviewer_id::text, true);
  result_json := public.commission_review_batch_detail_2026090201(batch_id);
  if not (result_json #>> '{batch,canApprove}')::boolean
    or (result_json #>> '{batch,isStale}')::boolean
  then
    raise exception 'Accounting detail did not expose a current approvable batch: %', result_json;
  end if;
  perform public.commission_return_review_batch_2026090201(
    batch_id, (submitted_json ->> 'revision')::integer,
    'Return to prove correction and resubmission'
  );

  perform public.commission_set_monthly_exchange_rate_2026083001(
    manager_id, 'EUR', period_start_value, 1.20, 'Returned-period rate correction'
  );
  if public.commission_exchange_rate_2026083001('EUR', period_start_value) <> 1.20 then
    raise exception 'Returned Commission period did not permit a rate correction';
  end if;

  perform public.commission_append_adjustment_2026090201(
    manager_id, employee_id, 'loss', 'debit', 10, 'EUR', period_start_value,
    'Returned period correction', '{}'::jsonb, null, 'workflow-adjustment-0002'
  );
  replacement_json := public.commission_prepare_review_batch_2026090201(
    manager_id, period_start_value, 'workflow-prepare-0002'
  );
  replacement_id := (replacement_json ->> 'id')::uuid;
  if replacement_id = batch_id
    or (replacement_json ->> 'revision')::integer <= (submitted_json ->> 'revision')::integer
  then
    raise exception 'Returned Commission batch was not replaced by a later revision';
  end if;
  submitted_json := public.commission_submit_review_batch_2026090201(
    manager_id, replacement_id, (replacement_json ->> 'revision')::integer,
    'workflow-submit-0002'
  );
  perform set_config('request.jwt.claim.sub', reviewer_id::text, true);
  approved_json := public.commission_approve_review_batch_2026090201(
    replacement_id, (submitted_json ->> 'revision')::integer
  );
  if approved_json ->> 'status' <> 'approved_locked'
    or not (approved_json ->> 'fixed')::boolean
  then
    raise exception 'Independent Accounting approval did not lock the report: %', approved_json;
  end if;

  begin
    update public.commission_review_batch_entries frozen_entry
    set amount_gbp = frozen_entry.amount_gbp + 1
    where frozen_entry.batch_id = replacement_id;
    raise exception 'Frozen review entries were mutable';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.commission_review_statements frozen_statement
    where frozen_statement.batch_id = replacement_id;
    raise exception 'Frozen review statements were deletable';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.commission_review_events review_event
    where review_event.batch_id = replacement_id;
    raise exception 'Review event history was deletable';
  exception when sqlstate '55000' then null;
  end;

  select count(*) into frozen_entry_count
  from public.commission_review_batch_entries frozen_entry
  where frozen_entry.batch_id = replacement_id;
  select content_hash into frozen_content_hash
  from public.commission_review_batches frozen_batch
  where frozen_batch.id = replacement_id;
  result_json := public.append_commission_source_event(jsonb_build_object(
    'source_module', 'ticketing', 'source_event_id', gen_random_uuid(),
    'source_fact_key', 'approved-period-late-fact',
    'source_record_id', '72000000-0000-0000-0000-000000000001',
    'event_type', 'ticket_paid', 'contract_version', 1, 'event_version', 1,
    'supersedes_event_id', null, 'employee_id', employee_id,
    'owner_employee_id', employee_id,
    'location_id', '30000000-0000-0000-0000-000000000001',
    'occurred_at', timestamptz '2024-01-20 12:00+00',
    'effective_on', date '2024-01-20', 'source_path', '/test/commission',
    'variables', jsonb_build_object(
      'transaction_id', '72000000-0000-0000-0000-000000000001',
      'commission_scope', 'ticket'
    ), 'idempotency_key', 'approved-period-late-fact'
  ));
  late_event_id := (result_json ->> 'id')::uuid;
  perform public.commission_process_shadow_2026082902(
    manager_id, 200, 'approved-period-late-worker'
  );
  if not exists (
    select 1 from public.commission_source_event_states state
    where state.event_id = late_event_id
      and state.processing_status = 'held'
      and state.last_error = 'review_period_locked'
      and state.next_attempt_at is null
  ) or not exists (
    select 1 from public.commission_exceptions exception_row
    where exception_row.source_event_id = late_event_id
      and exception_row.exception_code = 'review_period_locked'
      and exception_row.status = 'open'
  ) or (select count(*) from public.commission_review_batch_entries frozen_entry
      where frozen_entry.batch_id = replacement_id) <> frozen_entry_count
    or (select frozen_batch.content_hash from public.commission_review_batches frozen_batch
      where frozen_batch.id = replacement_id) <> frozen_content_hash
  then
    raise exception 'Approved report did not safely hold and audit a late source fact';
  end if;
end
$commission_compensation_accounting_workflow_test$;

do $commission_validation_and_acl_test$
<<commission_validation_acl>>
declare
  manager_id constant uuid := '4a000000-0000-0000-0000-000000000001';
  invalid_case record;
  table_name text;
begin
  for invalid_case in
    select * from (values
      ('non-array steps', '{}'::jsonb, '{"enabled":false}'::jsonb,
        'GBP'::text, 100::numeric, 0, date '2025-01-01'),
      ('empty steps', '[]'::jsonb, '{"enabled":false}'::jsonb,
        'GBP', 100, 0, date '2025-01-01'),
      ('scalar step', '[1]'::jsonb, '{"enabled":false}'::jsonb,
        'GBP', 100, 0, date '2025-01-01'),
      ('unknown step key',
        '[{"thresholdGbp":1,"rewardKind":"fixed_gbp","rewardValue":1,"x":1}]'::jsonb,
        '{"enabled":false}'::jsonb, 'GBP', 100, 0, date '2025-01-01'),
      ('duplicate threshold',
        '[{"thresholdGbp":1,"rewardKind":"fixed_gbp","rewardValue":1},
          {"thresholdGbp":1,"rewardKind":"fixed_gbp","rewardValue":2}]'::jsonb,
        '{"enabled":false}'::jsonb, 'GBP', 100, 0, date '2025-01-01'),
      ('bad percentage',
        '[{"thresholdGbp":1,"rewardKind":"percentage_of_qualifying_profit",
          "rewardValue":101}]'::jsonb,
        '{"enabled":false}'::jsonb, 'GBP', 100, 0, date '2025-01-01'),
      ('disabled malformed optional',
        '[{"thresholdGbp":1,"rewardKind":"fixed_gbp","rewardValue":1}]'::jsonb,
        '{"enabled":false,"intervalGbp":"bad"}'::jsonb,
        'GBP', 100, 0, date '2025-01-01'),
      ('enabled missing fields',
        '[{"thresholdGbp":1,"rewardKind":"fixed_gbp","rewardValue":1}]'::jsonb,
        '{"enabled":true}'::jsonb, 'GBP', 100, 0, date '2025-01-01'),
      ('fractional max occurrences',
        '[{"thresholdGbp":1,"rewardKind":"fixed_gbp","rewardValue":1}]'::jsonb,
        '{"enabled":true,"startsAtGbp":2,"intervalGbp":1,
          "rewardKind":"fixed_gbp","rewardValue":1,"maxOccurrences":1.5}'::jsonb,
        'GBP', 100, 0, date '2025-01-01'),
      ('bad currency',
        '[{"thresholdGbp":1,"rewardKind":"fixed_gbp","rewardValue":1}]'::jsonb,
        '{"enabled":false}'::jsonb, 'GB', 100, 0, date '2025-01-01'),
      ('non-month date',
        '[{"thresholdGbp":1,"rewardKind":"fixed_gbp","rewardValue":1}]'::jsonb,
        '{"enabled":false}'::jsonb, 'GBP', 100, 0, date '2025-01-02'),
      ('nan profit',
        '[{"thresholdGbp":1,"rewardKind":"fixed_gbp","rewardValue":1}]'::jsonb,
        '{"enabled":false}'::jsonb, 'GBP', 'NaN'::numeric, 0, date '2025-01-01')
    ) cases(label, steps, recurring, currency, qualifying, incomplete_count, period_start)
  loop
    begin
      perform public.commission_calculate_bonus_schedule_2026090201(
        invalid_case.steps, invalid_case.recurring, invalid_case.currency,
        invalid_case.qualifying, invalid_case.incomplete_count,
        invalid_case.period_start
      );
      raise exception 'Invalid bonus case was accepted: %', invalid_case.label;
    exception when sqlstate '22023' then null;
    end;
  end loop;

  foreach table_name in array array[
    'commission_adjustments', 'commission_refund_decisions',
    'commission_review_batches', 'commission_review_batch_entries',
    'commission_review_statements', 'commission_review_events'
  ]
  loop
    if not (select class.relrowsecurity from pg_catalog.pg_class class
      where class.oid = ('public.' || table_name)::regclass)
      or has_table_privilege('anon', 'public.' || table_name, 'SELECT')
      or has_table_privilege('authenticated', 'public.' || table_name, 'SELECT')
      or has_table_privilege('service_role', 'public.' || table_name, 'INSERT')
      or not has_table_privilege('service_role', 'public.' || table_name, 'SELECT')
    then
      raise exception 'Commission table ACL/RLS contract is unsafe for %', table_name;
    end if;
  end loop;

  if has_function_privilege('service_role',
      'public.commission_process_refunds_2026090201(uuid,integer,text)', 'EXECUTE')
    or has_function_privilege('authenticated',
      'public.commission_process_shadow_2026082902(uuid,integer,text)', 'EXECUTE')
    or has_function_privilege('authenticated',
      'public.commission_apportion_money_2026090201(numeric,integer,integer)', 'EXECUTE')
    or has_function_privilege('authenticated',
      'public.commission_lock_actor_authorization_2026090201(uuid)', 'EXECUTE')
    or not has_function_privilege('service_role',
      'public.commission_process_shadow_2026082902(uuid,integer,text)', 'EXECUTE')
    or not has_function_privilege('authenticated',
      'public.commission_accounting_batches_2026090201(integer,integer)', 'EXECUTE')
  then
    raise exception 'Commission function ACL contract is unsafe';
  end if;

  -- Authorization precedes replay: a deactivated caller cannot reuse the
  -- successful key created earlier in this test to obtain a privileged result.
  update public.employees employee_record
  set is_active = false
  where employee_record.id = commission_validation_acl.manager_id;
  begin
    perform public.commission_process_shadow_2026082902(
      manager_id, 200, 'commission-three-pax-process'
    );
    raise exception 'Deactivated Commission actor replayed a privileged result';
  exception when sqlstate '42501' then null;
  end;
  update public.employees employee_record
  set is_active = true
  where employee_record.id = commission_validation_acl.manager_id;

  if position(
      'newer.supersedes_event_id = event.source_event_id'
      in pg_get_functiondef(
        'public.commission_process_shadow_core_2026090201(uuid,integer,text)'::regprocedure
      )
    ) > 0
    or position(
      'previous.source_event_id = event.supersedes_event_id'
      in pg_get_functiondef(
        'public.commission_process_shadow_core_2026090201(uuid,integer,text)'::regprocedure
      )
    ) > 0
  then
    raise exception 'Commission core retained mixed internal/business lineage comparisons';
  end if;
end
$commission_validation_and_acl_test$;

select 'Commission compensation and Accounting workflow checks passed.' as result;
