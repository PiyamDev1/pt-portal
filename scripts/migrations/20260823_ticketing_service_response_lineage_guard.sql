-- Forward-only Ticketing capability 2026082304.
--
-- 1. Service RPC replays must repeat the business dates captured by the
--    original response. A later payment, cancellation, or refund must not make
--    an old append/payment response drift or become unreadable.
-- 2. An R-ER remains part of replacement lineage after leaving Issued for a
--    terminal posted lifecycle. Otherwise its predecessor can incorrectly look
--    unsuperseded and accept a second historical branch.

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

  if installed_version > 2026082304 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026082304, installed_version
      using
        errcode = '55000',
        hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$ticketing_forward_guard$;

create or replace function public.ticketing_transaction_has_been_issued_2026082304(
  p_operational_status text,
  p_issued_at timestamptz
)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog, public, pg_temp
as $$
  select p_issued_at is not null
    and p_operational_status in ('issued', 'cancelled', 'part_refunded', 'refunded')
$$;

comment on function public.ticketing_transaction_has_been_issued_2026082304(text, timestamptz) is
  'Capability 2304 lineage predicate: a posted transaction remains historically issued throughout terminal lifecycle states.';

do $$
begin
  if exists (
    select 1
    from public.ticket_idempotency_keys key_row
    where (key_row.response_payload is null) <> (key_row.completed_at is null)
  ) then
    raise exception 'Inconsistent Ticketing idempotency completion rows must be corrected before capability 2026082304 installation'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.ticket_idempotency_keys'::regclass
      and constraint_row.conname = 'ticket_idempotency_keys_completion_pair_check'
  ) then
    alter table public.ticket_idempotency_keys
      add constraint ticket_idempotency_keys_completion_pair_check
      check ((response_payload is null) = (completed_at is null));
  end if;
end
$$;

create or replace function public.protect_completed_ticket_idempotency_2026082304()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  table_owner name;
begin
  select pg_catalog.pg_get_userbyid(class_row.relowner)
  into table_owner
  from pg_catalog.pg_class class_row
  where class_row.oid = tg_relid;

  -- Database-owner maintenance remains available for an explicit repair. App
  -- roles cannot rewrite or delete a response after it becomes replayable.
  if current_user = table_owner then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if old.response_payload is not null or old.completed_at is not null then
    raise exception 'Completed Ticketing idempotency responses are immutable'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end
$$;

drop trigger if exists ticket_idempotency_keys_protect_completed_2304
  on public.ticket_idempotency_keys;
create trigger ticket_idempotency_keys_protect_completed_2304
  before update or delete on public.ticket_idempotency_keys
  for each row execute function public.protect_completed_ticket_idempotency_2026082304();

comment on function public.protect_completed_ticket_idempotency_2026082304() is
  'Blocks application-role mutation or deletion of completed Ticketing idempotency request/response facts while retaining database-owner repair access.';

drop policy if exists "Service role manages ticket_idempotency_keys"
  on public.ticket_idempotency_keys;
drop policy if exists "Service role reads ticket_idempotency_keys"
  on public.ticket_idempotency_keys;
create policy "Service role reads ticket_idempotency_keys"
  on public.ticket_idempotency_keys
  for select
  to service_role
  using (true);

revoke insert, update, delete on table public.ticket_idempotency_keys
  from service_role;
grant select on table public.ticket_idempotency_keys
  to service_role;

-- Refuse to install the wider successor backstop over already-branched history.
do $$
begin
  if exists (
    select 1
    from public.ticket_transactions transaction
    where transaction.service_type = 'R-ER'
      and public.ticketing_transaction_has_been_issued_2026082304(
        transaction.operational_status,
        transaction.issued_at
      )
      and transaction.supersedes_transaction_id is not null
    group by transaction.supersedes_transaction_id
    having count(*) > 1
  ) then
    raise exception 'Existing historically issued R-ER successor branches must be corrected before capability 2026082304 installation'
      using errcode = '23505';
  end if;
end
$$;

