-- Integration assertions for the forward-only Ticketing capability 2026090204
-- replacement of the capability 2026090203 date-correction RPC.

do $assert_ticketing_date_correction_hardening$
declare
  actor_id_value constant uuid := '4a000000-0000-0000-0000-000000000001';
  created jsonb;
  corrected jsonb;
  booking_id_value uuid;
  transaction_id_value uuid;
  booking_version_value bigint;
  transaction_version_value bigint;
  original_role_id uuid;
  manager_role_id uuid;
begin
  if public.ticketing_schema_status() ->> 'version' <> '2026090204' then
    raise exception 'Ticketing capability 2026090204 is not active for date hardening';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.ticketing_correct_transaction_dates_2026090203(uuid,uuid,uuid,bigint,bigint,text,jsonb)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.ticketing_correct_transaction_dates_2026090203(uuid,uuid,uuid,bigint,bigint,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Hardened date-correction RPC privileges are invalid';
  end if;

  select booking.id, transaction.id
  into booking_id_value, transaction_id_value
  from public.ticket_bookings booking
  join public.ticket_transactions transaction on transaction.booking_id = booking.id
  where booking.pnr = 'DATE-CORR-1'
    and transaction.service_type = 'TK'
    and transaction.parent_transaction_id is null
  order by transaction.created_at desc
  limit 1;
  if booking_id_value is null or transaction_id_value is null then
    raise exception 'Capability 2026090203 date-correction fixture is missing';
  end if;

  select role_id into original_role_id from public.employees where id = actor_id_value;
  select id into manager_role_id from public.roles
  where regexp_replace(lower(btrim(name)), '[_-]+', ' ', 'g') = 'manager'
  order by id limit 1;
  if original_role_id is null or manager_role_id is null then
    raise exception 'Date-correction authorization fixtures are missing';
  end if;

  -- A successful retry must still authorize the actor before replaying the
  -- historical response.
  update public.employees set is_active = false where id = actor_id_value;
  begin
    perform public.ticketing_correct_transaction_dates_2026090203(
      actor_id_value, booking_id_value, transaction_id_value, 1, 1,
      'admin-date-correction-1',
      jsonb_build_object(
        'operationalStatus', 'issued',
        'bookingDate', '2026-09-02',
        'timeLimitAt', null,
        'issuedAt', '2026-09-03',
        'reason', 'Airline invoice confirmed the corrected issue date'
      )
    );
    raise exception 'Inactive record manager replayed a privileged date correction';
  exception when insufficient_privilege then
    null;
  end;
  update public.employees set is_active = true where id = actor_id_value;

  update public.employees set role_id = manager_role_id where id = actor_id_value;
  begin
    perform public.ticketing_correct_transaction_dates_2026090203(
      actor_id_value, booking_id_value, transaction_id_value, 1, 1,
      'admin-date-correction-1',
      jsonb_build_object(
        'operationalStatus', 'issued',
        'bookingDate', '2026-09-02',
        'timeLimitAt', null,
        'issuedAt', '2026-09-03',
        'reason', 'Airline invoice confirmed the corrected issue date'
      )
    );
    raise exception 'Demoted record manager replayed a privileged date correction';
  exception when insufficient_privilege then
    null;
  end;
  update public.employees set role_id = original_role_id where id = actor_id_value;

  -- Privileged callers cannot bypass the application schema with JSON nulls or
  -- values of the wrong JSON type.
  begin
    perform public.ticketing_correct_transaction_dates_2026090203(
      actor_id_value, booking_id_value, transaction_id_value, 1, 1,
      'malformed-date-correction-null-status',
      jsonb_build_object(
        'operationalStatus', null,
        'bookingDate', '2026-09-02',
        'timeLimitAt', null,
        'issuedAt', '2026-09-04',
        'reason', 'Must fail before mutation'
      )
    );
    raise exception 'Null operational status reached the date-correction mutation';
  exception when invalid_parameter_value then
    null;
  end;
  begin
    perform public.ticketing_correct_transaction_dates_2026090203(
      actor_id_value, booking_id_value, transaction_id_value, 1, 1,
      'malformed-date-correction-object-reason',
      jsonb_build_object(
        'operationalStatus', 'issued',
        'bookingDate', '2026-09-02',
        'timeLimitAt', null,
        'issuedAt', '2026-09-04',
        'reason', jsonb_build_object('text', 'Must fail')
      )
    );
    raise exception 'Non-string reason reached the date-correction mutation';
  exception when invalid_parameter_value then
    null;
  end;

  -- Posted transaction dates remain immutable without the private, exact RPC
  -- context.
  begin
    update public.ticket_transactions
    set issued_at = issued_at + interval '1 day'
    where id = transaction_id_value;
    raise exception 'A direct posted-date update bypassed immutable history';
  exception when object_not_in_prerequisite_state then
    null;
  end;

  created := public.ticketing_create_quick_tk_commercial(
    '40000000-0000-0000-0000-000000000001',
    'date-hardening-held-fixture-1',
    jsonb_build_object(
      'customerName', 'Date Hardening Held Passenger',
      'pnr', 'DATE-HARD-HELD-1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'supplierCode', 'sabre_polani',
      'serviceType', 'TK',
      'operationalStatus', 'held',
      'bookingDate', '2026-03-20',
      'timeLimitAt', '2026-03-28T12:00',
      'issuedAt', null,
      'currency', 'GBP',
      'fares', jsonb_build_array(jsonb_build_object(
        'passengerType', 'ADT', 'quantity', 1,
        'unitSupplierCost', 100, 'unitSalePrice', null, 'unitDiscount', null
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
  select version into booking_version_value from public.ticket_bookings
  where id = booking_id_value;
  select version into transaction_version_value from public.ticket_transactions
  where id = transaction_id_value;

  begin
    perform public.ticketing_correct_transaction_dates_2026090203(
      actor_id_value, booking_id_value, transaction_id_value,
      booking_version_value, transaction_version_value,
      'date-hardening-nonexistent-dst-1',
      jsonb_build_object(
        'operationalStatus', 'held', 'bookingDate', '2026-03-20',
        'timeLimitAt', '2026-03-29T01:30', 'issuedAt', null,
        'reason', 'Nonexistent London deadline must fail'
      )
    );
    raise exception 'A nonexistent branch-local deadline was accepted';
  exception when invalid_datetime_format then
    null;
  end;

  begin
    perform public.ticketing_correct_transaction_dates_2026090203(
      actor_id_value, booking_id_value, transaction_id_value,
      booking_version_value, transaction_version_value,
      'date-hardening-ambiguous-dst-1',
      jsonb_build_object(
        'operationalStatus', 'held', 'bookingDate', '2026-03-20',
        'timeLimitAt', '2026-10-25T01:30', 'issuedAt', null,
        'reason', 'Ambiguous London deadline must fail'
      )
    );
    raise exception 'An ambiguous branch-local deadline was accepted';
  exception when invalid_datetime_format then
    null;
  end;

  corrected := public.ticketing_correct_transaction_dates_2026090203(
    actor_id_value, booking_id_value, transaction_id_value,
    booking_version_value, transaction_version_value,
    'date-hardening-held-success-1',
    jsonb_build_object(
      'operationalStatus', 'held', 'bookingDate', '2026-03-21',
      'timeLimitAt', '2026-03-28T13:00', 'issuedAt', null,
      'reason', 'Airline supplied a unique corrected London deadline'
    )
  );
  if corrected ->> 'timeLimitAt' <> '2026-03-28T13:00' then
    raise exception 'A unique held deadline was not corrected';
  end if;

  -- Model a real pre-issuance cancellation. No issued source fact exists, so
  -- the correction must preserve deadline semantics rather than require one.
  update public.ticket_transactions
  set operational_status = 'cancelled', cancelled_at = clock_timestamp()
  where id = transaction_id_value;
  update public.ticket_bookings
  set operational_status = 'cancelled'
  where id = booking_id_value;
  select version into booking_version_value from public.ticket_bookings
  where id = booking_id_value;
  select version into transaction_version_value from public.ticket_transactions
  where id = transaction_id_value;

  corrected := public.ticketing_correct_transaction_dates_2026090203(
    actor_id_value, booking_id_value, transaction_id_value,
    booking_version_value, transaction_version_value,
    'date-hardening-cancelled-before-issue-1',
    jsonb_build_object(
      'operationalStatus', 'cancelled', 'bookingDate', '2026-03-22',
      'timeLimitAt', '2026-03-28T14:00', 'issuedAt', null,
      'reason', 'Correct the deadline retained on the cancelled booking'
    )
  );
  if corrected ->> 'timeLimitAt' <> '2026-03-28T14:00'
    or corrected -> 'issuedAt' <> 'null'::jsonb
  then
    raise exception 'Pre-issuance cancelled deadline correction failed';
  end if;
end
$assert_ticketing_date_correction_hardening$;
