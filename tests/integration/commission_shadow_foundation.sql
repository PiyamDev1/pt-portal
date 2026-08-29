\set ON_ERROR_STOP on

insert into public.roles (id, name, level)
values
  ('10000000-0000-0000-0000-000000000002', 'Admin', 90),
  ('10000000-0000-0000-0000-000000000003', 'Employee', 1),
  ('10000000-0000-0000-0000-000000000004', 'Master Admin', 100)
on conflict (id) do nothing;

insert into auth.users (id, email)
values
  ('40000000-0000-0000-0000-000000000002', 'admin@example.test'),
  ('40000000-0000-0000-0000-000000000003', 'hr@example.test'),
  ('40000000-0000-0000-0000-000000000004', 'master@example.test'),
  ('40000000-0000-0000-0000-000000000005', 'grantee@example.test')
on conflict (id) do nothing;

insert into public.employees (id, full_name, email, role_id, location_id)
values
  (
    '40000000-0000-0000-0000-000000000002', 'Test Admin', 'admin@example.test',
    '10000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001'
  ),
  (
    '40000000-0000-0000-0000-000000000003', 'Test HR', 'hr@example.test',
    '10000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001'
  ),
  (
    '40000000-0000-0000-0000-000000000004', 'Test Master', 'master@example.test',
    '10000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000001'
  ),
  (
    '40000000-0000-0000-0000-000000000005', 'Test Grantee', 'grantee@example.test',
    '10000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001'
  )
on conflict (id) do nothing;

do $capability$
declare status jsonb;
begin
  status := public.commission_schema_status();
  if status ->> 'ready' <> 'true'
    or (status ->> 'version')::bigint <> 2026082901
    or status ->> 'mode' <> 'shadow'
  then
    raise exception 'Commission capability is not ready: %', status;
  end if;
end
$capability$;

insert into public.commission_rules (id, rule_name, description, created_by)
values (
  '81000000-0000-0000-0000-000000000001',
  'Test Ticket Rule',
  'Disposable fixed ticket and monthly bonus policy',
  '40000000-0000-0000-0000-000000000002'
);

insert into public.commission_policy_versions (
  id, rule_id, version_number, status, created_by
)
values (
  '82000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001',
  1,
  'draft',
  '40000000-0000-0000-0000-000000000002'
);

insert into public.commission_policy_components (
  id, policy_version_id, sequence, component_type, source_variable,
  recipient_role, rate_value
)
values (
  '83000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  1,
  'fixed_per_unit',
  'passenger_ticket_count',
  'primary',
  5
);

insert into public.commission_policy_components (
  id, policy_version_id, sequence, component_type, recipient_role,
  threshold_gbp, reward_kind, reward_value, eligible_services
)
values (
  '83000000-0000-0000-0000-000000000002',
  '82000000-0000-0000-0000-000000000001',
  2,
  'sales_profit_bonus',
  'sales_bonus',
  1000,
  'fixed_gbp',
  100,
  '["tk_primary"]'::jsonb
);

update public.commission_policy_versions
set status = 'active',
    content_hash = repeat('a', 64),
    activated_by = '40000000-0000-0000-0000-000000000002',
    activated_at = clock_timestamp()
where id = '82000000-0000-0000-0000-000000000001';

insert into public.employee_commission_assignments (
  id, employee_id, rule_id, start_date, policy_version_id, source_module,
  service_code, recipient_role, created_by
)
values (
  '84000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001',
  '2026-08-01',
  '82000000-0000-0000-0000-000000000001',
  'ticketing',
  'tk_primary',
  'primary',
  '40000000-0000-0000-0000-000000000002'
);

do $assignment_resolution$
declare version_id uuid;
begin
  version_id := public.commission_resolve_assignment_2026082901(
    '40000000-0000-0000-0000-000000000001',
    'ticketing', 'tk_primary', 'primary',
    '30000000-0000-0000-0000-000000000001', '2026-08-29'
  );
  if version_id <> '82000000-0000-0000-0000-000000000001' then
    raise exception 'Commission assignment did not resolve';
  end if;
end
$assignment_resolution$;

