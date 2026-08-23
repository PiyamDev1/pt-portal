-- Follow-up guard for already-deployed Ticketing capability 2026082301.
--
-- A later-created R-ER must not be backdated before the ticket transaction it
-- supersedes. Without that chronology rule, ordering future predecessors by
-- issued_at could branch an otherwise linear replacement chain. The booking
-- row lock serializes below-RPC writes, while the partial unique index is the
-- final database backstop against two issued successors for one predecessor.

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

  if installed_version > 2026082302 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026082302, installed_version
      using
        errcode = '55000',
        hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$ticketing_forward_guard$;

do $$
begin
  if exists (
    select 1
    from public.ticket_transactions transaction
    where transaction.service_type = 'R-ER'
      and transaction.operational_status = 'issued'
      and transaction.supersedes_transaction_id is not null
    group by transaction.supersedes_transaction_id
    having count(*) > 1
  ) then
    raise exception 'Existing issued R-ER successor branches must be corrected before chronology guard installation'
      using errcode = '23505';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from public.ticket_transactions child
    left join public.ticket_transactions root
      on root.id = child.parent_transaction_id
      and root.booking_id = child.booking_id
    where child.service_type in ('DC', 'R-ER')
      and child.operational_status = 'issued'
      and (
        root.id is null
        or root.service_type <> 'TK'
        or root.parent_transaction_id is not null
        or root.operational_status <> 'issued'
      )
  ) then
    raise exception 'Existing issued DC/R-ER rows with a non-Issued root TK must be corrected before chronology guard installation'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.ticket_transactions reissue
    join public.ticket_transactions predecessor
      on predecessor.id = reissue.supersedes_transaction_id
      and predecessor.booking_id = reissue.booking_id
    join public.ticket_bookings booking on booking.id = reissue.booking_id
    join public.locations location on location.id = booking.location_id
    cross join lateral (
      select coalesce(
        (
          select source_event.effective_on
          from public.commission_source_events source_event
          where source_event.source_module = 'ticketing'
            and source_event.source_fact_key =
              'transaction:' || predecessor.id::text || ':issued'
          order by source_event.event_version desc
          limit 1
        ),
        (predecessor.issued_at at time zone location.timezone)::date
      ) as issue_date
    ) predecessor_business_date
    where reissue.service_type = 'R-ER'
      and reissue.operational_status = 'issued'
      and (
        predecessor_business_date.issue_date is null
        or reissue.booking_date < predecessor_business_date.issue_date
        or (reissue.issued_at at time zone location.timezone)::date
          < predecessor_business_date.issue_date
      )
  ) then
    raise exception 'Existing backdated R-ER predecessor chronology must be corrected before chronology guard installation'
      using errcode = '23514';
  end if;
end
$$;

create unique index if not exists ticket_transactions_one_issued_rer_successor_idx
  on public.ticket_transactions (supersedes_transaction_id)
  where service_type = 'R-ER'
    and operational_status = 'issued'
    and supersedes_transaction_id is not null;

create or replace function public.validate_ticket_service_transaction_lineage()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  parent_row public.ticket_transactions%rowtype;
  superseded_row public.ticket_transactions%rowtype;
  expected_superseded_id uuid;
  predecessor_issue_business_date date;
  booking_timezone text;
  must_validate_tail boolean;
