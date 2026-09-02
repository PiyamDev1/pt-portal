-- Integration assertions for Ticketing capability 2026090202.

do $assert_ticketing_maintenance_admin_operations$
declare
  definition text;
begin
  if public.ticketing_schema_status() ->> 'version' <> '2026090202' then
    raise exception 'Ticketing capability 2026090202 is not active';
  end if;

  foreach definition in array array[
    pg_get_functiondef('public.ticketing_create_quick_tk_attributed(uuid,text,jsonb)'::regprocedure),
    pg_get_functiondef('public.ticketing_complete_tk_details_authorized(uuid,uuid,text,jsonb)'::regprocedure),
    pg_get_functiondef('public.ticketing_replace_root_tk_itinerary(uuid,uuid,bigint,text,jsonb,text)'::regprocedure),
    pg_get_functiondef('public.ticketing_correct_booking_attribution_commercial_2026090201(uuid,uuid,bigint,text,jsonb)'::regprocedure)
  ]
  loop
    if position('maintenance admin' in definition) = 0 then
      raise exception 'A Ticketing operational routine is missing Maintenance Admin authority';
    end if;
  end loop;

  definition := pg_get_functiondef(
    'public.ticketing_admin_correct_sale_prices(uuid,uuid,bigint,bigint,text,jsonb)'::regprocedure
  );
  if position('ticketing_actor_can_maintain_2026090202' in definition) = 0 then
    raise exception 'Sale correction does not use Maintenance Admin authority';
  end if;

  definition := pg_get_functiondef(
    'public.ticketing_actor_is_admin_2026082802(uuid)'::regprocedure
  );
  if position('maintenance admin' in definition) > 0 then
    raise exception 'Maintenance Admin was incorrectly granted destructive Admin authority';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.ticketing_actor_can_maintain_2026090202(uuid)',
    'EXECUTE'
  ) then
    raise exception 'Maintenance authority helper is callable by authenticated clients';
  end if;
end
$assert_ticketing_maintenance_admin_operations$;