do $overlap_rejected$
begin
  begin
    insert into public.employee_commission_assignments (
      employee_id, rule_id, start_date, effective_to, policy_version_id,
      source_module, service_code, recipient_role, created_by
    ) values (
      '40000000-0000-0000-0000-000000000001',
      '81000000-0000-0000-0000-000000000001',
      '2026-08-15', null,
      '82000000-0000-0000-0000-000000000001',
      'ticketing', 'tk_primary', 'primary',
      '40000000-0000-0000-0000-000000000002'
    );
    raise exception 'Expected overlapping assignment rejection';
  exception
    when exclusion_violation then null;
  end;
end
$overlap_rejected$;

do $component_math$
begin
  if public.commission_calculate_component_2026082901(
    'fixed_per_unit', 5, null, 50, null, null
  ) <> 250.00 then
    raise exception 'Fixed-per-unit Commission calculation is incorrect';
  end if;

  if public.commission_calculate_component_2026082901(
    'percentage_of_variable', 10, 90, null, null, null
  ) <> 9.00 then
    raise exception 'Percentage Commission calculation is incorrect';
  end if;

  if public.commission_calculate_component_2026082901(
    'signed_percentage', 100, -25, null, null, null
  ) <> -25.00 then
    raise exception 'Signed Commission debit calculation is incorrect';
  end if;
end
$component_math$;

do $bonus_math$
declare result jsonb;
begin
  result := public.commission_calculate_sales_bonus_2026082901(
    1000, 'fixed_gbp', 100, 999.99, 0
  );
  if (result ->> 'achieved')::boolean or (result ->> 'rewardGbp')::numeric <> 0 then
    raise exception 'Below-threshold sales bonus was awarded: %', result;
  end if;

  result := public.commission_calculate_sales_bonus_2026082901(
    1000, 'fixed_gbp', 100, 1000, 0
  );
  if not (result ->> 'achieved')::boolean
    or (result ->> 'rewardGbp')::numeric <> 100
  then
    raise exception 'Fixed sales bonus was not awarded at threshold: %', result;
  end if;

  result := public.commission_calculate_sales_bonus_2026082901(
    1000, 'percentage_of_qualifying_profit', 10, 1500, 0
  );
  if (result ->> 'rewardGbp')::numeric <> 150 then
    raise exception 'Percentage sales bonus used the wrong basis: %', result;
  end if;

  result := public.commission_calculate_sales_bonus_2026082901(
    1000, 'fixed_gbp', 100, 1500, 1
  );
  if (result ->> 'achieved')::boolean or (result ->> 'rewardGbp')::numeric <> 0 then
    raise exception 'Incomplete bonus period was awarded: %', result;
  end if;
end
$bonus_math$;

insert into public.commission_access_grants (
  employee_id, capability, granted_by
)
values (
  '40000000-0000-0000-0000-000000000003',
  'manage_commission_policies',
  '40000000-0000-0000-0000-000000000002'
);

