-- Commission capability 2026083004.
-- Publishes a service-only, pay-free Package handoff status built from the
-- exact authoritative snapshot used by the Commission shadow processor.

begin;

select pg_advisory_xact_lock(hashtextextended('commission:schema-migration', 0));

do $migration_guard$
declare installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'commission'
  for update;

  if installed_version is null or installed_version < 2026083003 then
    raise exception 'Commission capability 2026083003 is required first'
      using errcode = '55000';
  end if;
  if installed_version > 2026083004 then
    raise exception 'Refusing to replay Commission capability 2026083004 over installed capability %',
      installed_version
      using errcode = '55000', hint = 'COMMISSION_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$migration_guard$;

create or replace function public.commission_package_readiness_2026083004(
  p_package_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  package_status_value text;
  snapshot_value jsonb;
  issue_reasons jsonb := '[]'::jsonb;
  latest_event_version integer;
  latest_event_snapshot_hash text;
  latest_processing_status text;
  latest_error text;
  latest_state_updated_at timestamptz;
  state_value text;
begin
  select package_folder.status into package_status_value
  from public.travel_packages package_folder
  where package_folder.id = p_package_id;

  if not found then
    raise exception 'Travel package was not found'
      using errcode = 'P0002';
  end if;

  snapshot_value := public.commission_package_financial_snapshot_2026083003(p_package_id);

  select coalesce(jsonb_agg(reason.value order by reason.ordinality), '[]'::jsonb)
  into issue_reasons
  from jsonb_array_elements_text(
    coalesce(snapshot_value -> 'authority_reasons', '[]'::jsonb)
  ) with ordinality as reason(value, ordinality)
  where package_status_value = 'closed'
     or reason.value not in ('package_not_closed', 'missing_earned_date');

  select
    source_event.event_version,
    source_event.variables ->> 'snapshot_hash',
    event_state.processing_status,
    event_state.last_error,
    event_state.updated_at
  into
    latest_event_version,
    latest_event_snapshot_hash,
    latest_processing_status,
    latest_error,
    latest_state_updated_at
  from public.commission_source_events source_event
  left join public.commission_source_event_states event_state
    on event_state.event_id = source_event.id
  where source_event.source_module = 'packages'
    and source_event.source_fact_key = 'package-sale:' || p_package_id::text
  order by source_event.event_version desc, source_event.created_at desc
  limit 1;

  state_value := case
    when package_status_value = 'closed'
      and latest_processing_status in ('held', 'rejected')
      then latest_processing_status
    when jsonb_array_length(issue_reasons) > 0 then 'needs_attention'
    when package_status_value <> 'closed' then 'ready_to_close'
    when latest_event_version is null then 'awaiting_processing'
    when latest_event_snapshot_hash is distinct from snapshot_value ->> 'snapshot_hash'
      then 'awaiting_processing'
    when latest_processing_status = 'pending' then 'awaiting_processing'
    when latest_processing_status in ('processing', 'processed', 'held', 'rejected')
      then latest_processing_status
    else 'awaiting_processing'
  end;

  return jsonb_build_object(
    'stage', case when package_status_value = 'closed' then 'closed' else 'pre_close' end,
    'state', state_value,
    'handoffReady', jsonb_array_length(issue_reasons) = 0,
    'authoritative', coalesce((snapshot_value ->> 'authoritative')::boolean, false),
    'issues', issue_reasons,
    'passengerCount', coalesce((snapshot_value ->> 'passenger_count')::integer, 0),
    'reservationCount', coalesce((snapshot_value ->> 'reservation_count')::integer, 0),
    'calculationRowCount', coalesce((snapshot_value ->> 'calculation_row_count')::integer, 0),
    'invoiceReferenceRowCount',
      coalesce((snapshot_value ->> 'invoice_reference_row_count')::integer, 0),
    'eventVersion', latest_event_version,
    'eventStatus', latest_processing_status,
    'eventError', latest_error,
    'eventUpdatedAt', latest_state_updated_at,
    'snapshotCurrent', latest_event_version is not null
      and latest_event_snapshot_hash = snapshot_value ->> 'snapshot_hash'
  );
end
$function$;

comment on function public.commission_package_readiness_2026083004(uuid) is
  'Pay-free Package-to-Commission readiness and shadow-processing state for staff Package workflows.';

revoke all on function public.commission_package_readiness_2026083004(uuid)
  from public, anon, authenticated;
grant execute on function public.commission_package_readiness_2026083004(uuid)
  to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'commission',
  2026083004,
  clock_timestamp(),
  coalesce((
    select details from public.portal_schema_versions where component = 'commission'
  ), '{}'::jsonb) || jsonb_build_object(
    'migration', '20260830_commission_package_readiness.sql',
    'mode', 'shadow',
    'capabilities', coalesce((
      select details -> 'capabilities'
      from public.portal_schema_versions
      where component = 'commission' and jsonb_typeof(details -> 'capabilities') = 'array'
    ), '[]'::jsonb) || jsonb_build_array('package-commission-readiness')
  )
)
on conflict (component) do update
set version = excluded.version,
    applied_at = excluded.applied_at,
    details = excluded.details
where public.portal_schema_versions.version < excluded.version
   or (
     public.portal_schema_versions.version = excluded.version
     and not coalesce(
       public.portal_schema_versions.details -> 'capabilities'
         ? 'package-commission-readiness',
       false
     )
   );

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
    'version', coalesce(version, 0),
    'requiredVersion', 2026083004,
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
    where not exists (
      select 1 from public.portal_schema_versions where component = 'commission'
    )
    limit 1
  ) status
$function$;

revoke all on function public.commission_schema_status() from public, anon, authenticated;
grant execute on function public.commission_schema_status() to service_role;

commit;