-- The old guard examined only currently-Issued children. Recheck every posted
-- lifecycle row before replacing it with the historical issuance predicate.
do $$
begin
  if exists (
    select 1
    from public.ticket_transactions child
    left join public.ticket_transactions root
      on root.id = child.parent_transaction_id
      and root.booking_id = child.booking_id
    where child.service_type in ('DC', 'R-ER')
      and public.ticketing_transaction_has_been_issued_2026082304(
        child.operational_status,
        child.issued_at
      )
      and (
        root.id is null
        or root.service_type <> 'TK'
        or root.parent_transaction_id is not null
        or not public.ticketing_transaction_has_been_issued_2026082304(
          root.operational_status,
          root.issued_at
        )
      )
  ) then
    raise exception 'Existing posted DC/R-ER rows with a never-issued root TK must be corrected before capability 2026082304 installation'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.ticket_transactions reissue
    left join public.ticket_transactions predecessor
      on predecessor.id = reissue.supersedes_transaction_id
      and predecessor.booking_id = reissue.booking_id
    where reissue.service_type = 'R-ER'
      and public.ticketing_transaction_has_been_issued_2026082304(
        reissue.operational_status,
        reissue.issued_at
      )
      and (
        predecessor.id is null
        or not (
          (
            predecessor.id = reissue.parent_transaction_id
            and predecessor.service_type = 'TK'
            and predecessor.parent_transaction_id is null
            and public.ticketing_transaction_has_been_issued_2026082304(
              predecessor.operational_status,
              predecessor.issued_at
            )
          )
          or (
            predecessor.service_type = 'R-ER'
            and public.ticketing_transaction_has_been_issued_2026082304(
              predecessor.operational_status,
              predecessor.issued_at
            )
          )
        )
      )
  ) then
    raise exception 'Existing posted R-ER rows with invalid historical predecessors must be corrected before capability 2026082304 installation'
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
            and source_event.event_version = 1
          limit 1
        ),
        (predecessor.issued_at at time zone location.timezone)::date
      ) as issue_date
    ) predecessor_business_date
    where reissue.service_type = 'R-ER'
      and public.ticketing_transaction_has_been_issued_2026082304(
        reissue.operational_status,
        reissue.issued_at
      )
      and (
        predecessor_business_date.issue_date is null
        or reissue.booking_date < predecessor_business_date.issue_date
        or (reissue.issued_at at time zone location.timezone)::date
          < predecessor_business_date.issue_date
      )
  ) then
    raise exception 'Existing historically issued R-ER chronology violations must be corrected before capability 2026082304 installation'
      using errcode = '23514';
  end if;
end
$$;

create unique index if not exists ticket_transactions_one_historical_rer_successor_idx
  on public.ticket_transactions (supersedes_transaction_id)
  where service_type = 'R-ER'
    and issued_at is not null
    and operational_status in ('issued', 'cancelled', 'part_refunded', 'refunded')
    and supersedes_transaction_id is not null;

drop index if exists public.ticket_transactions_one_issued_rer_successor_idx;

create or replace function public.validate_ticket_service_transaction_lineage_2026082304()
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
  new_has_been_issued boolean;
  old_has_been_issued boolean := false;
  must_validate_tail boolean;
