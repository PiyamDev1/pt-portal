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
