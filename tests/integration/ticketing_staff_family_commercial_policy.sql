\set ON_ERROR_STOP on

do $staff_family_pricing_assertions$
declare
  actor_id constant uuid := '40000000-0000-0000-0000-000000000001';
  airline_id constant uuid := '50000000-0000-0000-0000-000000000001';
  quick_result jsonb;
  adjustment_result jsonb;
  booking_id_value uuid;
  transaction_id_value uuid;
  booking_version_value bigint;
  transaction_version_value bigint;
  issued_variables jsonb;
  adjustment_variables jsonb;
begin
  quick_result := public.ticketing_create_quick_tk_commercial(
    actor_id,
    'staff-family-final-price-79',
    jsonb_build_object(
      'customerName', 'Staff Family Passenger',
      'pnr', 'FAMILY79',
      'airlineId', airline_id,
      'supplierCode', 'sabre_polani',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-31',
      'timeLimitAt', null,
      'issuedAt', '2026-08-31',
      'currency', 'GBP',
      'commercialTreatment', 'staff_family',
      'commissionWaiverReason', 'Father - staff family concession',
      'fares', jsonb_build_array(jsonb_build_object(
        'passengerType', 'ADT',
        'quantity', 1,
        'unitSupplierCost', 100,
        'unitSalePrice', 100,
        'unitDiscount', 0
      ))
    )
  );

  if quick_result ->> 'commercialTreatment' <> 'staff_family'
    or quick_result ->> 'commissionWaived' <> 'true'
  then
    raise exception 'Staff/family quick entry did not preserve its commercial treatment';
  end if;

  booking_id_value := (quick_result #>> '{booking,id}')::uuid;
  transaction_id_value := (quick_result #>> '{transaction,id}')::uuid;

  select booking.version, transaction.version
  into booking_version_value, transaction_version_value
  from public.ticket_bookings booking
  join public.ticket_transactions transaction
    on transaction.id = transaction_id_value and transaction.booking_id = booking.id
  where booking.id = booking_id_value;

  adjustment_result := public.ticketing_append_fare_adjustment_commercial(
    actor_id,
    booking_id_value,
    'staff-family-lower-fare-79',
    jsonb_build_object(
      'expectedBookingVersion', booking_version_value,
      'expectedRootTransactionVersion', transaction_version_value,
      'expectedPreviousAdjustmentId', null,
      'newFareGbp', 70,
      'effectiveOn', '2026-08-31',
      'currency', 'GBP',
      'notes', 'Confirmed staff family repricing example'
    )
  );

  if adjustment_result ->> 'commercialTreatment' <> 'staff_family'
    or (adjustment_result #>> '{staffFamilyReprice,companyFeePercent}')::numeric <> 30
    or (adjustment_result #>> '{staffFamilyReprice,supplierDifferenceGbp}')::numeric <> 30
    or (adjustment_result #>> '{staffFamilyReprice,companyFeeGbp}')::numeric <> 9
    or (adjustment_result #>> '{staffFamilyReprice,customerCreditGbp}')::numeric <> 21
    or (adjustment_result #>> '{staffFamilyReprice,customerPriceBeforeGbp}')::numeric <> 100
    or (adjustment_result #>> '{staffFamilyReprice,customerPriceAfterGbp}')::numeric <> 79
  then
    raise exception 'Staff/family £100 -> £70 Low Fare did not produce the £79 final price';
  end if;

  select source_event.variables into issued_variables
  from public.commission_source_events source_event
  where source_event.source_fact_key = 'transaction:' || transaction_id_value::text || ':issued'
  order by source_event.event_version desc
  limit 1;

  select source_event.variables into adjustment_variables
  from public.commission_source_events source_event
  where source_event.source_record_id =
    (adjustment_result #>> '{adjustment,id}')::uuid
  order by source_event.event_version desc
  limit 1;

  if issued_variables ->> 'commission_waived' <> 'true'
    or (issued_variables ->> 'issued_ticket_target_units')::integer <> 1
    or adjustment_variables ->> 'commission_waived' <> 'true'
    or (adjustment_variables ->> 'staff_family_customer_price_after_gbp')::numeric <> 79
  then
    raise exception 'Staff/family source events did not carry the zero-commission £79 facts';
  end if;
end
$staff_family_pricing_assertions$;

do $staff_family_at_cost_assertion$
declare
  rejected boolean := false;
begin
  begin
    perform public.ticketing_create_quick_tk_commercial(
      '40000000-0000-0000-0000-000000000001',
      'staff-family-not-at-cost',
      jsonb_build_object(
        'customerName', 'Invalid Staff Family Price',
        'pnr', 'FAMILYBAD',
        'airlineId', '50000000-0000-0000-0000-000000000001',
        'supplierCode', 'sabre_polani',
        'serviceType', 'TK',
        'operationalStatus', 'issued',
        'bookingDate', '2026-08-31',
        'timeLimitAt', null,
        'issuedAt', '2026-08-31',
        'currency', 'GBP',
        'commercialTreatment', 'staff_family',
        'commissionWaiverReason', 'Invalid at-cost test',
        'fares', jsonb_build_array(jsonb_build_object(
          'passengerType', 'ADT',
          'quantity', 1,
          'unitSupplierCost', 100,
          'unitSalePrice', 110,
          'unitDiscount', 0
        ))
      )
    );
  exception
    when check_violation then
      rejected := true;
  end;

  if not rejected then
    raise exception 'A staff/family ticket above supplier cost was accepted';
  end if;
end
$staff_family_at_cost_assertion$;

select case
  when (select version from public.portal_schema_versions where component = 'ticketing') = 2026083102
    and to_regprocedure('public.ticketing_create_quick_tk_commercial(uuid,text,jsonb)') is not null
    and to_regprocedure(
      'public.ticketing_append_fare_adjustment_commercial(uuid,uuid,text,jsonb)'
    ) is not null
    and (
      select details -> 'capabilities' ? 'staff-family-low-fare-repricing'
      from public.portal_schema_versions where component = 'ticketing'
    )
  then true
  else false
end as staff_family_capability_ready;
