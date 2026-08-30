\set ON_ERROR_STOP on

-- Production already contains shadow entries. Seed one legacy-shaped row before
-- the compensation migration so CI proves its additive backfill respects the
-- immutable-history trigger and preserves the original GBP amount.
do $legacy_commission_entry$
declare
  run_id_value uuid;
  policy_version_id_value uuid;
  component_id_value uuid;
begin
  perform public.append_commission_source_event(jsonb_build_object(
    'source_module', 'ticketing',
    'source_event_id', '44000000-0000-0000-0000-000000000001',
    'source_fact_key', 'test:legacy-processed-archive',
    'source_record_id', '44000000-0000-0000-0000-000000000002',
    'event_type', 'ticket_entry_archived',
    'contract_version', 1,
    'event_version', 1,
    'supersedes_event_id', null,
    'employee_id', '42000000-0000-0000-0000-000000000002',
    'owner_employee_id', '42000000-0000-0000-0000-000000000002',
    'location_id', '30000000-0000-0000-0000-000000000001',
    'occurred_at', clock_timestamp(),
    'effective_on', current_date,
    'source_path', '/ticketing/ledger/test',
    'variables', jsonb_build_object('commission_scope', 'ticket', 'archived', true),
    'idempotency_key', 'test-legacy-processed-archive-0001'
  ));
  update public.commission_source_event_states state
  set processing_status = 'processed'
  from public.commission_source_events event
  where state.event_id = event.id
    and event.source_event_id = '44000000-0000-0000-0000-000000000001';

  insert into public.commission_calculation_runs (
    run_mode, run_type, status, triggered_by, completed_at
  ) values (
    'shadow', 'reprocess', 'completed',
    '42000000-0000-0000-0000-000000000001', clock_timestamp()
  ) returning id into run_id_value;

  select assignment.policy_version_id, component.id
  into policy_version_id_value, component_id_value
  from public.employee_commission_assignments assignment
  join public.commission_policy_components component
    on component.policy_version_id = assignment.policy_version_id
  where assignment.employee_id = '42000000-0000-0000-0000-000000000002'
    and assignment.service_code = 'tk_primary'
  order by component.sequence
  limit 1;

  insert into public.commission_entries (
    run_id, entry_mode, entry_kind, source_event_id, source_case_key,
    recipient_employee_id, profit_owner_employee_id, location_id,
    policy_version_id, component_id, earning_on, period_start, period_end,
    amount_gbp, basis_snapshot, explanation, revision, idempotency_key
  ) values (
    run_id_value, 'shadow', 'ordinary', null, 'test:legacy-compensation-entry',
    '42000000-0000-0000-0000-000000000002',
    '42000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    policy_version_id_value, component_id_value, current_date,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
    12.34, '{}'::jsonb, '{"legacyFixture":true}'::jsonb, 1,
    'test-legacy-compensation-entry-0001'
  );
end
$legacy_commission_entry$;
