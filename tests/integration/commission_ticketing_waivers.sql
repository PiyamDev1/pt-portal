\set ON_ERROR_STOP on

do $commission_ticketing_waiver_assertions$
declare
  append_result jsonb;
  event_row_id uuid;
  process_result jsonb;
begin
  append_result := public.append_commission_source_event(jsonb_build_object(
    'source_module', 'ticketing',
    'source_event_id', '91900000-0000-0000-0000-000000000001',
    'source_fact_key', 'transaction:99900000-0000-0000-0000-000000000001:issued',
    'source_record_id', '99900000-0000-0000-0000-000000000001',
    'event_type', 'ticket_issued',
    'contract_version', 1,
    'event_version', 1,
    'supersedes_event_id', null,
    'employee_id', '40000000-0000-0000-0000-000000000001',
    'owner_employee_id', '40000000-0000-0000-0000-000000000001',
    'location_id', '30000000-0000-0000-0000-000000000001',
    'occurred_at', '2026-08-31T12:00:00Z',
    'effective_on', '2026-08-31',
    'source_path', '/dashboard/ticketing/ledger',
    'variables', jsonb_build_object(
      'booking_id', '99800000-0000-0000-0000-000000000001',
      'commission_scope', 'ticket',
      'commission_waived', true,
      'commercial_treatment', 'staff_family',
      'issued_ticket_target_units', 0,
      'passenger_ticket_count', 1,
      'sale_price_gbp', 100,
      'supplier_cost_gbp', 100
    ),
    'idempotency_key', 'commission-ticketing-waiver-0001'
  ));
  event_row_id := (append_result ->> 'id')::uuid;

  process_result := public.commission_process_shadow_2026082902(
    '40000000-0000-0000-0000-000000000002',
    100,
    'commission-ticketing-waiver-run-0001'
  );

  if not exists (
    select 1
    from public.commission_source_event_states state
    where state.event_id = event_row_id and state.processing_status = 'processed'
  ) then
    raise exception 'Waived ticketing source event was not marked processed: %', process_result;
  end if;

  if exists (
    select 1 from public.commission_entries entry where entry.source_event_id = event_row_id
  ) then
    raise exception 'Waived ticketing source event created a Commission entry';
  end if;

  if (public.commission_schema_status() ->> 'ticketingBookingWaiversReady')::boolean is not true
    or (public.commission_schema_status() ->> 'version')::bigint <> 2026083101
    or not (
      select details -> 'capabilities' ? 'ticketing-booking-commission-waivers'
      from public.portal_schema_versions where component = 'commission'
    )
  then
    raise exception 'Commission ticketing-waiver capability is not ready';
  end if;
end
$commission_ticketing_waiver_assertions$;
