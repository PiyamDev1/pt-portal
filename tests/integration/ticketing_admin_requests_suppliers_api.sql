do $$
begin
  if (public.ticketing_schema_status() ->> 'ready')::boolean is not true
    or (public.ticketing_schema_status() ->> 'version')::bigint <> 2026082802
  then
    raise exception 'Ticketing capability 2026082802 is not ready';
  end if;

  if to_regclass('public.ticket_change_requests') is null
    or to_regclass('public.ticket_flight_api_settings') is null
    or to_regclass('public.ticket_flight_api_usage') is null
    or to_regclass('public.ticket_flight_api_sector_state') is null
    or to_regprocedure('public.ticketing_create_quick_tk_supplied(uuid,text,jsonb)') is null
    or to_regprocedure('public.ticketing_request_booking_change(uuid,uuid,text,text)') is null
    or to_regprocedure('public.ticketing_admin_correct_sale_prices(uuid,uuid,bigint,bigint,text,jsonb)') is null
  then
    raise exception 'Ticketing admin/request/supplier/API objects are incomplete';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ticket_bookings'
      and column_name = 'supplier_code'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ticket_bookings'
      and column_name = 'supplier_name'
  ) then
    raise exception 'Ticket supplier snapshot columns are missing';
  end if;

  if has_table_privilege('authenticated', 'public.ticket_change_requests', 'SELECT')
    or has_table_privilege('authenticated', 'public.ticket_flight_api_usage', 'SELECT')
    or has_function_privilege(
      'authenticated',
      'public.ticketing_archive_booking(uuid,uuid,text)',
      'EXECUTE'
    )
  then
    raise exception 'Client roles bypassed the Ticketing server-only boundary';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.ticketing_create_quick_tk_supplied(uuid,text,jsonb)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.ticketing_import_airport_reference_2026082802(jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Service role is missing Ticketing capability execution';
  end if;

  if (select monthly_limit from public.ticket_flight_api_settings where singleton) <> 600
    or (select weekly_interval_days from public.ticket_flight_api_settings where singleton) <> 7
    or (select predeparture_hours from public.ticket_flight_api_settings where singleton) <> 72
  then
    raise exception 'Flight API defaults do not match the operational contract';
  end if;

  if not exists (
    select 1 from public.ticket_bookings where supplier_code = 'unknown' and supplier_name = 'Not recorded'
  ) then
    raise exception 'Pre-capability ticket suppliers were labelled with an invented default';
  end if;
end
$$;