do $access_checks$
begin
  if not public.commission_actor_can_manage_2026082901(
    '40000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'Admin did not receive Commission policy access';
  end if;
  if not public.commission_actor_can_manage_2026082901(
    '40000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'Granted HR employee did not receive Commission policy access';
  end if;
  if public.commission_actor_can_manage_2026082901(
    '40000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Ordinary employee received Commission policy access';
  end if;
end
$access_checks$;

do $transactional_policy_workflow$
declare policy_result jsonb;
declare repeated_policy_result jsonb;
declare version_result jsonb;
declare activation_result jsonb;
declare assignment_result jsonb;
declare policy_id uuid;
declare version_id uuid;
begin
  policy_result := public.commission_create_policy_2026082901(
    '40000000-0000-0000-0000-000000000002',
    'Transactional Ticket Rule',
    'Created through the audited database boundary',
    'policy-create-0001'
  );
  repeated_policy_result := public.commission_create_policy_2026082901(
    '40000000-0000-0000-0000-000000000002',
    'This duplicate payload is ignored',
    null,
    'policy-create-0001'
  );
  if policy_result ->> 'id' is distinct from repeated_policy_result ->> 'id' then
    raise exception 'Commission policy idempotency did not return the original result';
  end if;
  policy_id := (policy_result ->> 'id')::uuid;

  version_result := public.commission_create_policy_version_2026082901(
    '40000000-0000-0000-0000-000000000002',
    policy_id,
    '[{"componentType":"fixed_per_unit","sourceVariable":"passenger_ticket_count","recipientRole":"primary","rateValue":"5.00"},{"componentType":"sales_profit_bonus","recipientRole":"sales_bonus","thresholdGbp":"1000.00","rewardKind":"fixed_gbp","rewardValue":"100.00","eligibleServices":["tk_primary"]}]'::jsonb,
    'version-create-0001'
  );
  version_id := (version_result ->> 'id')::uuid;
  activation_result := public.commission_activate_policy_version_2026082901(
    '40000000-0000-0000-0000-000000000002',
    policy_id,
    version_id,
    'version-activate-0001'
  );
  if activation_result ->> 'status' <> 'active'
    or length(activation_result ->> 'contentHash') <> 64
  then
    raise exception 'Commission policy activation did not create a content hash: %',
      activation_result;
  end if;

  assignment_result := public.commission_create_assignment_2026082901(
    '40000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000003',
    version_id,
    'ticketing', 'tk_primary', 'primary', null,
    '2026-09-01', null,
    'assignment-create-0001'
  );
  if assignment_result ->> 'employeeId' <> '40000000-0000-0000-0000-000000000003' then
    raise exception 'Commission assignment workflow returned the wrong employee';
  end if;
  if (
    select count(*) from public.commission_audit_events
    where action = 'policy.created' and request_key = 'policy-create-0001'
  ) <> 1 then
    raise exception 'Commission idempotent policy request wrote duplicate audit evidence';
  end if;
end
$transactional_policy_workflow$;

do $historical_assignment_survives_retirement$
declare version_result jsonb;
declare replacement_version_id uuid;
declare resolved_version_id uuid;
begin
  version_result := public.commission_create_policy_version_2026082901(
    '40000000-0000-0000-0000-000000000002',
    '81000000-0000-0000-0000-000000000001',
    '[{"componentType":"fixed_per_unit","sourceVariable":"passenger_ticket_count","recipientRole":"primary","rateValue":"6.00"}]'::jsonb,
    'version-create-0002'
  );
  replacement_version_id := (version_result ->> 'id')::uuid;
  perform public.commission_activate_policy_version_2026082901(
    '40000000-0000-0000-0000-000000000002',
    '81000000-0000-0000-0000-000000000001',
    replacement_version_id,
    'version-activate-0002'
  );
  if (
    select status from public.commission_policy_versions
    where id = '82000000-0000-0000-0000-000000000001'
  ) <> 'retired' then
    raise exception 'Superseded Commission policy version was not retired';
  end if;

  resolved_version_id := public.commission_resolve_assignment_2026082901(
    '40000000-0000-0000-0000-000000000001',
    'ticketing', 'tk_primary', 'primary',
    '30000000-0000-0000-0000-000000000001', '2026-08-29'
  );
  if resolved_version_id <> '82000000-0000-0000-0000-000000000001' then
    raise exception 'Retiring a policy erased its historical assignment resolution';
  end if;
end
$historical_assignment_survives_retirement$;

do $grant_workflow$
declare grant_result jsonb;
declare revoke_result jsonb;
declare grant_id uuid;
begin
  begin
    perform public.commission_grant_access_2026082901(
      '40000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000005',
      'grant-denied-0001'
    );
    raise exception 'Expected Admin Commission grant rejection';
  exception when insufficient_privilege then null;
  end;

  grant_result := public.commission_grant_access_2026082901(
    '40000000-0000-0000-0000-000000000004',
    '40000000-0000-0000-0000-000000000005',
    'grant-create-0001'
  );
  grant_id := (grant_result ->> 'id')::uuid;
  if not public.commission_actor_can_manage_2026082901(
    '40000000-0000-0000-0000-000000000005'
  ) then
    raise exception 'Granted employee did not receive Commission access';
  end if;

  revoke_result := public.commission_revoke_access_2026082901(
    '40000000-0000-0000-0000-000000000004',
    grant_id,
    'grant-revoke-0001'
  );
  if revoke_result ->> 'revoked' <> 'true'
    or public.commission_actor_can_manage_2026082901(
      '40000000-0000-0000-0000-000000000005'
    )
  then
    raise exception 'Revoked employee retained Commission access';
  end if;
end
$grant_workflow$;

do $preview_workflow$
declare fixed_result jsonb;
declare bonus_result jsonb;
declare overview_result jsonb;
begin
  fixed_result := public.commission_preview_component_2026082901(
    '40000000-0000-0000-0000-000000000002',
    '{"componentType":"fixed_per_unit","recipientRole":"primary","rateValue":"5.00"}',
    '{"units":50}',
    'preview-fixed-0001'
  );
  if (fixed_result #>> '{result,amountGbp}')::numeric <> 250 then
    raise exception 'Synthetic fixed Commission preview was incorrect: %', fixed_result;
  end if;

  bonus_result := public.commission_preview_component_2026082901(
    '40000000-0000-0000-0000-000000000002',
    '{"componentType":"sales_profit_bonus","recipientRole":"sales_bonus","thresholdGbp":"1000","rewardKind":"fixed_gbp","rewardValue":"100"}',
    '{"qualifyingProfitGbp":"1000","incompleteInputCount":0}',
    'preview-bonus-0001'
  );
  if (bonus_result #>> '{result,rewardGbp}')::numeric <> 100
    or not (bonus_result #>> '{result,achieved}')::boolean
  then raise exception 'Synthetic bonus preview was incorrect: %', bonus_result; end if;

  overview_result := public.commission_shadow_overview_2026082901(
    '40000000-0000-0000-0000-000000000002'
  );
  if overview_result ->> 'pendingEvents' is null
    or overview_result ->> 'shadowTotalGbp' is null
  then raise exception 'Commission shadow overview is incomplete: %', overview_result; end if;
end
$preview_workflow$;

insert into public.commission_calculation_runs (
  id, run_type, status, triggered_by, completed_at
)
values (
  '85000000-0000-0000-0000-000000000001',
  'worker',
  'completed',
  '40000000-0000-0000-0000-000000000002',
  clock_timestamp()
);

insert into public.commission_entries (
  id, run_id, source_case_key, recipient_employee_id, profit_owner_employee_id,
  location_id, policy_version_id, component_id, earning_on, period_start,
  period_end, amount_gbp, basis_snapshot, explanation, idempotency_key
)
values (
  '86000000-0000-0000-0000-000000000001',
  '85000000-0000-0000-0000-000000000001',
  'ticketing:test-case',
  '40000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  '83000000-0000-0000-0000-000000000001',
  '2026-08-29', '2026-08-01', '2026-08-31', 250,
  '{"units":50,"rateGbp":"5.00"}',
  '{"componentType":"fixed_per_unit"}',
  'test:fixed-ticket-entry'
);

do $immutability$
begin
  begin
    update public.commission_entries
    set amount_gbp = 999
    where id = '86000000-0000-0000-0000-000000000001';
    raise exception 'Expected Commission entry immutability rejection';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  begin
    update public.commission_policy_components
    set rate_value = 99
    where id = '83000000-0000-0000-0000-000000000001';
    raise exception 'Expected active policy component immutability rejection';
  exception
    when object_not_in_prerequisite_state then null;
  end;
end
$immutability$;

do $least_privilege$
begin
  if has_table_privilege('authenticated', 'public.commission_policy_versions', 'SELECT')
    or has_table_privilege('authenticated', 'public.commission_entries', 'SELECT')
    or has_table_privilege('authenticated', 'public.commission_access_grants', 'INSERT')
    or has_function_privilege(
      'authenticated',
      'public.commission_actor_can_manage_2026082901(uuid)',
      'EXECUTE'
    )
  then
    raise exception 'Authenticated received direct Commission access';
  end if;
end
$least_privilege$;

select 'commission shadow foundation assertions passed' as result;
