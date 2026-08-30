\set ON_ERROR_STOP on

do $compensation_profile$
declare
  configuration jsonb := $json$
  {
    "uiVersion": 3,
    "draft": {
      "compensation": {"currency": "PKR", "monthlySalary": 150000},
      "ticketTierOptions": {"includeDateChanges": true}
    },
    "services": [
      {
        "sourceModule": "ticketing",
        "serviceCode": "tk_primary",
        "recipientRole": "primary",
        "components": [{
          "componentType": "marginal_ticket_tier",
          "recipientRole": "primary",
          "eligibleServices": ["tk_primary"],
          "tiers": [
            {"minUnit": 1, "rateGbp": 100},
            {"minUnit": 3, "rateGbp": 300}
          ],
          "config": {
            "serviceCode": "tk_primary",
            "payCurrency": "PKR",
            "includeDateChangesInMarginalTiers": true
          }
        }]
      },
      {
        "sourceModule": "ticketing",
        "serviceCode": "tk_assistance",
        "recipientRole": "assistant",
        "components": [{
          "componentType": "fixed_per_unit",
          "sourceVariable": "passenger_ticket_count",
          "recipientRole": "assistant",
          "rateValue": 0,
          "eligibleServices": ["tk_assistance"],
          "config": {
            "serviceCode": "tk_assistance",
            "payCurrency": "PKR",
            "assistanceScope": {
              "mode": "specific_agents",
              "employeeIds": [
                "42000000-0000-0000-0000-000000000002",
                "42000000-0000-0000-0000-000000000003"
              ],
              "agentRates": [
                {"employeeId": "42000000-0000-0000-0000-000000000002", "value": 3},
                {"employeeId": "42000000-0000-0000-0000-000000000003", "value": 2}
              ]
            }
          }
        }]
      },
      {
        "sourceModule": "ticketing",
        "serviceCode": "dc",
        "recipientRole": "primary",
        "components": [{
          "componentType": "explicit_zero",
          "recipientRole": "primary",
          "rateValue": 0,
          "eligibleServices": ["dc"],
          "config": {"serviceCode": "dc", "payCurrency": "PKR"}
        }]
      },
      {
        "sourceModule": "ticketing",
        "serviceCode": "r_er",
        "recipientRole": "primary",
        "components": [{
          "componentType": "explicit_zero",
          "recipientRole": "primary",
          "rateValue": 0,
          "eligibleServices": ["r_er"],
          "config": {"serviceCode": "r_er", "payCurrency": "PKR"}
        }]
      },
      {
        "sourceModule": "ticketing",
        "serviceCode": "low_fare",
        "recipientRole": "low_fare_actor",
        "components": [{
          "componentType": "fixed_per_unit",
          "sourceVariable": "passenger_ticket_count",
          "recipientRole": "low_fare_actor",
          "rateValue": 500,
          "eligibleServices": ["low_fare"],
          "config": {"serviceCode": "low_fare", "payCurrency": "PKR"}
        }]
      },
      {
        "sourceModule": "ticketing",
        "serviceCode": "higher_fare",
        "recipientRole": "low_fare_actor",
        "components": [{
          "componentType": "signed_percentage",
          "sourceVariable": "difference_gbp",
          "recipientRole": "low_fare_actor",
          "rateValue": 100,
          "eligibleServices": ["higher_fare"],
          "config": {"serviceCode": "higher_fare", "payCurrency": "PKR"}
        }]
      },
      {
        "sourceModule": "packages",
        "serviceCode": "package_sale",
        "recipientRole": "package_sales",
        "components": [{
          "componentType": "explicit_zero",
          "recipientRole": "package_sales",
          "rateValue": 0,
          "eligibleServices": ["package_sale"],
          "config": {"serviceCode": "package_sale", "payCurrency": "PKR"}
        }]
      }
    ]
  }
  $json$::jsonb;
  profile_result jsonb;
  profile_id_value uuid;
  month_start date := date_trunc('month', current_date)::date;
  assistance_component_id uuid;
  low_fare_component_id uuid;
  higher_fare_component_id uuid;
  values_result jsonb;