begin
  if new.service_type not in ('DC', 'R-ER') then
    return new;
  end if;

  new_has_been_issued := public.ticketing_transaction_has_been_issued_2026082304(
    new.operational_status,
    new.issued_at
  );
  if tg_op = 'UPDATE' then
    old_has_been_issued := public.ticketing_transaction_has_been_issued_2026082304(
      old.operational_status,
      old.issued_at
    );
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

  -- Preserve the direct-write boundary from 2302: a newly Issued service row
  -- still requires a currently Issued root. Later terminal lifecycle changes
  -- rely on the root's immutable has-been-issued identity instead.
  if new.operational_status = 'issued'
    and parent_row.operational_status <> 'issued'
  then
    raise exception 'Issued DC/R-ER transactions require an Issued root TK'
      using errcode = '23514';
  end if;

  if new_has_been_issued
    and not public.ticketing_transaction_has_been_issued_2026082304(
      parent_row.operational_status,
      parent_row.issued_at
    )
  then
    raise exception 'Posted DC/R-ER transactions require a root TK that has been issued'
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
        and public.ticketing_transaction_has_been_issued_2026082304(
          superseded_row.operational_status,
          superseded_row.issued_at
        )
      )
    )
  then
    raise exception 'R-ER can supersede only the root TK or an R-ER that has been issued in the same booking'
      using errcode = '23514';
  end if;

  must_validate_tail := tg_op = 'INSERT'
    or old.booking_id is distinct from new.booking_id
    or old.parent_transaction_id is distinct from new.parent_transaction_id
    or old.supersedes_transaction_id is distinct from new.supersedes_transaction_id
    or old.service_type is distinct from new.service_type
    or (not old_has_been_issued and new_has_been_issued);

  if must_validate_tail then
    -- A valid historical chain has exactly one R-ER with no historically
    -- issued successor. Terminal lifecycle rows remain visible here.
    select candidate.id
    into expected_superseded_id
    from public.ticket_transactions candidate
    where candidate.booking_id = new.booking_id
      and candidate.id <> new.id
      and candidate.service_type = 'R-ER'
      and public.ticketing_transaction_has_been_issued_2026082304(
        candidate.operational_status,
        candidate.issued_at
      )
      and not exists (
        select 1
        from public.ticket_transactions successor
        where successor.booking_id = candidate.booking_id
          and successor.id <> new.id
          and successor.service_type = 'R-ER'
          and public.ticketing_transaction_has_been_issued_2026082304(
            successor.operational_status,
            successor.issued_at
          )
          and successor.supersedes_transaction_id = candidate.id
      )
    order by candidate.issued_at desc, candidate.created_at desc, candidate.id desc
    limit 1;

    expected_superseded_id := coalesce(expected_superseded_id, parent_row.id);
    if new.supersedes_transaction_id <> expected_superseded_id then
      raise exception 'R-ER must supersede the historical replacement-chain tail'
        using errcode = '23514', hint = 'TICKETING_REISSUE_CHAIN_CONFLICT';
    end if;
  end if;

  if must_validate_tail then
    select source_event.effective_on
    into predecessor_issue_business_date
    from public.commission_source_events source_event
    where source_event.source_module = 'ticketing'
      and source_event.source_fact_key =
        'transaction:' || superseded_row.id::text || ':issued'
      and source_event.event_version = 1
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
  end if;

  return new;
end
$$;

comment on function public.validate_ticket_service_transaction_lineage_2026082304() is
  'Serializes DC/R-ER lineage by booking and retains issued R-ER rows in the linear replacement chain after cancellation or refund lifecycle transitions.';

drop trigger if exists ticket_transactions_validate_service_lineage
  on public.ticket_transactions;
create trigger ticket_transactions_validate_service_lineage
  before insert or update of
    booking_id,
    parent_transaction_id,
    supersedes_transaction_id,
    service_type,
    operational_status,
    issued_at
  on public.ticket_transactions
  for each row execute function public.validate_ticket_service_transaction_lineage_2026082304();

