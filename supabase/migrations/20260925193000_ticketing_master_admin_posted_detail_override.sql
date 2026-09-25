-- Master Admin is the portal's top operational role. Posted Ticketing details
-- may be amended by that role without routing the save through a second audit
-- approval; the existing function still records the actual actor and event.
do $master_admin_completion_override$
declare
  function_definition text;
  old_guard constant text := $guard$
  if booking_row.payment_status is distinct from transaction_row.payment_status
    or transaction_row.payment_status not in ('unpaid', 'paid')
  then
    raise exception 'Ticket payment state requires an audited correction'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;
$guard$;
  new_guard constant text := $guard$
  if (
    booking_row.payment_status is distinct from transaction_row.payment_status
    or transaction_row.payment_status not in ('unpaid', 'paid')
  ) and actor_role_name not in ('master admin', 'super admin') then
    raise exception 'Ticket payment state requires an audited correction'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;
$guard$;
begin
  select pg_get_functiondef(
    'public.ticketing_complete_tk_details_authorized(uuid,uuid,text,jsonb)'::regprocedure
  ) into function_definition;

  if function_definition is null
    or position(old_guard in function_definition) = 0
    or position(old_guard in replace(function_definition, old_guard, '')) > 0
  then
    raise exception 'Ticketing completion function differs from the reviewed posted-payment guard'
      using errcode = '55000', hint = 'TICKETING_COMPLETION_SCHEMA_DRIFT';
  end if;

  execute replace(function_definition, old_guard, new_guard);
end
$master_admin_completion_override$;
