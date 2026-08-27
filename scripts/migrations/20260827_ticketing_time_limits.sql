-- Forward-only Ticketing capability 2026082702.
--
-- Adds the atomic due-event/expiry boundary for Held ticket time limits.

begin;

select pg_advisory_xact_lock(hashtextextended('ticketing:schema-migration', 0));

do $ticketing_time_limit_forward_guard$
declare
  installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'ticketing'
  for update;

  if installed_version > 2026082702 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026082702, installed_version
      using errcode = '55000', hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;

  if installed_version is null or installed_version < 2026082701 then
    raise exception 'Ticketing capability 2026082701 is required before time-limit capability 2026082702'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
end
$ticketing_time_limit_forward_guard$;

alter table public.ticket_notification_events
  drop constraint if exists ticket_notification_events_delivery_status_check;

alter table public.ticket_notification_events
  add constraint ticket_notification_events_delivery_status_check
  check (delivery_status in ('pending', 'processing', 'sent', 'failed', 'cancelled'));

alter table public.ticket_notification_events
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_token uuid;

create index if not exists ticket_notification_events_processing_idx
  on public.ticket_notification_events (claimed_at)
  where delivery_status = 'processing';

create or replace function public.ticketing_claim_time_limit_notifications(
  requested_at timestamptz default clock_timestamp(),
  batch_size integer default 100
)
returns table (
  notification_id uuid,
  booking_id uuid,
  threshold_key text,
  scheduled_for timestamptz,
  recipient_employee_id uuid,
  recipient_email text,
  recipient_name text,
  pnr text,
  customer_name text,
  time_limit_at timestamptz,
  time_limit_timezone text,
  claim_token uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  effective_batch integer := least(greatest(coalesce(batch_size, 100), 1), 500);
begin
  insert into public.ticket_notification_events (
    entity_type,
    entity_id,
    booking_id,
    notification_type,
    threshold_key,
    recipient_employee_id,
    scheduled_for
  )
  select
    'booking',
    booking.id,
    booking.id,
    'time_limit',
    threshold.threshold_key,
    booking.owner_employee_id,
    case
      when threshold.threshold_key = 'expiry' then booking.time_limit_at
      else booking.time_limit_at - threshold.offset_value
    end
  from public.ticket_bookings booking
  cross join (values
    ('24h', interval '24 hours'),
    ('6h', interval '6 hours'),
    ('2h', interval '2 hours'),
    ('expiry', interval '0 hours')
  ) as threshold(threshold_key, offset_value)
  where booking.operational_status = 'held'
    and booking.archived_at is null
    and booking.time_limit_at is not null
    and (
      (threshold.threshold_key = 'expiry' and booking.time_limit_at <= requested_at)
      or (threshold.threshold_key <> 'expiry'
        and booking.time_limit_at > requested_at
        and booking.time_limit_at - threshold.offset_value <= requested_at)
    )
  on conflict (entity_type, entity_id, notification_type, threshold_key, recipient_employee_id)
  do nothing;

  update public.ticket_bookings booking
  set operational_status = 'expired',
      updated_at = requested_at,
      version = booking.version + 1
  where booking.operational_status = 'held'
    and booking.archived_at is null
    and booking.time_limit_at <= requested_at;

  update public.ticket_notification_events
  set delivery_status = 'failed',
      error_message = 'Notification claim expired before delivery',
      claimed_at = null,
      claim_token = null
  where delivery_status = 'processing'
    and claimed_at < requested_at - interval '15 minutes';

  return query
  with candidates as (
    select event.id
    from public.ticket_notification_events event
    where event.notification_type = 'time_limit'
      and event.scheduled_for <= requested_at
      and event.delivery_status in ('pending', 'failed')
    order by event.scheduled_for, event.id
    for update skip locked
    limit effective_batch
  ), claimed as (
    update public.ticket_notification_events event
    set delivery_status = 'processing',
        claimed_at = requested_at,
        claim_token = gen_random_uuid()
    from candidates
    where event.id = candidates.id
    returning event.*
  )
  select
    event.id,
    booking.id,
    event.threshold_key,
    event.scheduled_for,
    employee.id,
    employee.email,
    employee.full_name,
    booking.pnr,
    booking.customer_name,
    booking.time_limit_at,
    booking.time_limit_timezone,
    event.claim_token
  from claimed event
  join public.ticket_bookings booking on booking.id = event.booking_id
  join public.employees employee on employee.id = event.recipient_employee_id;
end
$$;

create or replace function public.ticketing_finish_time_limit_notification(
  notification_id_value uuid,
  claim_token_value uuid,
  delivery_status_value text,
  error_message_value text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed_count integer;
begin
  if delivery_status_value not in ('sent', 'failed', 'cancelled') then
    raise exception 'Invalid Ticketing notification delivery status'
      using errcode = '22023';
  end if;

  update public.ticket_notification_events
  set delivery_status = delivery_status_value,
      delivered_at = case when delivery_status_value = 'sent' then clock_timestamp() else null end,
      error_message = case when delivery_status_value = 'failed' then left(error_message_value, 1000) else null end
  where id = notification_id_value
    and claim_token = claim_token_value
    and delivery_status = 'processing';

  get diagnostics changed_count = row_count;
  return changed_count > 0;
end
$$;

revoke all on function public.ticketing_claim_time_limit_notifications(timestamptz, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.ticketing_finish_time_limit_notification(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.ticketing_claim_time_limit_notifications(timestamptz, integer)
  to service_role;
grant execute on function public.ticketing_finish_time_limit_notification(uuid, uuid, text, text)
  to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026082702,
  now(),
  coalesce((select details from public.portal_schema_versions where component = 'ticketing'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260827_ticketing_time_limits.sql',
      'capabilities', coalesce((
        select details -> 'capabilities'
        from public.portal_schema_versions
        where component = 'ticketing'
          and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array(
        'held-ticket-exact-expiry',
        'held-ticket-24-6-2-hour-notifications',
        'ticket-notification-atomic-claims'
      )
    )
)
on conflict (component) do update
set version = excluded.version,
    applied_at = excluded.applied_at,
    details = excluded.details
where public.portal_schema_versions.version < excluded.version;

create or replace function public.ticketing_schema_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'ready',
      coalesce(schema_version.version >= 2026082702, false)
      and to_regprocedure('public.digest(text,text)') is not null
      and exists (
        select 1
        from pg_extension extension_row
        join pg_depend extension_member
          on extension_member.refclassid = 'pg_extension'::regclass
          and extension_member.refobjid = extension_row.oid
          and extension_member.classid = 'pg_proc'::regclass
          and extension_member.deptype = 'e'
        join pg_proc digest_procedure
          on digest_procedure.oid = extension_member.objid
          and digest_procedure.proname = 'digest'
          and digest_procedure.proargtypes = '25 25'::oidvector
        where extension_row.extname = 'pgcrypto'
      )
      and to_regclass('public.ticket_airports') is not null
      and to_regclass('public.ticket_schedule_write_contexts') is not null
      and to_regclass('public.ticket_active_schedule_changes') is not null
      and to_regprocedure(
        'public.ticketing_replace_root_tk_itinerary(uuid,uuid,bigint,text,jsonb,text)'
      ) is not null
      and to_regprocedure(
        'public.ticketing_transition_schedule_change(uuid,uuid,bigint,text,text,uuid,jsonb,text)'
      ) is not null
      and to_regprocedure(
        'public.ticketing_claim_time_limit_notifications(timestamptz,integer)'
      ) is not null
      and to_regprocedure(
        'public.ticketing_finish_time_limit_notification(uuid,uuid,text,text)'
      ) is not null,
    'version', schema_version.version,
    'requiredVersion', greatest(schema_version.version, 2026082702),
    'appliedAt', schema_version.applied_at,
    'details', schema_version.details
  )
  from public.portal_schema_versions schema_version
  where component = 'ticketing'
$$;

revoke all on function public.ticketing_schema_status() from public, anon, authenticated;
grant execute on function public.ticketing_schema_status() to service_role;

commit;