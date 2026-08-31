insert into auth.users (id, email)
values ('40000000-0000-0000-0000-000000000002', 'other-agent@example.test')
on conflict (id) do nothing;

insert into public.employees (id, full_name, email, role_id, location_id)
values (
  '40000000-0000-0000-0000-000000000002',
  'Other Agent',
  'other-agent@example.test',
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

insert into public.commission_source_events (
  id, source_module, source_event_id, source_fact_key, source_record_id,
  event_type, contract_version, event_version, supersedes_event_id,
  employee_id, owner_employee_id, location_id, occurred_at, effective_on,
  source_path, variables, idempotency_key, created_at
)
values
  (
    '81000000-0000-0000-0000-000000000001', 'applications',
    '82000000-0000-0000-0000-000000000001', 'application:nadra:83000000-0000-0000-0000-000000000001',
    '83000000-0000-0000-0000-000000000001', 'application_completed', 1, 1, null,
    '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001', '2026-08-03T12:00:00Z', '2026-08-03',
    '/dashboard/applications/nadra',
    '{"application_kind":"nadra","eligible":true,"responsible_employee_id":"40000000-0000-0000-0000-000000000001"}',
    'performance-current-application-v1', '2026-08-03T12:00:00Z'
  ),
  (
    '81000000-0000-0000-0000-000000000002', 'applications',
    '82000000-0000-0000-0000-000000000002', 'application:visa:83000000-0000-0000-0000-000000000002',
    '83000000-0000-0000-0000-000000000002', 'application_completed', 1, 1, null,
    '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001', '2026-08-04T12:00:00Z', '2026-08-04',
    '/dashboard/applications/visa',
    '{"application_kind":"visa","eligible":true}',
    'performance-reversed-application-v1', '2026-08-04T12:00:00Z'
  ),
  (
    '81000000-0000-0000-0000-000000000003', 'applications',
    '82000000-0000-0000-0000-000000000003', 'application:visa:83000000-0000-0000-0000-000000000002',
    '83000000-0000-0000-0000-000000000002', 'application_reversed', 1, 2,
    '81000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001', '2026-08-05T12:00:00Z', '2026-08-04',
    '/dashboard/applications/visa',
    '{"application_kind":"visa","eligible":false,"deleted":true}',
    'performance-reversed-application-v2', '2026-08-05T12:00:00Z'
  ),
  (
    '81000000-0000-0000-0000-000000000004', 'ticketing',
    '82000000-0000-0000-0000-000000000004', 'transaction:83000000-0000-0000-0000-000000000003:issued',
    '83000000-0000-0000-0000-000000000003', 'ticket_issued', 1, 1, null,
    '40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001', '2026-08-06T12:00:00Z', '2026-08-06',
    '/dashboard/ticketing/ledger',
    '{"service_type":"TK","assistant_employee_ids":["40000000-0000-0000-0000-000000000001"]}',
    'performance-ticket-assistant-v1', '2026-08-06T12:00:00Z'
  ),
  (
    '81000000-0000-0000-0000-000000000005', 'applications',
    '82000000-0000-0000-0000-000000000005', 'application:nadra:83000000-0000-0000-0000-000000000004',
    '83000000-0000-0000-0000-000000000004', 'application_completed', 1, 1, null,
    '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001', '2026-08-07T12:00:00Z', '2026-08-07',
    '/dashboard/applications/nadra',
    '{"application_kind":"nadra","eligible":true}',
    'performance-owner-move-v1', '2026-08-07T12:00:00Z'
  ),
  (
    '81000000-0000-0000-0000-000000000006', 'applications',
    '82000000-0000-0000-0000-000000000006', 'application:nadra:83000000-0000-0000-0000-000000000004',
    '83000000-0000-0000-0000-000000000004', 'application_completed', 1, 2,
    '81000000-0000-0000-0000-000000000005',
    '40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001', '2026-08-08T12:00:00Z', '2026-08-07',
    '/dashboard/applications/nadra',
    '{"application_kind":"nadra","eligible":true}',
    'performance-owner-move-v2', '2026-08-08T12:00:00Z'
  );

insert into public.commission_source_events (
  id, source_module, source_event_id, source_fact_key, source_record_id,
  event_type, contract_version, event_version, supersedes_event_id,
  employee_id, owner_employee_id, location_id, occurred_at, effective_on,
  source_path, variables, idempotency_key, created_at
)
values (
  '81000000-0000-0000-0000-000000000007', 'ticketing',
  '82000000-0000-0000-0000-000000000007',
  'transaction:83000000-0000-0000-0000-000000000003:sale-completed',
  '83000000-0000-0000-0000-000000000003', 'ticket_sale_completed', 1, 1, null,
  '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001', '2026-08-07T12:00:00Z', '2026-08-06',
  '/dashboard/ticketing/ledger',
  '{"service_type":"TK","primary_responsible_employee_id":"40000000-0000-0000-0000-000000000001","assistant_employee_ids":[]}',
  'performance-ticket-financial-snapshot-v1', '2026-08-07T12:00:00Z'
);

do $assert_staff_performance_source_facts$
declare
  result_count integer;
begin
  select count(*) into result_count
  from public.staff_performance_source_facts_2026083101(
    '40000000-0000-0000-0000-000000000001',
    '2026-08-01',
    '2026-08-31'
  );

  if result_count <> 3 then
    raise exception 'Staff performance returned % current facts instead of 3', result_count;
  end if;

  if not exists (
    select 1
    from public.staff_performance_source_facts_2026083101(
      '40000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31'
    ) fact
    where fact.id = '81000000-0000-0000-0000-000000000003'
      and fact.event_type = 'application_reversed'
  ) then
    raise exception 'Current reversed Application tail was not returned';
  end if;

  if exists (
    select 1
    from public.staff_performance_source_facts_2026083101(
      '40000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31'
    ) fact
    where fact.source_record_id = '83000000-0000-0000-0000-000000000004'
  ) then
    raise exception 'Work reassigned to another employee remained in prior staff performance';
  end if;

  if not exists (
    select 1
    from public.staff_performance_source_facts_2026083101(
      '40000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31'
    ) fact
    where fact.id = '81000000-0000-0000-0000-000000000004'
  ) then
    raise exception 'Ticket assistance was not included in staff performance facts';
  end if;

  if exists (
    select 1
    from public.staff_performance_source_facts_2026083101(
      '40000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31'
    ) fact
    where fact.event_type = 'ticket_sale_completed'
  ) then
    raise exception 'Ticket financial snapshot leaked into operational performance facts';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.staff_performance_source_facts_2026083101(uuid,date,date)',
    'execute'
  ) then
    raise exception 'Authenticated clients can call employee-selectable performance facts directly';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.staff_performance_source_facts_2026083101(uuid,date,date)',
    'execute'
  ) then
    raise exception 'Service role cannot load staff performance facts';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.staff_performance_timeclock_events_2026083101(uuid,timestamptz,timestamptz)',
    'execute'
  ) then
    raise exception 'Authenticated clients can call employee-selectable timeclock facts directly';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.staff_performance_timeclock_events_2026083101(uuid,timestamptz,timestamptz)',
    'execute'
  ) then
    raise exception 'Service role cannot load staff timeclock facts';
  end if;
