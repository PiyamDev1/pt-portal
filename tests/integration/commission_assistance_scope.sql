\set ON_ERROR_STOP on

do $assistance_scope$
declare
  scoped_policy jsonb;
  scoped_version jsonb;
  scoped_component_id uuid;
  legacy_policy jsonb;
  legacy_version jsonb;
  legacy_component_id uuid;
  amount_value numeric;
begin
  if (public.commission_schema_status() ->> 'version')::bigint <> 2026082905
    or public.commission_schema_status() ->> 'profileReady' <> 'true'
  then
    raise exception 'Commission assistance-scope capability 2026082905 is not ready';
  end if;

  scoped_policy := public.commission_create_policy_2026082901(
    '42000000-0000-0000-0000-000000000001',
    'Scoped Ticket Assistance',
    'Ticket Assistance limited to selected primary agents',
    'assistance-scope-policy-0001'
  );
  scoped_version := public.commission_create_policy_version_2026082901(
    '42000000-0000-0000-0000-000000000001',
    (scoped_policy ->> 'id')::uuid,
    jsonb_build_array(jsonb_build_object(
      'componentType', 'fixed_per_unit',
      'sourceVariable', 'passenger_ticket_count',
      'recipientRole', 'assistant',
      'rateValue', 5,
      'eligibleServices', jsonb_build_array('tk_assistance'),
      'config', jsonb_build_object(
        'serviceCode', 'tk_assistance',
        'assistanceScope', jsonb_build_object(
          'mode', 'specific_agents',
          'employeeIds', jsonb_build_array(
            '42000000-0000-0000-0000-000000000002'
          )
        )
      )
    )),
    'assistance-scope-version-0001'
  );
  perform public.commission_activate_policy_version_2026082901(
    '42000000-0000-0000-0000-000000000001',
    (scoped_policy ->> 'id')::uuid,
    (scoped_version ->> 'id')::uuid,
    'assistance-scope-activate-0001'
  );
  select id into scoped_component_id
  from public.commission_policy_components
  where policy_version_id = (scoped_version ->> 'id')::uuid;

  amount_value := public.commission_component_amount_2026082902(
    scoped_component_id,
    jsonb_build_object(
      'passenger_ticket_count', 2,
      'primary_responsible_employee_id', '42000000-0000-0000-0000-000000000002'
    ),
    2,
    0
  );
  if amount_value <> 10 then
    raise exception 'Selected primary agent did not earn scoped Ticket Assistance: %', amount_value;
  end if;

  amount_value := public.commission_component_amount_2026082902(
    scoped_component_id,
    jsonb_build_object(
      'passenger_ticket_count', 2,
      'primary_responsible_employee_id', '42000000-0000-0000-0000-000000000004'
    ),
    2,
    0
  );
  if amount_value <> 0 then
    raise exception 'Unselected primary agent unexpectedly earned Ticket Assistance: %', amount_value;
  end if;

  begin
    perform public.commission_component_amount_2026082902(
      scoped_component_id,
      jsonb_build_object('passenger_ticket_count', 2),
      2,
      0
    );
    raise exception 'Scoped Ticket Assistance accepted a missing primary employee';
  exception when invalid_parameter_value then
    null;
  end;

  legacy_policy := public.commission_create_policy_2026082901(
    '42000000-0000-0000-0000-000000000001',
    'All-agent Ticket Assistance',
    'Legacy-compatible Ticket Assistance without an explicit scope',
    'assistance-all-policy-0001'
  );
  legacy_version := public.commission_create_policy_version_2026082901(
    '42000000-0000-0000-0000-000000000001',
    (legacy_policy ->> 'id')::uuid,
    jsonb_build_array(jsonb_build_object(
      'componentType', 'fixed_per_unit',
      'sourceVariable', 'passenger_ticket_count',
      'recipientRole', 'assistant',
      'rateValue', 3,
      'eligibleServices', jsonb_build_array('tk_assistance'),
      'config', jsonb_build_object('serviceCode', 'tk_assistance')
    )),
    'assistance-all-version-0001'
  );
  select id into legacy_component_id
  from public.commission_policy_components
  where policy_version_id = (legacy_version ->> 'id')::uuid;

  amount_value := public.commission_component_amount_2026082902(
    legacy_component_id,
    jsonb_build_object(
      'passenger_ticket_count', 2,
      'primary_responsible_employee_id', '42000000-0000-0000-0000-000000000004'
    ),
    2,
    0
  );
  if amount_value <> 6 then
    raise exception 'Legacy Ticket Assistance did not default to all primary agents: %', amount_value;
  end if;

  if has_function_privilege(
    'authenticated',
    'public.commission_component_amount_2026082902(uuid,jsonb,integer,integer)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.commission_component_amount_2026082902(uuid,jsonb,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'Commission assistance-scope calculator grants are incorrect';
  end if;
end
$assistance_scope$;

select 'commission assistance-scope assertions passed' as result;
