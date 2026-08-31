-- Forward-only Commission capability 2026083101.
-- Makes a ticket booking's explicit commission waiver authoritative for all
-- ticketing commission events, including Low Fare events.

begin;

select pg_advisory_xact_lock(hashtextextended('commission:schema-migration', 0));

do $commission_ticketing_waiver_guard$
declare
  installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'commission'
  for update;

  if installed_version is null or installed_version < 2026083008 then
    raise exception 'Commission capability 2026083008 is required before ticketing waiver capability 2026083101'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_NOT_READY';
  end if;
  if installed_version > 2026083101 then
    raise exception 'Commission migration capability % cannot run after installed capability %',
      2026083101, installed_version
      using errcode = '55000', hint = 'COMMISSION_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$commission_ticketing_waiver_guard$;

do $upgrade_commission_ticketing_waivers$
declare
  signature constant regprocedure :=
    'public.commission_process_shadow_2026082902(uuid,integer,text)'::regprocedure;
  definition text;
  updated_definition text;
begin
  definition := replace(pg_get_functiondef(signature), E'\r\n', E'\n');

  if definition !~ $pattern$event\.source_module[[:space:]]*=[[:space:]]*'ticketing'[[:space:]]+and[[:space:]]+event\.variables[[:space:]]*->>[[:space:]]*'commission_waived'[[:space:]]*=[[:space:]]*'true'$pattern$
  then
    updated_definition := replace(
      definition,
      $original$      elsif event.event_type in ('ticket_paid') then
        null;
      elsif event.event_type not in ($original$,
      $replacement$      elsif event.event_type in ('ticket_paid') then
        null;
      elsif event.source_module = 'ticketing'
        and event.variables ->> 'commission_waived' = 'true'
      then
        null;
      elsif event.event_type not in ($replacement$
    );
    if updated_definition = definition then
      raise exception 'Commission ticketing-waiver processor upgrade did not match'
        using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
    end if;
    execute updated_definition;
  end if;
end
$upgrade_commission_ticketing_waivers$;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'commission',
  2026083101,
  clock_timestamp(),
  coalesce((select details from public.portal_schema_versions where component = 'commission'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260831_commission_ticketing_waivers.sql',
      'mode', 'shadow',
      'capabilities', coalesce((
        select details -> 'capabilities' from public.portal_schema_versions
        where component = 'commission' and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array('ticketing-booking-commission-waivers')
    )
)
on conflict (component) do update
set version = excluded.version, applied_at = excluded.applied_at, details = excluded.details
where public.portal_schema_versions.version < excluded.version
   or (public.portal_schema_versions.version = excluded.version
       and not coalesce(public.portal_schema_versions.details -> 'capabilities'
         ? 'ticketing-booking-commission-waivers', false));

create or replace function public.commission_schema_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
  select jsonb_build_object(
    'ready', coalesce(version >= 2026082904, false),
    'profileReady', coalesce(version >= 2026083002, false),
    'packageIntegrationReady', coalesce(version >= 2026083003, false),
    'packageReadinessReady', coalesce(version >= 2026083004, false),
    'applicationIntegrationReady', coalesce(version >= 2026083007, false),
    'historicalProfileEditingReady', coalesce(version >= 2026083008, false),
    'ticketingBookingWaiversReady', coalesce(version >= 2026083101, false),
    'version', coalesce(version, 0),
    'requiredVersion', 2026083101,
    'mode', coalesce(details ->> 'mode', 'unavailable'),
    'appliedAt', applied_at,
    'details', coalesce(details, '{}'::jsonb)
  )
  from (
    select schema_version.version, schema_version.applied_at, schema_version.details
    from public.portal_schema_versions schema_version
    where schema_version.component = 'commission'
    union all
    select 0::bigint, null::timestamptz, '{}'::jsonb
    where not exists (select 1 from public.portal_schema_versions where component = 'commission')
    limit 1
  ) status;
$function$;

revoke all on function public.commission_schema_status() from public, anon, authenticated;
grant execute on function public.commission_schema_status() to service_role;

commit;
