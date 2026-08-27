do $ticketing_service_passenger_allocation_assertions$
declare
  capability jsonb;
begin
  select public.ticketing_schema_status() into capability;

  if capability ->> 'version' <> '2026082703'
    or capability ->> 'ready' <> 'true'
  then
    raise exception 'Ticketing passenger-allocation capability is not ready: %', capability;
  end if;

  if not has_function_privilege(
    'service_role',
    'public.ticketing_append_service_transaction_allocated(uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.ticketing_append_service_transaction_allocated(uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Ticketing passenger-allocation RPC grants are incorrect';
  end if;
end
$ticketing_service_passenger_allocation_assertions$;
