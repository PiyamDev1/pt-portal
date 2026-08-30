-- A completed Application that predates Commission capability 2026083005.

insert into public.roles (id, name, level)
values
  ('12000000-0000-0000-0000-000000000001', 'Admin', 90),
  ('12000000-0000-0000-0000-000000000002', 'Employee', 1)
on conflict (id) do nothing;

insert into auth.users (id, email)
values
  ('42000000-0000-0000-0000-000000000001', 'profile-admin@example.test'),
  ('42000000-0000-0000-0000-000000000006', 'application-agent@example.test'),
  ('42000000-0000-0000-0000-000000000007', 'application-agent-two@example.test')
on conflict (id) do nothing;

insert into public.employees (id, full_name, email, role_id, location_id)
values
  (
    '42000000-0000-0000-0000-000000000001',
    'Profile Admin',
    'profile-admin@example.test',
    '12000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001'
  ),
  (
    '42000000-0000-0000-0000-000000000006',
    'Application Agent',
    'application-agent@example.test',
    '12000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001'
  ),
  (
    '42000000-0000-0000-0000-000000000007',
    'Application Agent Two',
    'application-agent-two@example.test',
    '12000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001'
  )
on conflict (id) do nothing;

insert into public.nadra_services (
  id, employee_id, application_date, status, is_refunded, service_type, tracking_number
)
values (
  '80000000-0000-0000-0000-000000000101',
  '42000000-0000-0000-0000-000000000006',
  current_timestamp - interval '2 days',
  'Completed',
  false,
  'NICOP',
  'NADRA-COMMISSION-101'
);

insert into public.nadra_status_history (
  id, nadra_service_id, new_status, changed_at
)
values (
  '81000000-0000-0000-0000-000000000101',
  '80000000-0000-0000-0000-000000000101',
  'Completed',
  current_timestamp - interval '1 day'
);
