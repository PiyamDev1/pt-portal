-- Commission capability 2026090202.
-- Package commission becomes payable three days after return once an agent has
-- double-checked the folder and marked the existing closed lifecycle state as
-- Complete - Checked. Invoice customer release is not a commission condition.

begin;

select pg_advisory_xact_lock(hashtextextended('commission:schema-migration', 0));

do $migration_guard$
declare installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'commission'
  for update;

  if installed_version is null or installed_version < 2026090201 then
    raise exception 'Commission capability 2026090201 is required first'
      using errcode = '55000';
  end if;
  if installed_version > 2026090202 then
    raise exception 'Refusing to replay Commission capability 2026090202 over installed capability %',
      installed_version
      using errcode = '55000', hint = 'COMMISSION_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$migration_guard$;

-- An invoice can remain internal. Only an outstanding balance prevents a
-- reconciled package from becoming authoritative for commission.
do $remove_invoice_release_gate$
declare
  definition text;
  old_fragment text := $old$
        and (invoice.status not in ('paid', 'released') or abs(invoice.balance_due) > 0.009)
$old$;
  new_fragment text := $new$
        and (invoice.balance_due is null or abs(invoice.balance_due) > 0.009)
$new$;
begin
  select pg_get_functiondef(
    'public.commission_package_financial_snapshot_2026083003(uuid)'::regprocedure
  ) into definition;
  if position(new_fragment in definition) = 0 then
    definition := replace(definition, old_fragment, new_fragment);
    if position(new_fragment in definition) = 0 then
      raise exception 'Package invoice release gate could not be upgraded'
        using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
    end if;
    execute definition;
  end if;
end
$remove_invoice_release_gate$;

-- Include the return and payout dates in the immutable package snapshot so a
-- corrected return date emits a superseding source event.
do $add_package_payout_facts$
declare
  definition text;
  old_fragment text := $old$
    'package_type', package_row.package_type,
    'group_id', package_row.group_id,
$old$;
  new_fragment text := $new$
    'package_type', package_row.package_type,
    'return_date', package_row.return_date,
    'commission_payout_date', package_row.return_date + 3,
    'group_id', package_row.group_id,
$new$;
begin
  select pg_get_functiondef(
    'public.commission_package_financial_snapshot_2026083003(uuid)'::regprocedure
  ) into definition;
  if position('commission_payout_date' in definition) = 0 then
    definition := replace(definition, old_fragment, new_fragment);
    if position('commission_payout_date' in definition) = 0 then
      raise exception 'Package payout facts could not be added to the snapshot'
        using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
    end if;
    execute definition;
  end if;
end
$add_package_payout_facts$;

-- The earning belongs to return date + 3 days. Existing historical packages
-- without a return date retain their prior earned/closed fallback.
do $date_package_commission_after_return$
declare
  definition text;
  old_fragment text := $old$
    'effective_on', coalesce(package_row.earned_at, package_row.closed_at, clock_timestamp())::date,
$old$;
  new_fragment text := $new$
    'effective_on', coalesce(
      package_row.return_date + 3,
      package_row.earned_at::date,
      package_row.closed_at::date,
      current_date
    ),
$new$;
begin
  select pg_get_functiondef(
    'public.commission_emit_package_sale_event_2026083003(uuid)'::regprocedure
  ) into definition;
  if position('package_row.return_date + 3' in definition) = 0 then
    definition := replace(definition, old_fragment, new_fragment);
    if position('package_row.return_date + 3' in definition) = 0 then
      raise exception 'Package Commission payout date could not be upgraded'
        using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
    end if;
    execute definition;
  end if;
end
$date_package_commission_after_return$;

-- Future-dated source events remain pending. The normal Commission cron picks
-- them up automatically on the payout date without changing historical data.
do $defer_future_commission_events$
declare
  definition text;
  old_fragment text := $old$
      where source.event_type not in (
$old$;
  new_fragment text := $new$
      where source.effective_on <= current_date
        and source.event_type not in (
$new$;
begin
  select pg_get_functiondef(
    'public.commission_process_shadow_core_2026090201(uuid,integer,text)'::regprocedure
  ) into definition;
  if position('source.effective_on <= current_date' in definition) = 0 then
    definition := replace(definition, old_fragment, new_fragment);
    if position('source.effective_on <= current_date' in definition) = 0 then
      raise exception 'Future Commission event deferral could not be installed'
        using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
    end if;
    execute definition;
  end if;
end
$defer_future_commission_events$;

-- Return-date corrections must refresh the source snapshot and payout date.
drop trigger if exists commission_package_source_package_3003 on public.travel_packages;
create trigger commission_package_source_package_3003
  after insert or update of
    status, return_date, earned_at, closed_at, sales_employee_id,
    sales_responsible_employee_id, location_id, package_type, group_id, payment_status
  on public.travel_packages
  for each row execute function public.commission_capture_package_source_2026083003();

comment on function public.commission_emit_package_sale_event_2026083003(uuid) is
  'Emits a checked package sale with Commission effective three days after return.';

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'commission',
  2026090202,
  clock_timestamp(),
  coalesce((select details from public.portal_schema_versions where component = 'commission'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260902_commission_package_return_payout.sql',
      'mode', 'shadow',
      'capabilities', coalesce((
        select details -> 'capabilities' from public.portal_schema_versions
        where component = 'commission' and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array(
        'package-complete-checked',
        'package-return-plus-three-payout',
        'package-invoice-release-independent'
      )
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
         ? 'package-return-plus-three-payout',
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
    'applicationIntegrationReady', coalesce(version >= 2026083007, false),
    'historicalProfileEditingReady', coalesce(version >= 2026083008, false),
    'ticketingBookingWaiversReady', coalesce(version >= 2026083101, false),
    'accountingReviewReady', coalesce(version >= 2026090201, false),
    'packageReturnPayoutReady', coalesce(version >= 2026090202, false),
    'version', coalesce(version, 0),
    'requiredVersion', 2026090202,
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
