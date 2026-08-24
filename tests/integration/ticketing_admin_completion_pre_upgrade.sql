\set ON_ERROR_STOP on

-- Build immutable v1 completion facts before capability 2403 so the migration
-- must append enriched v2 tails instead of relying only on an empty install.
do $$
declare
  created jsonb;
  booking_id_value uuid;
  booking_version_value bigint;
  transaction_version_value bigint;
begin
  created := public.ticketing_create_quick_tk_attributed(
    '4a000000-0000-0000-0000-000000000001',
    'admin-completion-upgrade-create',
    jsonb_build_object(
      'customerName', 'Admin Completion Upgrade',
      'pnr', 'AC-UPG1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-24',
      'timeLimitAt', null,
      'issuedAt', '2026-08-24',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT',
          'quantity', 2,
          'unitSupplierCost', 100
        )
      ),
      'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000002',
      'assistantEmployeeIds', jsonb_build_array(
        '4a000000-0000-0000-0000-000000000003'
      ),
      'attributionReason', 'Upgrade fixture attribution'
    )
  );

  booking_id_value := (created #>> '{booking,id}')::uuid;

  select booking.version, transaction.version
  into booking_version_value, transaction_version_value
  from public.ticket_bookings booking
  join public.ticket_transactions transaction
    on transaction.id = (created #>> '{transaction,id}')::uuid
  where booking.id = booking_id_value;

  perform public.ticketing_complete_tk_details(
    '4a000000-0000-0000-0000-000000000002',
    booking_id_value,
    'admin-completion-upgrade-details',
    jsonb_build_object(
      'expectedBookingVersion', booking_version_value,
      'expectedTransactionVersion', transaction_version_value,
      'contactPhone', '+44 7000 240301',
      'departureDate', '2026-09-15',
      'returnDate', null,
      'paymentStatus', 'paid',
      'paidAt', '2026-08-24',
      'fareSales', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', 140)
      ),
      'passengers', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT',
          'position', 1,
          'fullName', 'Upgrade Passenger One',
          'contactPhone', null,
          'dateOfBirth', null,
          'ticketNumber', 'UPG-001'
        ),
        jsonb_build_object(
          'passengerType', 'ADT',
          'position', 2,
          'fullName', 'Upgrade Passenger Two',
          'contactPhone', null,
          'dateOfBirth', null,
          'ticketNumber', 'UPG-002'
        )
      )
    )
  );

  if (
    select count(*)
    from public.commission_source_events source_event
    join public.ticket_transactions transaction
      on transaction.id = source_event.source_record_id
    where transaction.booking_id = booking_id_value
      and source_event.event_version = 1
      and source_event.source_fact_key in (
        'transaction:' || transaction.id::text || ':sale-completed',
        'transaction:' || transaction.id::text || ':paid'
      )
      and not source_event.variables ? 'primary_responsible_employee_id'
  ) <> 2 then
    raise exception 'Pre-2403 completion source fixtures were unexpectedly enriched';
  end if;
end
$$;