begin
  if (public.commission_schema_status() ->> 'version')::bigint <> 2026083001
    or public.commission_schema_status() ->> 'profileReady' <> 'true'
  then
    raise exception 'Commission compensation capability 2026083001 is not ready';
  end if;
  if not exists (
    select 1
    from public.commission_entries entry
    where entry.idempotency_key = 'test-legacy-compensation-entry-0001'
      and entry.amount_gbp = 12.34
      and entry.amount_pay_currency = 12.34
      and entry.pay_currency = 'GBP'
      and entry.exchange_rate_units_per_gbp = 1
  ) then
    raise exception 'Legacy GBP Commission entry was not backfilled safely';
  end if;
  if not exists (
    select 1
    from public.commission_source_events event
    join public.commission_source_event_states state on state.event_id = event.id
    where event.source_event_id = '44000000-0000-0000-0000-000000000001'
      and state.processing_status = 'pending'
  ) then
    raise exception 'Previously processed archive event was not queued for reconciliation';
  end if;

  perform public.commission_set_monthly_exchange_rate_2026083001(
    '42000000-0000-0000-0000-000000000001',
    'PKR', month_start, 350, 'compensation-fx-rate-0001'
  );

  profile_result := public.commission_create_employee_profile_2026082904(
    '42000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000004',
    'PKR tier and assistance plan', month_start, null, null, configuration,
    'Test local compensation and tier options', 'compensation-profile-0001'
  );
  profile_id_value := (profile_result ->> 'id')::uuid;

  select component.id into assistance_component_id
  from public.employee_commission_assignments assignment
  join public.commission_policy_components component
    on component.policy_version_id = assignment.policy_version_id
  where assignment.profile_id = profile_id_value
    and assignment.service_code = 'tk_assistance';
  select component.id into low_fare_component_id
  from public.employee_commission_assignments assignment
  join public.commission_policy_components component
    on component.policy_version_id = assignment.policy_version_id
  where assignment.profile_id = profile_id_value
    and assignment.service_code = 'low_fare';
  select component.id into higher_fare_component_id
  from public.employee_commission_assignments assignment
  join public.commission_policy_components component
    on component.policy_version_id = assignment.policy_version_id
  where assignment.profile_id = profile_id_value
    and assignment.service_code = 'higher_fare';

  values_result := public.commission_component_values_2026083001(
    assistance_component_id,
    jsonb_build_object(
      'passenger_ticket_count', 1,
      'primary_responsible_employee_id', '42000000-0000-0000-0000-000000000002'
    ),
    1, 0, month_start
  );
  if (values_result ->> 'amountPayCurrency')::numeric <> 3 then
    raise exception 'First primary agent did not use their PKR 3 assistance rate: %', values_result;
  end if;

  values_result := public.commission_component_values_2026083001(
    assistance_component_id,
    jsonb_build_object(
      'passenger_ticket_count', 1,
      'primary_responsible_employee_id', '42000000-0000-0000-0000-000000000003'
    ),
    1, 0, month_start
  );
  if (values_result ->> 'amountPayCurrency')::numeric <> 2 then
    raise exception 'Second primary agent did not use their PKR 2 assistance rate: %', values_result;
  end if;

  values_result := public.commission_component_values_2026083001(
    low_fare_component_id,
    jsonb_build_object('passenger_ticket_count', 2),
    2, 0, month_start
  );
  if (values_result ->> 'amountPayCurrency')::numeric <> 1000
    or (values_result ->> 'amountGbp')::numeric <> 2.86
  then
    raise exception 'Fixed Low Fare ticket value did not convert correctly: %', values_result;
  end if;

  values_result := public.commission_component_values_2026083001(
    higher_fare_component_id,
    jsonb_build_object('difference_gbp', -40),
    1, 0, month_start
  );
  if (values_result ->> 'amountGbp')::numeric <> -40
    or (values_result ->> 'amountPayCurrency')::numeric <> -14000
  then
    raise exception 'Full supplier fare increase did not debit the complete difference: %',
      values_result;
  end if;
end
$compensation_profile$;

select public.append_commission_source_event(jsonb_build_object(
  'source_module', 'ticketing',
  'source_event_id', '43000000-0000-0000-0000-000000000001',
  'source_fact_key', 'compensation-tier:first-issued',
  'source_record_id', '43000000-0000-0000-0000-000000000011',
  'event_type', 'ticket_issued', 'contract_version', 1, 'event_version', 1,
  'supersedes_event_id', null,
  'employee_id', '42000000-0000-0000-0000-000000000004',
  'owner_employee_id', '42000000-0000-0000-0000-000000000004',
  'location_id', '30000000-0000-0000-0000-000000000001',
  'occurred_at', date_trunc('month', current_date) + interval '1 day 9 hours',
  'effective_on', date_trunc('month', current_date)::date + 1,
  'source_path', '/ticketing/ledger/test',
  'variables', jsonb_build_object(
    'passenger_ticket_count', 1, 'commission_scope', 'ticket',
    'primary_responsible_employee_id', '42000000-0000-0000-0000-000000000004',
    'assistant_employee_ids', '[]'::jsonb
  ),
  'idempotency_key', 'compensation-tier-first-issued-0001'
));

select public.append_commission_source_event(jsonb_build_object(
  'source_module', 'ticketing',
  'source_event_id', '43000000-0000-0000-0000-000000000002',
  'source_fact_key', 'compensation-tier:date-change',
  'source_record_id', '43000000-0000-0000-0000-000000000012',
  'event_type', 'ticket_date_changed', 'contract_version', 1, 'event_version', 1,
  'supersedes_event_id', null,
  'employee_id', '42000000-0000-0000-0000-000000000004',
  'owner_employee_id', '42000000-0000-0000-0000-000000000004',
  'location_id', '30000000-0000-0000-0000-000000000001',
  'occurred_at', date_trunc('month', current_date) + interval '2 days 9 hours',
  'effective_on', date_trunc('month', current_date)::date + 1,
  'source_path', '/ticketing/ledger/test',
  'variables', jsonb_build_object(
    'passenger_ticket_count', 1, 'commission_scope', 'ticket'
  ),
  'idempotency_key', 'compensation-tier-date-change-0001'
));