end
$assert_staff_performance_source_facts$;

insert into public.commission_source_events (
  id, source_module, source_event_id, source_fact_key, source_record_id,
  event_type, contract_version, event_version, supersedes_event_id,
  employee_id, owner_employee_id, location_id, occurred_at, effective_on,
  source_path, variables, idempotency_key, created_at
)
values (
  '81000000-0000-0000-0000-000000000008', 'ticketing',
  '82000000-0000-0000-0000-000000000008',
  'transaction:83000000-0000-0000-0000-000000000008:date-changed',
  '83000000-0000-0000-0000-000000000008', 'ticket_date_changed', 1, 1, null,
  '40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001', '2026-08-09T12:00:00Z', '2026-08-09',
  '/dashboard/ticketing/ledger',
  '{"service_type":"DC","acting_employee_id":"40000000-0000-0000-0000-000000000001"}',
  'performance-ticket-actor-v1', '2026-08-09T12:00:00Z'
);

do $assert_follow_on_actor$
begin
  if not exists (
    select 1
    from public.staff_performance_source_facts_2026083101(
      '40000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31'
    ) fact
    where fact.id = '81000000-0000-0000-0000-000000000008'
  ) then
    raise exception 'Acting employee did not receive follow-on ticket performance';
  end if;
end
$assert_follow_on_actor$;

insert into public.timeclock_events (
  id, employee_id, event_type, punch_type, scanned_at, adjusted_scanned_at, device_ts
)
values
  (
    '8a000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001', 'IN', 'IN',
    '2026-01-05T08:00:00Z', '2026-08-10T08:00:00Z', '2026-01-05T08:00:00Z'
  ),
  (
    '8a000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001', 'OUT', 'OUT',
    '2026-08-10T09:00:00Z', '2026-01-05T09:00:00Z', '2026-08-10T09:00:00Z'
  );

