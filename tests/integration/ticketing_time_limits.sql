do $ticketing_time_limit_assertions$
declare
  capability jsonb;
  event_constraint text;
begin
  select public.ticketing_schema_status() into capability;

  if capability ->> 'version' <> '2026082702'
    or capability ->> 'ready' <> 'true'
  then
    raise exception 'Ticketing time-limit capability is not ready: %', capability;
  end if;

  if not has_function_privilege(
    'service_role',
    'public.ticketing_claim_time_limit_notifications(timestamptz,integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.ticketing_claim_time_limit_notifications(timestamptz,integer)',
    'EXECUTE'
  ) then
    raise exception 'Ticketing notification claim grants are incorrect';
  end if;

  select pg_get_constraintdef(oid) into event_constraint
  from pg_constraint
  where conrelid = 'public.ticket_notification_events'::regclass
    and conname = 'ticket_notification_events_delivery_status_check';

  if event_constraint not like '%processing%' then
    raise exception 'Ticketing notification processing state is missing';
  end if;
end
$ticketing_time_limit_assertions$;