begin
  if new.service_type not in ('DC', 'R-ER') then
    return new;
  end if;

  -- Match the RPC lock order: booking first, then transaction lineage. This is
  -- re-entrant for RPC calls and serializes direct owner-level writes.
  select location.timezone
  into booking_timezone
  from public.ticket_bookings booking
  join public.locations location on location.id = booking.location_id
  where booking.id = new.booking_id
  for update of booking;

  if not found or booking_timezone is null then
    raise exception 'DC/R-ER booking branch is unavailable'
      using errcode = '23514';
  end if;

  select transaction.*
  into parent_row
  from public.ticket_transactions transaction
  where transaction.id = new.parent_transaction_id
    and transaction.booking_id = new.booking_id
  for share;

  if not found
    or parent_row.service_type <> 'TK'
    or parent_row.parent_transaction_id is not null
  then
    raise exception 'DC/R-ER parent must be the root TK transaction'
      using errcode = '23514';
  end if;

  if new.operational_status = 'issued'
    and parent_row.operational_status <> 'issued'
  then
    raise exception 'Issued DC/R-ER transactions require an Issued root TK'
      using errcode = '23514';
  end if;

  if new.service_type = 'DC' then
    if new.supersedes_transaction_id is not null then
      raise exception 'DC transactions cannot supersede a ticket transaction'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.supersedes_transaction_id is null then
    raise exception 'R-ER transactions must identify the ticket transaction they supersede'
      using errcode = '23514';
  end if;

  select transaction.*
  into superseded_row
  from public.ticket_transactions transaction
  where transaction.id = new.supersedes_transaction_id
    and transaction.booking_id = new.booking_id
  for share;

  if not found
    or not (
      (
        superseded_row.id = parent_row.id
        and superseded_row.service_type = 'TK'
        and superseded_row.parent_transaction_id is null
      )
      or (
        superseded_row.service_type = 'R-ER'
        and superseded_row.operational_status = 'issued'
      )
    )
  then
    raise exception 'R-ER can supersede only the root TK or an issued R-ER in the same booking'
      using errcode = '23514';
  end if;

  must_validate_tail := tg_op = 'INSERT'
    or old.booking_id is distinct from new.booking_id
    or old.parent_transaction_id is distinct from new.parent_transaction_id
    or old.supersedes_transaction_id is distinct from new.supersedes_transaction_id
    or old.service_type is distinct from new.service_type
    or (old.operational_status <> 'issued' and new.operational_status = 'issued');

  if must_validate_tail then
    -- Find the actual unsuperseded issued tail, not merely the maximum date.
    -- The order is a deterministic corruption backstop; a valid chain has one.
    select candidate.id
    into expected_superseded_id
    from public.ticket_transactions candidate
    where candidate.booking_id = new.booking_id
      and candidate.id <> new.id
      and candidate.service_type = 'R-ER'
      and candidate.operational_status = 'issued'
      and not exists (
        select 1
        from public.ticket_transactions successor
        where successor.booking_id = candidate.booking_id
          and successor.id <> new.id
          and successor.service_type = 'R-ER'
          and successor.operational_status = 'issued'
          and successor.supersedes_transaction_id = candidate.id
      )
    order by candidate.issued_at desc, candidate.created_at desc, candidate.id desc
    limit 1;

    expected_superseded_id := coalesce(expected_superseded_id, parent_row.id);
    if new.supersedes_transaction_id <> expected_superseded_id then
      raise exception 'R-ER must supersede the current issued replacement-chain tail'
        using errcode = '23514';
    end if;
  end if;

  select source_event.effective_on
  into predecessor_issue_business_date
  from public.commission_source_events source_event
  where source_event.source_module = 'ticketing'
    and source_event.source_fact_key =
      'transaction:' || superseded_row.id::text || ':issued'
  order by source_event.event_version desc
  limit 1;

  predecessor_issue_business_date := coalesce(
    predecessor_issue_business_date,
    (superseded_row.issued_at at time zone booking_timezone)::date
  );

  if predecessor_issue_business_date is null then
    raise exception 'R-ER predecessor issue date is unavailable'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  if new.booking_date < predecessor_issue_business_date
    or (
      new.issued_at is not null
      and (new.issued_at at time zone booking_timezone)::date
        < predecessor_issue_business_date
    )
  then
    raise exception 'R-ER booking and issue dates cannot predate the superseded ticket issue date'
      using
        errcode = '22023',
        hint = 'TICKETING_REISSUE_DATE_BEFORE_PREDECESSOR';
  end if;

  return new;
end
$$;

comment on function public.validate_ticket_service_transaction_lineage() is
  'Serializes DC/R-ER lineage by booking, requires an Issued root before posting, enforces a linear R-ER tail, and prevents backdating before the predecessor issue business date.';

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026082302,
  now(),
  jsonb_build_object(
    'migration', '20260823_ticketing_rer_chronology_guard.sql',
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
      'unique-issued-reissue-successor'
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
    'ready', coalesce(version >= 2026082302, false),
    'version', version,
    'requiredVersion', greatest(version, 2026082302),
    'appliedAt', applied_at,
    'details', details
  )
  from public.portal_schema_versions
  where component = 'ticketing'
$$;

revoke all on function public.validate_ticket_service_transaction_lineage()
  from public, anon, authenticated;
grant execute on function public.validate_ticket_service_transaction_lineage()
  to service_role;

revoke all on function public.ticketing_schema_status()
  from public, anon, authenticated;
grant execute on function public.ticketing_schema_status()
  to service_role;

commit;
