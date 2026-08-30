-- Safe linked-environment smoke check for Commission capability 2026083004.
-- The synthetic Package is rolled back and the output contains no money or PII.

begin;

select
  status ->> 'version' as version,
  status ->> 'requiredVersion' as required_version,
  status ->> 'packageIntegrationReady' as package_integration_ready,
  status ->> 'packageReadinessReady' as package_readiness_ready
from (select public.commission_schema_status() as status) current_status;

select
  has_function_privilege(
    'service_role',
    'public.commission_package_readiness_2026083004(uuid)',
    'EXECUTE'
  ) as service_can_execute,
  has_function_privilege(
    'authenticated',
    'public.commission_package_readiness_2026083004(uuid)',
    'EXECUTE'
  ) as browser_can_execute;

insert into public.travel_packages (
  id,
  package_reference,
  package_type,
  status,
  payment_status,
  metadata
)
values (
  '60000000-0000-4000-8000-00000000ff04',
  'PKG-COMMISSION-READINESS-SMOKE',
  'umrah',
  'returned',
  'not_requested',
  '{}'::jsonb
);

select
  (public.commission_schema_status() ->> 'version')::bigint as capability_version,
  (public.commission_schema_status() ->> 'packageReadinessReady')::boolean
    as readiness_capability_ready,
  has_function_privilege(
    'service_role',
    'public.commission_package_readiness_2026083004(uuid)',
    'EXECUTE'
  ) as service_can_execute,
  has_function_privilege(
    'authenticated',
    'public.commission_package_readiness_2026083004(uuid)',
    'EXECUTE'
  ) as browser_can_execute,
  readiness ->> 'stage' as stage,
  readiness ->> 'state' as state,
  readiness ->> 'handoffReady' as handoff_ready,
  jsonb_array_length(readiness -> 'issues') as issue_count,
  readiness ? 'packageProfitGbp'
    or readiness ? 'package_profit_gbp'
    or readiness ? 'amountGbp'
    or readiness ? 'payCurrency' as leaked_money
from (
  select public.commission_package_readiness_2026083004(
    '60000000-0000-4000-8000-00000000ff04'
  ) as readiness
) result;

rollback;
