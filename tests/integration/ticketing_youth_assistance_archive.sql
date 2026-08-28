\set ON_ERROR_STOP on

do $$
declare
  result jsonb;
  booking_id_value uuid;
  transaction_id_value uuid;
  attribution_row record;
begin
  result := public.ticketing_create_quick_tk_priced(
    '4a000000-0000-0000-0000-000000000002',
    'yth-agent-assistance-1',
    jsonb_build_object(
      'customerName', 'Youth Assisted Passenger',
      'pnr', 'YTHAST1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-28',
      'timeLimitAt', null,
      'issuedAt', '2026-08-28',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'YTH', 'quantity', 1, 'unitSupplierCost', 175,
          'unitSalePrice', 250, 'unitDiscount', 20
        )
      ),
      'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000002',
      'assistantEmployeeIds', jsonb_build_array(
        '4a000000-0000-0000-0000-000000000003'
      ),
      'attributionReason', null
    )
  );
  booking_id_value := (result #>> '{booking,id}')::uuid;
  transaction_id_value := (result #>> '{transaction,id}')::uuid;

  if not exists (
    select 1 from public.ticket_passenger_fare_lines
    where transaction_id = transaction_id_value and passenger_type = 'YTH' and quantity = 1
      and unit_gross_sale_price_source = 250
      and unit_discount_source = 20
      and unit_sale_price_source = 230
  ) then
    raise exception 'YTH fare was not recorded';
  end if;

  select * into attribution_row
  from public.ticket_booking_current_attribution
  where booking_id = booking_id_value;
  if attribution_row.primary_employee_id <>
      '4a000000-0000-0000-0000-000000000002'::uuid
    or attribution_row.assistant_employee_ids <> array[
      '4a000000-0000-0000-0000-000000000003'::uuid
    ]
  then
    raise exception 'Agent-recorded assistance attribution is incorrect';
  end if;

  perform public.ticketing_archive_booking(
    '4a000000-0000-0000-0000-000000000002',
    booking_id_value,
    'Integration test duplicate entry'
  );
  if not exists (
    select 1 from public.ticket_bookings
    where id = booking_id_value and archived_at is not null
  ) then
    raise exception 'Ticket booking was not archived';
  end if;
  if not exists (
    select 1 from public.ticket_audit_events
    where booking_id = booking_id_value and action = 'ticket_booking_archived'
  ) then
    raise exception 'Ticket archive audit event is missing';
  end if;
  if not exists (
    select 1 from public.commission_source_events
    where source_record_id = transaction_id_value
      and event_type = 'ticket_entry_archived'
      and variables ->> 'issued_ticket_target_units' = '0'
      and variables ->> 'assistant_target_units' = '0'
  ) then
    raise exception 'Ticket archive Commission correction is missing';
  end if;
end
$$;

do $$
begin
  if public.ticketing_schema_status() ->> 'ready' <> 'true'
    or (public.ticketing_schema_status() ->> 'version')::bigint <> 2026082801
  then
    raise exception 'Ticketing capability 2026082801 is not ready';
  end if;
end
$$;
