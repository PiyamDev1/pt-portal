-- Master Admin is the portal's top operational role. Posted Ticketing details
-- may be amended by that role without routing the save through a second audit
-- approval; the existing function still records the actual actor and event.
do $master_admin_completion_override$
declare
  function_definition text;
  guard_pattern constant text :=
    'if\s+booking_row\.payment_status\s+is\s+distinct\s+from\s+transaction_row\.payment_status\s+or\s+transaction_row\.payment_status\s+not\s+in\s+\([^)]*\)\s+then\s+raise\s+exception\s+''Ticket payment state requires an audited correction''\s+using\s+errcode\s+=\s+''55000'',\s+hint\s+=\s+''TICKETING_CORRECTION_REQUIRED'';\s+end\s+if;';
  guard_count integer;
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

  select count(*) into guard_count
  from regexp_matches(function_definition, guard_pattern, 'gs');
  if function_definition is null or guard_count <> 1 then
    raise exception 'Ticketing completion function differs from the reviewed posted-payment guard'
      using errcode = '55000', hint = 'TICKETING_COMPLETION_SCHEMA_DRIFT';
  end if;

  execute regexp_replace(function_definition, guard_pattern, new_guard, 'gs');
end
$master_admin_completion_override$;