-- Keep the immutable replay implementation under a capability-specific name.
-- The public wrappers below call only this routine, while retired shared names
-- become procedure tombstones so an isolated historical migration cannot
-- silently replace 2304 behavior while the capability row still says ready.
create or replace function public.ticketing_enrich_service_business_dates_2026082304(
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
  stored_transaction jsonb;
  transaction_id_value uuid;
  transaction_row public.ticket_transactions%rowtype;
  expected_issue_event_type text;
  issued_fact_on date;
  booking_date_value date;
  issued_on_value date;
  paid_on_value date;
begin
  if p_booking_id is null
    or jsonb_typeof(p_response) is distinct from 'object'
    or jsonb_typeof(p_response -> 'booking') is distinct from 'object'
    or jsonb_typeof(p_response -> 'transaction') is distinct from 'object'
    or p_response #>> '{booking,id}' is distinct from p_booking_id::text
  then
    raise exception 'Ticket service response cannot be verified'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  stored_transaction := p_response -> 'transaction';

  begin
    transaction_id_value := (stored_transaction ->> 'id')::uuid;
  exception when invalid_text_representation then
    raise exception 'Ticket service response cannot be verified'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end;

  select transaction.*
  into transaction_row
  from public.ticket_transactions transaction
  join public.ticket_bookings booking on booking.id = transaction.booking_id
  join public.ticket_transactions root
    on root.id = transaction.parent_transaction_id
    and root.booking_id = transaction.booking_id
    and root.service_type = 'TK'
    and root.parent_transaction_id is null
  where transaction.id = transaction_id_value
    and booking.id = p_booking_id
    and transaction.service_type in ('DC', 'R-ER')
    and public.ticketing_transaction_has_been_issued_2026082304(
      transaction.operational_status,
      transaction.issued_at
    )
    and transaction.booking_date is not null;

  if not found
    or stored_transaction ->> 'serviceType' is distinct from transaction_row.service_type
    or stored_transaction ->> 'parentTransactionId'
      is distinct from transaction_row.parent_transaction_id::text
    or stored_transaction ->> 'operationalStatus' is distinct from 'issued'
    or jsonb_typeof(stored_transaction -> 'paymentStatus') is distinct from 'string'
    or stored_transaction ->> 'paymentStatus' not in ('unpaid', 'paid')
    or (
      transaction_row.supersedes_transaction_id is null
      and (
        not stored_transaction ? 'supersedesTransactionId'
        or jsonb_typeof(stored_transaction -> 'supersedesTransactionId') is distinct from 'null'
      )
    )
    or (
      transaction_row.supersedes_transaction_id is not null
      and stored_transaction ->> 'supersedesTransactionId'
        is distinct from transaction_row.supersedes_transaction_id::text
    )
  then
    raise exception 'Ticket service response cannot be reconciled to immutable DC/R-ER lineage'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  expected_issue_event_type := case transaction_row.service_type
    when 'DC' then 'ticket_date_changed'
    when 'R-ER' then 'ticket_reissued'
  end;

  select source_event.effective_on
  into issued_fact_on
  from public.commission_source_events source_event
  where source_event.source_module = 'ticketing'
    and source_event.source_record_id = transaction_row.id
    and source_event.source_fact_key =
      'transaction:' || transaction_row.id::text || ':issued'
    and source_event.event_type = expected_issue_event_type
    and source_event.event_version = 1
  limit 1;

  if not found or issued_fact_on is null then
    raise exception 'Ticket service issuance fact is unavailable for response replay'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  begin
    if stored_transaction ? 'bookingDate' then
      if jsonb_typeof(stored_transaction -> 'bookingDate') is distinct from 'string'
        or stored_transaction ->> 'bookingDate' !~ '^\d{4}-\d{2}-\d{2}$'
      then
        raise invalid_datetime_format;
      end if;
      booking_date_value := (stored_transaction ->> 'bookingDate')::date;
    else
      -- Pre-2303 payment responses omitted bookingDate. booking_date is an
      -- immutable posted identity field, not mutable lifecycle/payment state.
      booking_date_value := transaction_row.booking_date;
    end if;

    if booking_date_value is distinct from transaction_row.booking_date then
      raise invalid_datetime_format;
    end if;

    if stored_transaction ? 'issuedOn' then
      if jsonb_typeof(stored_transaction -> 'issuedOn') is distinct from 'string'
        or stored_transaction ->> 'issuedOn' !~ '^\d{4}-\d{2}-\d{2}$'
      then
        raise invalid_datetime_format;
      end if;
      issued_on_value := (stored_transaction ->> 'issuedOn')::date;
    else
      if stored_transaction ? 'issuedAt'
        and jsonb_typeof(stored_transaction -> 'issuedAt') is distinct from 'string'
      then
        raise invalid_datetime_format;
      end if;
      -- Pre-2303 payment responses omitted issuance time, and stored timestamp
      -- conversion would drift if the booking branch timezone later changed.
      -- The version-1 business date is immutable and action-time exact.
      issued_on_value := issued_fact_on;
    end if;

    if issued_on_value is distinct from issued_fact_on then
      raise invalid_datetime_format;
    end if;

    if stored_transaction ? 'paidOn' then
      if jsonb_typeof(stored_transaction -> 'paidOn') = 'null' then
        paid_on_value := null;
      elsif jsonb_typeof(stored_transaction -> 'paidOn') = 'string'
        and stored_transaction ->> 'paidOn' ~ '^\d{4}-\d{2}-\d{2}$'
      then
        paid_on_value := (stored_transaction ->> 'paidOn')::date;
      else
        raise invalid_datetime_format;
      end if;
    elsif stored_transaction ? 'paidAt' then
      if jsonb_typeof(stored_transaction -> 'paidAt') = 'null' then
        paid_on_value := null;
      elsif jsonb_typeof(stored_transaction -> 'paidAt') = 'string' then
        -- A non-null original payment timestamp is corroborated by the
        -- immutable version-1 payment business date below. Never reinterpret
        -- it through a branch timezone that may have changed since the action.
        select source_event.effective_on
        into paid_on_value
        from public.commission_source_events source_event
        where source_event.source_module = 'ticketing'
          and source_event.source_record_id = transaction_row.id
          and source_event.source_fact_key =
            'transaction:' || transaction_row.id::text || ':paid'
          and source_event.event_type = 'ticket_paid'
          and source_event.event_version = 1
        limit 1;
        if not found or paid_on_value is null then
          raise invalid_datetime_format;
        end if;
      else
        raise invalid_datetime_format;
      end if;
    elsif stored_transaction ->> 'paymentStatus' = 'paid' then
      select source_event.effective_on
      into paid_on_value
      from public.commission_source_events source_event
      where source_event.source_module = 'ticketing'
        and source_event.source_record_id = transaction_row.id
        and source_event.source_fact_key =
          'transaction:' || transaction_row.id::text || ':paid'
        and source_event.event_type = 'ticket_paid'
        and source_event.event_version = 1
      limit 1;
      if not found or paid_on_value is null then
        raise invalid_datetime_format;
      end if;
    else
      -- An original Unpaid response without an explicit payment timestamp is
      -- still authoritative even if the transaction was paid later.
      paid_on_value := null;
    end if;

    if (stored_transaction ->> 'paymentStatus' = 'paid' and paid_on_value is null)
      or (stored_transaction ->> 'paymentStatus' = 'unpaid' and paid_on_value is not null)
    then
      raise invalid_datetime_format;
    end if;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Stored Ticket service response contains invalid business dates'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end;

  if paid_on_value is not null
    and not exists (
      select 1
      from public.commission_source_events source_event
      where source_event.source_module = 'ticketing'
        and source_event.source_record_id = transaction_row.id
        and source_event.source_fact_key =
          'transaction:' || transaction_row.id::text || ':paid'
        and source_event.event_type = 'ticket_paid'
        and source_event.event_version = 1
        and source_event.effective_on = paid_on_value
    )
  then
    raise exception 'Stored Ticket service payment date lacks its immutable source fact'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  return jsonb_set(
    p_response,
    '{transaction}',
    stored_transaction || jsonb_build_object(
      'bookingDate', booking_date_value,
      'issuedOn', issued_on_value,
      'paidOn', paid_on_value
    ),
    true
  );
end
$$;

comment on function public.ticketing_enrich_service_business_dates_2026082304(uuid, jsonb) is
  'Capability 2304 replay adapter: verifies immutable service lineage and returns the original response business dates without reading mutable lifecycle/payment state.';

-- Existing completed service responses must reconcile before the capability is
-- advertised ready. This is intentionally a read-only preflight; corrections
-- remain explicit database-owner maintenance.
do $$
declare
  key_row record;
begin
  for key_row in
    select id, action_name, response_payload
    from public.ticket_idempotency_keys
    where action_name in (
      'ticketing.append_service_transaction.v1',
      'ticketing.mark_service_transaction_paid.v1'
    )
      and response_payload is not null
      and completed_at is not null
    order by id
  loop
    begin
      perform public.ticketing_enrich_service_business_dates_2026082304(
        (key_row.response_payload #>> '{booking,id}')::uuid,
        key_row.response_payload
      );
    exception when others then
      raise exception 'Stored Ticketing service response % cannot be reconciled for capability 2026082304',
        key_row.id
        using
          errcode = '23514',
          detail = 'action=' || key_row.action_name;
    end;
  end loop;
end
$$;

-- Public signatures stay stable, but their only response adapter is the
-- versioned 2304 implementation. The already-live 2303 cores remain private.
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
  return public.ticketing_enrich_service_business_dates_2026082304(
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
  'Service-role-only own-record DC/R-ER append RPC with immutable replay business dates provided by capability 2304.';

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
  return public.ticketing_enrich_service_business_dates_2026082304(
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
  'Service-role-only own-record DC/R-ER payment RPC with immutable replay business dates provided by capability 2304.';

-- Retire the shared trigger/adapter routine identities after all live
-- dependencies point at their versioned replacements. A historical migration
-- uses CREATE OR REPLACE FUNCTION for these exact signatures; PostgreSQL will
-- reject that atomically while a PROCEDURE owns the identity, rather than
-- silently downgrading behavior while schema status still advertises 2304.
do $$
declare
  routine_kind "char";
begin
  select procedure_row.prokind
  into routine_kind
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid = pg_catalog.to_regprocedure(
    'public.validate_ticket_service_transaction_lineage()'
  );

  if routine_kind = 'f' then
    execute 'drop function public.validate_ticket_service_transaction_lineage()';
  elsif routine_kind is not null and routine_kind <> 'p' then
    raise exception 'Unexpected retired Ticketing lineage routine kind %', routine_kind
      using errcode = '55000';
  end if;

  routine_kind := null;
  select procedure_row.prokind
  into routine_kind
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid = pg_catalog.to_regprocedure(
    'public.ticketing_enrich_service_business_dates_2026082303(uuid,jsonb)'
  );

  if routine_kind = 'f' then
    execute 'drop function public.ticketing_enrich_service_business_dates_2026082303(uuid, jsonb)';
  elsif routine_kind is not null and routine_kind <> 'p' then
    raise exception 'Unexpected retired Ticketing response-adapter routine kind %', routine_kind
      using errcode = '55000';
  end if;
end
$$;

create or replace procedure public.validate_ticket_service_transaction_lineage()
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  raise exception 'This Ticketing routine identity was retired by capability 2026082304'
    using errcode = '55000', hint = 'TICKETING_HISTORICAL_MIGRATION_REPLAY_BLOCKED';
end
$$;

comment on procedure public.validate_ticket_service_transaction_lineage() is
  'Revoked 2304 ratchet tombstone: prevents historical trigger-function migrations from silently replacing the active versioned lineage guard.';

create or replace procedure public.ticketing_enrich_service_business_dates_2026082303(
  p_booking_id uuid,
  p_response jsonb
)
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  raise exception 'This Ticketing routine identity was retired by capability 2026082304'
    using errcode = '55000', hint = 'TICKETING_HISTORICAL_MIGRATION_REPLAY_BLOCKED';
end
$$;

comment on procedure public.ticketing_enrich_service_business_dates_2026082303(uuid, jsonb) is
  'Revoked 2304 ratchet tombstone: prevents historical response migrations from silently replacing the immutable versioned adapter.';

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026082304,
  now(),
  jsonb_build_object(
    'migration', '20260823_ticketing_service_response_lineage_guard.sql',
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
      'service-business-date-responses',
      'immutable-service-replay-dates',
      'historical-reissue-lineage',
      'unique-historical-reissue-successor',
      'immutable-completed-idempotency'
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
    'ready', coalesce(version >= 2026082304, false),
    'version', version,
    'requiredVersion', greatest(version, 2026082304),
    'appliedAt', applied_at,
    'details', details
  )
  from public.portal_schema_versions
  where component = 'ticketing'
$$;

revoke all on function public.ticketing_transaction_has_been_issued_2026082304(text, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.protect_completed_ticket_idempotency_2026082304()
  from public, anon, authenticated, service_role;
revoke all on function public.ticketing_enrich_service_business_dates_2026082304(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.validate_ticket_service_transaction_lineage_2026082304()
  from public, anon, authenticated, service_role;

revoke all on procedure public.validate_ticket_service_transaction_lineage()
  from public, anon, authenticated, service_role;
revoke all on procedure public.ticketing_enrich_service_business_dates_2026082303(uuid, jsonb)
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