do $assert_effective_timeclock_range$
begin
  if not exists (
    select 1
    from public.staff_performance_timeclock_events_2026083101(
      '40000000-0000-0000-0000-000000000001',
      '2026-08-01T00:00:00Z',
      '2026-09-01T00:00:00Z'
    ) punch
    where punch.id = '8a000000-0000-0000-0000-000000000001'
      and punch.effective_at = '2026-08-10T08:00:00Z'
  ) then
    raise exception 'Adjusted punch moved into range was not returned';
  end if;

  if exists (
    select 1
    from public.staff_performance_timeclock_events_2026083101(
      '40000000-0000-0000-0000-000000000001',
      '2026-08-01T00:00:00Z',
      '2026-09-01T00:00:00Z'
    ) punch
    where punch.id = '8a000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'Lower-priority scanned time leaked an adjusted punch into range';
  end if;
end
$assert_effective_timeclock_range$;

set session_replication_role = replica;

insert into public.travel_packages (
  id, package_reference, package_type, status, group_id, payment_status,
  earned_at, closed_at, archived_at, sales_employee_id,
  sales_responsible_employee_id, location_id
)
values
  (
    '84000000-0000-0000-0000-000000000001', 'PERF-GROUP-LEAD', 'umrah', 'closed',
    '85000000-0000-0000-0000-000000000001', 'paid', '2026-08-20T12:00:00Z',
    '2026-08-20T12:00:00Z', null, '40000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'
  ),
  (
    '84000000-0000-0000-0000-000000000002', 'PERF-GROUP-FAMILY', 'umrah', 'closed',
    '85000000-0000-0000-0000-000000000001', 'paid', '2026-08-21T12:00:00Z',
    '2026-08-21T12:00:00Z', null, '40000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001'
  );

insert into public.travel_package_groups (
  id, group_reference, status, customer_package_id, lead_package_id, archived_at
)
values (
  '85000000-0000-0000-0000-000000000001', 'PERF-GROUP', 'finalised',
  '84000000-0000-0000-0000-000000000001',
  '84000000-0000-0000-0000-000000000001', null
);

insert into public.travel_package_group_members (
  id, group_id, package_id, is_lead_family, sort_order, created_at
)
values
  (
    '86000000-0000-0000-0000-000000000001',
    '85000000-0000-0000-0000-000000000001',
    '84000000-0000-0000-0000-000000000001', true, 0, '2026-08-01T12:00:00Z'
  ),
  (
    '86000000-0000-0000-0000-000000000002',
    '85000000-0000-0000-0000-000000000001',
    '84000000-0000-0000-0000-000000000002', false, 1, '2026-08-01T12:00:00Z'
  );

insert into public.travel_package_passengers (id, package_id)
values
  ('87000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000001'),
  ('87000000-0000-0000-0000-000000000002', '84000000-0000-0000-0000-000000000001'),
  ('87000000-0000-0000-0000-000000000003', '84000000-0000-0000-0000-000000000002'),
  ('87000000-0000-0000-0000-000000000004', '84000000-0000-0000-0000-000000000002'),
  ('87000000-0000-0000-0000-000000000005', '84000000-0000-0000-0000-000000000002');

insert into public.commission_source_events (
  id, source_module, source_event_id, source_fact_key, source_record_id,
  event_type, contract_version, event_version, supersedes_event_id,
  employee_id, owner_employee_id, location_id, occurred_at, effective_on,
  source_path, variables, idempotency_key, created_at
)
values
  (
    '88000000-0000-0000-0000-000000000001', 'packages',
    '89000000-0000-0000-0000-000000000001',
    'package-sale:84000000-0000-0000-0000-000000000001',
    '84000000-0000-0000-0000-000000000001', 'package_closed', 1, 1, null,
    '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001', '2026-08-20T12:00:00Z', '2026-08-20',
    '/dashboard/packages/84000000-0000-0000-0000-000000000001',
    '{"authoritative":true,"passenger_count":2,"sales_employee_id":"40000000-0000-0000-0000-000000000001"}',
    'performance-package-lead-v1', '2026-08-20T12:00:00Z'
  ),
  (
    '88000000-0000-0000-0000-000000000002', 'packages',
    '89000000-0000-0000-0000-000000000002',
    'package-sale:84000000-0000-0000-0000-000000000002',
    '84000000-0000-0000-0000-000000000002', 'package_closed', 1, 1, null,
    '40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001', '2026-08-21T12:00:00Z', '2026-08-21',
    '/dashboard/packages/84000000-0000-0000-0000-000000000002',
    '{"authoritative":true,"passenger_count":3,"sales_employee_id":"40000000-0000-0000-0000-000000000002"}',
    'performance-package-family-v1', '2026-08-21T12:00:00Z'
  );

set session_replication_role = origin;

do $assert_group_performance$
declare
  group_fact record;
begin
  select * into group_fact
  from public.staff_performance_source_facts_2026083101(
    '40000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31'
  ) fact
  where fact.source_fact_key = 'package-group:85000000-0000-0000-0000-000000000001';

  if not found
    or group_fact.variables ->> 'passenger_count' <> '5'
    or group_fact.effective_on <> '2026-08-21'::date
  then
    raise exception 'Linked package group was not aggregated once with all five passengers';
  end if;

  if exists (
    select 1
    from public.staff_performance_source_facts_2026083101(
      '40000000-0000-0000-0000-000000000002', '2026-08-01', '2026-08-31'
    ) fact
    where fact.source_fact_key = 'package-group:85000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Mixed-owner package group was credited to a non-canonical family owner';
  end if;
end
$assert_group_performance$;

update public.travel_packages
set status = 'returned'
where id = '84000000-0000-0000-0000-000000000002';

do $assert_reopened_group_removed$
begin
  if exists (
    select 1
    from public.staff_performance_source_facts_2026083101(
      '40000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31'
    ) fact
    where fact.source_fact_key = 'package-group:85000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Reopened package member remained as ghost group performance';
  end if;
end
$assert_reopened_group_removed$;
