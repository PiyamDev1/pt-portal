-- Integration assertions for Ticketing capability 2026090203.

do $assert_ticketing_admin_date_corrections$
declare
  created jsonb;
  corrected jsonb;
  replayed jsonb;
  booking_id_value uuid;
  transaction_id_value uuid;
  booking_version_value bigint;
  transaction_version_value bigint;
  source_event_version_before integer;
  latest_source_event public.commission_source_events%rowtype;
  transaction_row public.ticket_transactions%rowtype;
  booking_row public.ticket_bookings%rowtype;
begin
  if public.ticketing_schema_status() ->> 'version' <> '2026090203' then
    raise exception 'Ticketing capability 2026090203 is not active';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.ticketing_correct_transaction_dates_2026090203(uuid,uuid,uuid,bigint,bigint,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.ticketing_date_correction_context_matches_2026090203(public.ticket_transactions,public.ticket_transactions)',
    'EXECUTE'
  ) then
    raise exception 'Ticket date correction internals are callable by authenticated clients';
  end if;

  created := public.ticketing_create_quick_tk_commercial(
    '40000000-0000-0000-0000-000000000001',
    'admin-date-correction-fixture-1',
    jsonb_build_object(
      'customerName', 'Date Correction Passenger',
      'pnr', 'DATE-CORR-1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'supplierCode', 'sabre_polani',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-09-01',
      'timeLimitAt', null,
      'issuedAt', '2026-09-02',
      'currency', 'GBP',
      'fares', jsonb_build_array(jsonb_build_object(
        'passengerType', 'ADT',
        'quantity', 1,
        'unitSupplierCost', 100,
        'unitSalePrice', 125,
        'unitDiscount', 0
      )),
      'responsibleEmployeeId', '40000000-0000-0000-0000-000000000001',
      'assistantEmployeeIds', jsonb_build_array(),
      'attributionReason', null,
      'commercialTreatment', 'standard',
      'commissionWaiverReason', null
    )
  );
  booking_id_value := (created #>> '{booking,id}')::uuid;
  transaction_id_value := (created #>> '{transaction,id}')::uuid;
  select version into booking_version_value
  from public.ticket_bookings where id = booking_id_value;
  select version into transaction_version_value
  from public.ticket_transactions where id = transaction_id_value;
  select max(event_version) into source_event_version_before
  from public.commission_source_events
  where source_fact_key = 'transaction:' || transaction_id_value::text || ':issued';

  corrected := public.ticketing_correct_transaction_dates_2026090203(
    '4a000000-0000-0000-0000-000000000001',
    booking_id_value,
    transaction_id_value,
    booking_version_value,
    transaction_version_value,
    'admin-date-correction-1',
    jsonb_build_object(
      'operationalStatus', 'issued',
      'bookingDate', '2026-09-02',
      'timeLimitAt', null,
      'issuedAt', '2026-09-03',
      'reason', 'Airline invoice confirmed the corrected issue date'
    )
  );

  select * into booking_row from public.ticket_bookings where id = booking_id_value;
  select * into transaction_row from public.ticket_transactions where id = transaction_id_value;
  select * into latest_source_event
  from public.commission_source_events
  where source_fact_key = 'transaction:' || transaction_id_value::text || ':issued'
  order by event_version desc limit 1;

  if booking_row.booking_date <> date '2026-09-02'
    or transaction_row.booking_date <> date '2026-09-02'
    or (transaction_row.issued_at at time zone 'Europe/London')::date <> date '2026-09-03'
    or transaction_row.version <> transaction_version_value + 1
    or (corrected ->> 'transactionVersion')::bigint <> transaction_row.version
  then
    raise exception 'The atomic ticket date correction did not update authoritative rows';
  end if;
  if latest_source_event.event_version <> source_event_version_before + 1
    or latest_source_event.effective_on <> date '2026-09-03'
    or (latest_source_event.variables ->> 'booking_date') <> '2026-09-02'
    or (latest_source_event.variables ->> 'issued_at')::timestamptz
      is distinct from transaction_row.issued_at
  then
    raise exception 'Issued-date correction did not supersede the Commission source fact';
  end if;
  if not exists (
    select 1 from public.ticket_audit_events audit
    where audit.transaction_id = transaction_id_value
      and audit.action = 'correct_ticket_dates'
      and audit.actor_employee_id = '4a000000-0000-0000-0000-000000000001'
      and audit.reason = 'Airline invoice confirmed the corrected issue date'
  ) then
    raise exception 'Ticket date correction audit evidence is missing';
  end if;

  replayed := public.ticketing_correct_transaction_dates_2026090203(
    '4a000000-0000-0000-0000-000000000001',
    booking_id_value,
    transaction_id_value,
    booking_version_value,
    transaction_version_value,
    'admin-date-correction-1',
    jsonb_build_object(
      'operationalStatus', 'issued',
      'bookingDate', '2026-09-02',
      'timeLimitAt', null,
      'issuedAt', '2026-09-03',
      'reason', 'Airline invoice confirmed the corrected issue date'
    )
  );
  if replayed ->> 'idempotentReplay' <> 'true' then
    raise exception 'Ticket date correction did not replay idempotently';
  end if;

  begin
    perform public.ticketing_correct_transaction_dates_2026090203(
      '40000000-0000-0000-0000-000000000001',
      booking_id_value,
      transaction_id_value,
      booking_row.version,
      transaction_row.version,
      'agent-date-correction-denied-1',
      jsonb_build_object(
        'operationalStatus', 'issued',
        'bookingDate', '2026-09-02',
        'timeLimitAt', null,
        'issuedAt', '2026-09-04',
        'reason', 'Agent must not correct posted dates'
      )
    );
    raise exception 'Ordinary Ticketing agent corrected posted dates';
  exception when insufficient_privilege then
    null;
  end;
end
$assert_ticketing_admin_date_corrections$;
