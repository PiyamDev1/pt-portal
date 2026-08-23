-- Live-safe response-contract follow-up for Ticketing capability 2026082303.
--
-- Capability 2301 was already deployed before branch-local business dates were
-- made explicit in service RPC results. Preserve those proven RPC bodies as
-- inaccessible cores and expose the original signatures through small wrappers
-- that enrich every fresh, no-op, and idempotent-replay response from stored
-- branch data. This also upgrades response payloads recorded before 2303.

begin;

do $ticketing_forward_guard$
declare
  installed_version bigint;
begin
  if pg_catalog.to_regclass('public.portal_schema_versions') is not null then
    execute
      'select version from public.portal_schema_versions where component = $1'
      into installed_version
      using 'ticketing';
  end if;

  if installed_version > 2026082303 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026082303, installed_version
      using
        errcode = '55000',
        hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$ticketing_forward_guard$;

do $$
begin
  if to_regprocedure(
    'public.ticketing_append_service_transaction_core_2026082303(uuid,uuid,text,jsonb)'
  ) is null then
    if to_regprocedure(
      'public.ticketing_append_service_transaction(uuid,uuid,text,jsonb)'
    ) is null then
      raise exception 'Ticketing service append RPC is unavailable for capability 2026082303'
        using errcode = '55000';
    end if;

    execute 'alter function public.ticketing_append_service_transaction(uuid, uuid, text, jsonb) '
      || 'rename to ticketing_append_service_transaction_core_2026082303';
  end if;

  if to_regprocedure(
    'public.ticketing_mark_service_transaction_paid_core_2026082303(uuid,uuid,uuid,text,jsonb)'
  ) is null then
    if to_regprocedure(
      'public.ticketing_mark_service_transaction_paid(uuid,uuid,uuid,text,jsonb)'
    ) is null then
      raise exception 'Ticketing service payment RPC is unavailable for capability 2026082303'
        using errcode = '55000';
    end if;

    execute 'alter function public.ticketing_mark_service_transaction_paid(uuid, uuid, uuid, text, jsonb) '
      || 'rename to ticketing_mark_service_transaction_paid_core_2026082303';
  end if;
end
$$;

create or replace function public.ticketing_enrich_service_business_dates_2026082303(
  p_booking_id uuid,
  p_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  transaction_id_value uuid;
  booking_date_value date;
  issued_on_value date;
  paid_on_value date;
begin
  if p_booking_id is null
    or jsonb_typeof(p_response) is distinct from 'object'
    or jsonb_typeof(p_response -> 'transaction') is distinct from 'object'
  then
    raise exception 'Ticket service response cannot be verified'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  begin
    transaction_id_value := (p_response #>> '{transaction,id}')::uuid;
  exception when invalid_text_representation then
    raise exception 'Ticket service response cannot be verified'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end;

  select
    transaction.booking_date,
    (transaction.issued_at at time zone location.timezone)::date,
    (transaction.paid_at at time zone location.timezone)::date
  into booking_date_value, issued_on_value, paid_on_value
  from public.ticket_transactions transaction
  join public.ticket_bookings booking on booking.id = transaction.booking_id
  join public.locations location on location.id = booking.location_id
  where transaction.id = transaction_id_value
    and booking.id = p_booking_id
    and transaction.service_type in ('DC', 'R-ER')
    and transaction.operational_status = 'issued'
    and transaction.booking_date is not null
    and transaction.issued_at is not null
    and location.timezone is not null;

  if not found then
    raise exception 'Ticket service response cannot be reconciled to an issued DC/R-ER transaction'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  return jsonb_set(
    p_response,
    '{transaction}',
    (p_response -> 'transaction') || jsonb_build_object(
      'bookingDate', booking_date_value,
      'issuedOn', issued_on_value,
      'paidOn', paid_on_value
    ),
    true
  );
end
$$;

comment on function public.ticketing_enrich_service_business_dates_2026082303(uuid, jsonb) is
  'Internal 2303 response adapter that returns exact booking-branch YYYY-MM-DD business dates for an issued DC/R-ER transaction.';

create or replace function public.ticketing_append_service_transaction(
  p_actor_employee_id uuid,
  p_booking_id uuid,
  p_idempotency_key text,
  p_entry jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
begin
  return public.ticketing_enrich_service_business_dates_2026082303(
    p_booking_id,
    public.ticketing_append_service_transaction_core_2026082303(
      p_actor_employee_id,
      p_booking_id,
      p_idempotency_key,
      p_entry
    )
  );
end
$$;

comment on function public.ticketing_append_service_transaction(uuid, uuid, text, jsonb) is
  'Service-role-only own-record DC/R-ER append RPC with explicit booking-branch bookingDate, issuedOn, and paidOn response facts.';

create or replace function public.ticketing_mark_service_transaction_paid(
  p_actor_employee_id uuid,
  p_booking_id uuid,
  p_transaction_id uuid,
  p_idempotency_key text,
  p_payment jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
begin
  return public.ticketing_enrich_service_business_dates_2026082303(
    p_booking_id,
    public.ticketing_mark_service_transaction_paid_core_2026082303(
      p_actor_employee_id,
      p_booking_id,
      p_transaction_id,
      p_idempotency_key,
      p_payment
    )
  );
end
$$;

comment on function public.ticketing_mark_service_transaction_paid(uuid, uuid, uuid, text, jsonb) is
  'Service-role-only own-record DC/R-ER payment RPC with explicit booking-branch bookingDate, issuedOn, and paidOn response facts.';

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026082303,
  now(),
  jsonb_build_object(
    'migration', '20260823_ticketing_service_response_dates.sql',
    'capabilities', jsonb_build_array(
      'atomic-quick-tk',
      'duplicate-confirmation',
      'automatic-package-match',
      'transaction-owner-alignment',
      'starter-airline-directory',
      'atomic-tk-completion',
      'stable-passenger-slots',
      'optimistic-ticket-versions',
      'ticket-sale-and-payment-events',
      'atomic-dc-rer-entry',
      'root-transaction-lineage',
      'affected-passenger-quantity-guard',
      'target-safe-service-events',
      'service-transaction-payment',
      'rer-monotonic-chronology',
      'serialized-service-lineage',
      'unique-issued-reissue-successor',
      'service-business-date-responses'
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
    'ready', coalesce(version >= 2026082303, false),
    'version', version,
    'requiredVersion', greatest(version, 2026082303),
    'appliedAt', applied_at,
    'details', details
  )
  from public.portal_schema_versions
  where component = 'ticketing'
$$;

revoke all on function public.ticketing_append_service_transaction_core_2026082303(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.ticketing_mark_service_transaction_paid_core_2026082303(uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.ticketing_enrich_service_business_dates_2026082303(uuid, jsonb)
  from public, anon, authenticated, service_role;

revoke all on function public.ticketing_append_service_transaction(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ticketing_append_service_transaction(uuid, uuid, text, jsonb)
  to service_role;

revoke all on function public.ticketing_mark_service_transaction_paid(uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ticketing_mark_service_transaction_paid(uuid, uuid, uuid, text, jsonb)
  to service_role;

revoke all on function public.ticketing_schema_status()
  from public, anon, authenticated;
grant execute on function public.ticketing_schema_status()
  to service_role;

commit;
