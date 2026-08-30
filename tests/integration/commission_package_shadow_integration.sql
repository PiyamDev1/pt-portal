\set ON_ERROR_STOP on

insert into auth.users (id, email)
values ('42000000-0000-0000-0000-000000000005', 'package-sales@example.test')
on conflict (id) do nothing;

insert into public.employees (id, full_name, email, role_id, location_id)
values (
  '42000000-0000-0000-0000-000000000005',
  'Package Sales Agent',
  'package-sales@example.test',
  '12000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

do $create_package_profile$
declare
  configuration jsonb;
begin
  select profile.configuration into configuration
  from public.employee_commission_profiles profile
  where profile.employee_id = '42000000-0000-0000-0000-000000000002'
    and profile.cancelled_at is null
  order by profile.effective_from desc
  limit 1;

  configuration := jsonb_set(
    configuration,
    '{services,6,components,0}',
    jsonb_build_object(
      'componentType', 'percentage_of_package_profit',
      'sourceVariable', 'package_profit_gbp',
      'recipientRole', 'package_sales',
      'rateValue', 10,
      'eligibleServices', jsonb_build_array('package_sale'),
      'config', jsonb_build_object('serviceCode', 'package_sale', 'payCurrency', 'GBP')
    )
  );

  perform public.commission_create_employee_profile_2026082904(
    '42000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000005',
    'Package sales agreement',
    date_trunc('month', current_date)::date,
    null,
    null,
    configuration,
    'Authoritative package integration test',
    'package-profile-create-0001'
  );
end
$create_package_profile$;

insert into public.travel_packages (
  id, package_reference, package_type, status, sales_employee_id,
  sales_responsible_employee_id, location_id, payment_status, metadata
)
values (
  '60000000-0000-0000-0000-000000000101',
  'PKG-COMMISSION-101',
  'umrah',
  'returned',
  '42000000-0000-0000-0000-000000000005',
  '42000000-0000-0000-0000-000000000005',
  '30000000-0000-0000-0000-000000000001',
  'paid',
  '{"provisionalAgentCommissions":[{"employeeId":"42000000-0000-0000-0000-000000000005","amount":999999}]}'::jsonb
);

insert into public.travel_package_reservations (
  id, package_id, reservation_type, booking_reference, status, currency,
  booked_cost_total, sold_price_total, discount_total, commission_received_total,
  supplier_refund_total, customer_refund_total, metadata
)
values
  (
    '70000000-0000-0000-0000-000000000101',
    '60000000-0000-0000-0000-000000000101',
    'transport', 'GROUP-MAIN', 'confirmed', 'GBP',
    100, 999, 5, 10, 20, 10,
    '{"sharedGroupTransport":true,"physicalReservation":true,"soldPriceOverride":false}'::jsonb
  ),
  (
    '70000000-0000-0000-0000-000000000102',
    '60000000-0000-0000-0000-000000000101',
    'transport', 'FAMILY-ONE', 'confirmed', 'GBP',
    75, 180, 2, 3, 5, 5,
    '{"sharedGroupTransport":true,"billingAllocation":true}'::jsonb
  ),
  (
    '70000000-0000-0000-0000-000000000103',
    '60000000-0000-0000-0000-000000000101',
    'transport', 'FAMILY-TWO', 'confirmed', 'GBP',
    25, 120, 3, 2, 0, 0,
    '{"sharedGroupTransport":true,"billingAllocation":true}'::jsonb
  ),
  (
    '70000000-0000-0000-0000-000000000104',
    '60000000-0000-0000-0000-000000000101',
    'hotel', 'HOTEL-ONE', 'paid', 'GBP',
    200, 400, 10, 20, 30, 20, '{}'::jsonb
  );

insert into public.travel_package_passengers (id, package_id, first_name)
values
  ('71000000-0000-0000-0000-000000000101', '60000000-0000-0000-0000-000000000101', 'One'),
  ('71000000-0000-0000-0000-000000000102', '60000000-0000-0000-0000-000000000101', 'Two'),
  ('71000000-0000-0000-0000-000000000103', '60000000-0000-0000-0000-000000000101', 'Three');

insert into public.travel_package_invoices (
  id, package_id, invoice_number, status, currency, balance_due,
  total_sold, total_booked_cost, received_commission_total
)
values (
  '72000000-0000-0000-0000-000000000101',
  '60000000-0000-0000-0000-000000000101',
  'INV-COMMISSION-101',
  'paid',
  'GBP',
  0,
  680,
  300,
  35
);

do $assert_pre_close_readiness$
declare readiness jsonb;
begin
  readiness := public.commission_package_readiness_2026083004(
    '60000000-0000-0000-0000-000000000101'
  );
  if readiness ->> 'stage' <> 'pre_close'
    or readiness ->> 'state' <> 'ready_to_close'
    or readiness ->> 'handoffReady' <> 'true'
    or jsonb_array_length(readiness -> 'issues') <> 0
  then raise exception 'Complete returned package was not ready for handoff: %', readiness; end if;
  if readiness ? 'packageProfitGbp'
    or readiness ? 'package_profit_gbp'
    or readiness ? 'amountGbp'
    or readiness ? 'payCurrency'
  then raise exception 'Readiness response leaked Commission or Package money: %', readiness; end if;
end
$assert_pre_close_readiness$;

update public.travel_packages
set status = 'closed', earned_at = current_timestamp, closed_at = current_timestamp
where id = '60000000-0000-0000-0000-000000000101';

do $assert_initial_source$
declare source_event public.commission_source_events%rowtype;
declare process_result jsonb;
declare active_amount numeric;
declare readiness jsonb;
begin
  select * into source_event
  from public.commission_source_events event
  where event.source_module = 'packages'
    and event.source_fact_key = 'package-sale:60000000-0000-0000-0000-000000000101';

  if not found or source_event.event_version <> 1 then
    raise exception 'Closing the package did not emit source version 1';
  end if;
  if source_event.variables ->> 'authoritative' <> 'true'
    or (source_event.variables ->> 'package_profit_gbp')::numeric <> 435
    or (source_event.variables ->> 'passenger_count')::integer <> 3
    or (source_event.variables ->> 'calculation_row_count')::integer <> 2
    or (source_event.variables ->> 'invoice_reference_row_count')::integer <> 2
  then
    raise exception 'Package snapshot did not preserve the canonical financial model: %',
      source_event.variables;
  end if;
  if source_event.variables::text like '%999999%'
  then raise exception 'Provisional browser commission metadata leaked into the source event'; end if;

  process_result := public.commission_process_shadow_2026082902(
    '42000000-0000-0000-0000-000000000001',
    50,
    'package-process-initial-0001'
  );
  if (process_result ->> 'processedEvents')::integer < 1 then
    raise exception 'Package source event was not processed: %', process_result;
  end if;

  select entry.amount_gbp into active_amount
  from public.commission_entries entry
  where entry.source_case_key =
      'packages:package-sale:60000000-0000-0000-0000-000000000101'
    and entry.entry_kind = 'ordinary'
    and not exists (
      select 1 from public.commission_entries newer
      where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
    );
  if active_amount <> 43.50 then
    raise exception 'Package profit percentage produced %, expected 43.50', active_amount;
  end if;

  readiness := public.commission_package_readiness_2026083004(
    '60000000-0000-0000-0000-000000000101'
  );
  if readiness ->> 'state' <> 'processed'
    or readiness ->> 'authoritative' <> 'true'
    or (readiness ->> 'passengerCount')::integer <> 3
    or (readiness ->> 'calculationRowCount')::integer <> 2
    or (readiness ->> 'invoiceReferenceRowCount')::integer <> 2
  then raise exception 'Processed Package readiness is wrong: %', readiness; end if;
end
$assert_initial_source$;

update public.travel_package_reservations
set sold_price_total = 200
where id = '70000000-0000-0000-0000-000000000102';

do $assert_correction$
declare source_event public.commission_source_events%rowtype;
declare process_result jsonb;
declare active_amount numeric;
declare active_count integer;
begin
  select * into source_event
  from public.commission_source_events event
  where event.source_module = 'packages'
    and event.source_fact_key = 'package-sale:60000000-0000-0000-0000-000000000101'
  order by event.event_version desc
  limit 1;
  if source_event.event_version <> 2
    or source_event.supersedes_event_id is null
    or (source_event.variables ->> 'package_profit_gbp')::numeric <> 455
  then raise exception 'Package correction lineage or recalculated profit is wrong: %', source_event; end if;

  process_result := public.commission_process_shadow_2026082902(
    '42000000-0000-0000-0000-000000000001',
    50,
    'package-process-correction-0001'
  );

  select count(*), max(entry.amount_gbp)
  into active_count, active_amount
  from public.commission_entries entry
  where entry.source_case_key =
      'packages:package-sale:60000000-0000-0000-0000-000000000101'
    and entry.entry_kind = 'ordinary'
    and not exists (
      select 1 from public.commission_entries newer
      where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
    );
  if active_count <> 1 or active_amount <> 45.50 then
    raise exception 'Corrected package Commission did not leave one active 45.50 entry';
  end if;
  if not exists (
    select 1 from public.commission_entries entry
    where entry.source_case_key =
        'packages:package-sale:60000000-0000-0000-0000-000000000101'
      and entry.amount_gbp = 0
      and entry.explanation ->> 'reason' = 'package_source_corrected'
  ) then raise exception 'Package correction did not retain a zeroing audit revision'; end if;
end
$assert_correction$;

insert into public.travel_packages (
  id, package_reference, status, sales_employee_id, sales_responsible_employee_id,
  location_id, payment_status, earned_at, closed_at
)
values (
  '60000000-0000-0000-0000-000000000102',
  'PKG-COMMISSION-HELD',
  'closed',
  '42000000-0000-0000-0000-000000000005',
  '42000000-0000-0000-0000-000000000005',
  '30000000-0000-0000-0000-000000000001',
  'paid',
  current_timestamp,
  current_timestamp
);

select public.commission_process_shadow_2026082902(
  '42000000-0000-0000-0000-000000000001',
  50,
  'package-process-held-0001'
);

do $assert_held_and_overview$
declare overview jsonb;
declare packages jsonb;
declare readiness jsonb;
begin
  if not exists (
    select 1
    from public.commission_exceptions exception_row
    join public.commission_source_events event on event.id = exception_row.source_event_id
    where event.source_record_id = '60000000-0000-0000-0000-000000000102'
      and exception_row.exception_code = 'package_source_not_authoritative'
      and exception_row.status = 'open'
      and exception_row.details -> 'reasons' ? 'missing_reservations'
      and exception_row.details -> 'reasons' ? 'missing_active_invoice'
  ) then raise exception 'Incomplete closed package did not become an actionable held item'; end if;

  overview := public.commission_source_module_overview_2026083003(
    '42000000-0000-0000-0000-000000000001'
  );
  select value into packages
  from jsonb_array_elements(overview)
  where value ->> 'sourceModule' = 'packages';
  if packages is null
    or (packages ->> 'processedEvents')::integer < 2
    or (packages ->> 'heldEvents')::integer < 1
    or (packages ->> 'activeEntries')::integer < 1
  then raise exception 'Package module overview is incomplete: %', overview; end if;

  readiness := public.commission_package_readiness_2026083004(
    '60000000-0000-0000-0000-000000000102'
  );
  if readiness ->> 'state' <> 'held'
    or readiness ->> 'eventError' <> 'package_source_not_authoritative'
    or not (readiness -> 'issues' ? 'missing_reservations')
    or not (readiness -> 'issues' ? 'missing_active_invoice')
  then raise exception 'Held Package readiness is not actionable: %', readiness; end if;
end
$assert_held_and_overview$;

select 'commission package shadow integration assertions passed' as result;
