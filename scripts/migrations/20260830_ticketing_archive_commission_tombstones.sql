-- Make ledger deletion a complete Commission tombstone for every booking-derived event.
-- Historical rows remain immutable for audit, while their latest Commission facts become zero.

begin;

select pg_advisory_xact_lock(hashtextextended('pt-portal:ticketing-schema-migration', 0));

do $migration_guard$
declare
  installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'ticketing';

  if installed_version is null or installed_version < 2026082904 then
    raise exception 'Ticketing capability 2026082904 is required first'
      using errcode = '55000';
  end if;
  if installed_version > 2026083001 then
    raise exception 'Refusing to replay Ticketing capability 2026083001 over installed capability %',
      installed_version
      using errcode = '55000', hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$migration_guard$;

create or replace function public.ticketing_archive_booking(
  p_actor_employee_id uuid,
  p_booking_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  booking_row public.ticket_bookings%rowtype;
  actor_row record;
  reason_value text := nullif(btrim(p_reason), '');
  source_event_row public.commission_source_events%rowtype;
  correction_count integer := 0;
begin
  if p_actor_employee_id is null or p_booking_id is null
    or length(coalesce(reason_value, '')) > 500
  then
    raise exception 'A valid booking and archive reason are required'
      using errcode = '22023';
  end if;

  select employee.id, employee.is_active,
    regexp_replace(lower(btrim(role.name)), '[_-]+', ' ', 'g') as role_name
  into actor_row
  from public.employees employee
  join public.roles role on role.id = employee.role_id
  where employee.id = p_actor_employee_id
  for share of employee, role;

  if not found or not actor_row.is_active then
    raise exception 'Active employee required' using errcode = '42501';
  end if;

  select booking.* into booking_row
  from public.ticket_bookings booking
  where booking.id = p_booking_id
  for update;

  if not found then
    raise exception 'Ticket booking not found' using errcode = 'P0002';
  end if;
  if booking_row.archived_at is not null then
    return jsonb_build_object(
      'bookingId', p_booking_id,
      'archived', true,
      'commissionCorrections', 0,
      'idempotentReplay', true
    );
  end if;
  if booking_row.owner_employee_id <> p_actor_employee_id
    and actor_row.role_name not in ('admin', 'master admin', 'super admin')
  then
    raise exception 'Only the responsible employee or an administrator may archive this ticket'
      using errcode = '42501';
  end if;

  update public.ticket_bookings
  set archived_at = clock_timestamp(), updated_by = p_actor_employee_id
  where id = p_booking_id
  returning * into booking_row;

  insert into public.ticket_audit_events (
    entity_type, entity_id, booking_id, action, actor_employee_id, reason,
    before_state, after_state
  ) values (
    'booking', p_booking_id, p_booking_id, 'ticket_booking_archived',
    p_actor_employee_id, reason_value,
    jsonb_build_object('archived_at', null),
    jsonb_build_object('archived_at', booking_row.archived_at)
  );

  for source_event_row in
    select distinct on (source_event.source_fact_key) source_event.*
    from public.commission_source_events source_event
    where source_event.source_module = 'ticketing'
      and source_event.event_type <> 'ticket_entry_archived'
      and (
        source_event.source_record_id in (
          select transaction.id
          from public.ticket_transactions transaction
          where transaction.booking_id = p_booking_id
        )
        or source_event.variables ->> 'booking_id' = p_booking_id::text
      )
      and not exists (
        select 1
        from public.commission_source_events newer
        where newer.supersedes_event_id = source_event.source_event_id
      )
    order by source_event.source_fact_key, source_event.event_version desc
  loop
    perform public.append_commission_source_event(jsonb_build_object(
      'source_module', 'ticketing',
      'source_event_id', gen_random_uuid(),
      'source_fact_key', source_event_row.source_fact_key,
      'source_record_id', source_event_row.source_record_id,
      'event_type', 'ticket_entry_archived',
      'contract_version', source_event_row.contract_version,
      'event_version', source_event_row.event_version + 1,
      'supersedes_event_id', source_event_row.source_event_id,
      'employee_id', source_event_row.employee_id,
      'owner_employee_id', source_event_row.owner_employee_id,
      'location_id', source_event_row.location_id,
      'occurred_at', booking_row.archived_at,
      'effective_on', source_event_row.effective_on,
      'source_path', '/ticketing/ledger',
      'variables', source_event_row.variables || jsonb_build_object(
        'booking_id', p_booking_id,
        'archived', true,
        'archive_reason', reason_value,
        'issued_ticket_target_units', 0,
        'assistant_target_units', 0
      ),
      'idempotency_key',
        'archive:v2:' || p_booking_id::text || ':' || source_event_row.id::text
    ));
    correction_count := correction_count + 1;
  end loop;

  return jsonb_build_object(
    'bookingId', p_booking_id,
    'archived', true,
    'commissionCorrections', correction_count,
    'idempotentReplay', false
  );
end
$function$;

revoke all on function public.ticketing_archive_booking(uuid,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.ticketing_archive_booking(uuid,uuid,text) to service_role;

-- Repair bookings archived before every booking-derived event was included in the tombstone.
do $backfill_missing_archive_events$
declare
  source_event_row record;
begin
  for source_event_row in
    select distinct on (source_event.source_fact_key)
      source_event.*,
      booking.id as archived_booking_id,
      booking.archived_at as booking_archived_at
    from public.commission_source_events source_event
    join public.ticket_bookings booking
      on booking.archived_at is not null
     and (
       source_event.source_record_id in (
         select transaction.id
         from public.ticket_transactions transaction
         where transaction.booking_id = booking.id
       )
       or source_event.variables ->> 'booking_id' = booking.id::text
     )
    where source_event.source_module = 'ticketing'
      and source_event.event_type <> 'ticket_entry_archived'
      and not exists (
        select 1
        from public.commission_source_events newer
        where newer.supersedes_event_id = source_event.source_event_id
      )
    order by source_event.source_fact_key, source_event.event_version desc
  loop
    perform public.append_commission_source_event(jsonb_build_object(
      'source_module', 'ticketing',
      'source_event_id', gen_random_uuid(),
      'source_fact_key', source_event_row.source_fact_key,
      'source_record_id', source_event_row.source_record_id,
      'event_type', 'ticket_entry_archived',
      'contract_version', source_event_row.contract_version,
      'event_version', source_event_row.event_version + 1,
      'supersedes_event_id', source_event_row.source_event_id,
      'employee_id', source_event_row.employee_id,
      'owner_employee_id', source_event_row.owner_employee_id,
      'location_id', source_event_row.location_id,
      'occurred_at', source_event_row.booking_archived_at,
      'effective_on', source_event_row.effective_on,
      'source_path', '/ticketing/ledger/backfill',
      'variables', source_event_row.variables || jsonb_build_object(
        'booking_id', source_event_row.archived_booking_id,
        'archived', true,
        'archive_reason', null,
        'issued_ticket_target_units', 0,
        'assistant_target_units', 0
      ),
      'idempotency_key',
        'archive:v2:backfill:' || source_event_row.archived_booking_id::text || ':'
          || source_event_row.id::text
    ));
  end loop;
end
$backfill_missing_archive_events$;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026083001,
  clock_timestamp(),
  coalesce((select details from public.portal_schema_versions where component = 'ticketing'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260830_ticketing_archive_commission_tombstones.sql',
      'capabilities', coalesce((
        select details -> 'capabilities'
        from public.portal_schema_versions
        where component = 'ticketing' and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array(
        'complete-archive-commission-tombstones',
        'archived-fare-adjustment-corrections',
        'archived-commission-backfill'
      )
    )
)
on conflict (component) do update
set version = excluded.version,
    applied_at = excluded.applied_at,
    details = excluded.details
where public.portal_schema_versions.version < excluded.version;

commit;