select public.append_commission_source_event(jsonb_build_object(
  'source_module', 'ticketing',
  'source_event_id', '43000000-0000-0000-0000-000000000003',
  'source_fact_key', 'compensation-tier:second-issued',
  'source_record_id', '43000000-0000-0000-0000-000000000013',
  'event_type', 'ticket_issued', 'contract_version', 1, 'event_version', 1,
  'supersedes_event_id', null,
  'employee_id', '42000000-0000-0000-0000-000000000004',
  'owner_employee_id', '42000000-0000-0000-0000-000000000004',
  'location_id', '30000000-0000-0000-0000-000000000001',
  'occurred_at', date_trunc('month', current_date) + interval '3 days 9 hours',
  'effective_on', date_trunc('month', current_date)::date + 1,
  'source_path', '/ticketing/ledger/test',
  'variables', jsonb_build_object(
    'passenger_ticket_count', 1, 'commission_scope', 'ticket',
    'primary_responsible_employee_id', '42000000-0000-0000-0000-000000000004',
    'assistant_employee_ids', '[]'::jsonb
  ),
  'idempotency_key', 'compensation-tier-second-issued-0001'
));

do $date_change_tier_volume$
declare
  process_result jsonb;
  ticket_component_id uuid;
begin
  process_result := public.commission_process_shadow_2026082902(
    '42000000-0000-0000-0000-000000000001', 20, 'compensation-tier-process-0001'
  );
  select component.id into ticket_component_id
  from public.employee_commission_assignments assignment
  join public.commission_policy_components component
    on component.policy_version_id = assignment.policy_version_id
  where assignment.employee_id = '42000000-0000-0000-0000-000000000004'
    and assignment.service_code = 'tk_primary';

  if not exists (
    select 1
    from public.commission_entries entry
    join public.commission_source_events source_event on source_event.id = entry.source_event_id
    where entry.component_id = ticket_component_id
      and source_event.source_event_id = '43000000-0000-0000-0000-000000000003'
      and entry.amount_pay_currency = 300
      and entry.basis_snapshot ->> 'priorMarginalUnits' = '2'
  ) then
    raise exception 'Date change did not advance the enabled marginal ticket tier: %', process_result;
  end if;
end
$date_change_tier_volume$;

select public.append_commission_source_event(jsonb_build_object(
  'source_module', 'ticketing',
  'source_event_id', '43000000-0000-0000-0000-000000000004',
  'source_fact_key', 'compensation-tier:first-issued',
  'source_record_id', '43000000-0000-0000-0000-000000000011',
  'event_type', 'ticket_entry_archived', 'contract_version', 1, 'event_version', 2,
  'supersedes_event_id', '43000000-0000-0000-0000-000000000001',
  'employee_id', '42000000-0000-0000-0000-000000000004',
  'owner_employee_id', '42000000-0000-0000-0000-000000000004',
  'location_id', '30000000-0000-0000-0000-000000000001',
  'occurred_at', date_trunc('month', current_date) + interval '4 days 9 hours',
  'effective_on', date_trunc('month', current_date)::date + 1,
  'source_path', '/ticketing/ledger/test',
  'variables', jsonb_build_object(
    'passenger_ticket_count', 1, 'commission_scope', 'ticket', 'archived', true
  ),
  'idempotency_key', 'compensation-tier-first-archive-0001'
));

do $archive_recalculates_later_tiers$
declare
  ticket_component_id uuid;
begin
  perform public.commission_process_shadow_2026082902(
    '42000000-0000-0000-0000-000000000001', 20, 'compensation-tier-archive-0001'
  );
  perform public.commission_process_shadow_2026082902(
    '42000000-0000-0000-0000-000000000001', 20, 'compensation-tier-reprocess-0001'
  );

  select component.id into ticket_component_id
  from public.employee_commission_assignments assignment
  join public.commission_policy_components component
    on component.policy_version_id = assignment.policy_version_id
  where assignment.employee_id = '42000000-0000-0000-0000-000000000004'
    and assignment.service_code = 'tk_primary';

  if (
    select coalesce(sum(entry.amount_pay_currency), 0)
    from public.commission_entries entry
    where entry.component_id = ticket_component_id
      and not exists (
        select 1 from public.commission_entries newer
        where newer.supersedes_entry_id = entry.id
      )
  ) <> 100 then
    raise exception 'Archived ticket retained Commission or marginal-tier volume';
  end if;
  if not exists (
    select 1
    from public.commission_entries entry
    join public.commission_source_events source_event on source_event.id = entry.source_event_id
    where entry.component_id = ticket_component_id
      and source_event.source_event_id = '43000000-0000-0000-0000-000000000003'
      and entry.amount_pay_currency = 100
      and entry.basis_snapshot ->> 'priorMarginalUnits' = '1'
      and not exists (
        select 1 from public.commission_entries newer
        where newer.supersedes_entry_id = entry.id
      )
  ) then
    raise exception 'Later marginal entry was not recalculated after ticket deletion';
  end if;
end
$archive_recalculates_later_tiers$;

select 'commission compensation, tiers, and archive assertions passed' as result;
