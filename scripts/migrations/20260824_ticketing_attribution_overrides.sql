-- Forward-only Ticketing capability 2026082402.
--
-- Ticketing records operational attribution facts only. Commission rates,
-- earnings, tier calculations, statements, and payouts remain owned by the
-- later Commission module.
--
-- The authenticated actor is always retained as the immutable entry actor.
-- A separately selected primary employee owns the booking/transactions and is
-- the only employee credited with root-TK issued-ticket target units. Root-TK
-- assistants are immutable source facts for later Commission processing and
-- always receive zero target units from assistance. DC/R-ER assistance is a
-- separate future transaction-scoped concern.

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

  if installed_version > 2026082402 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026082402, installed_version
      using
        errcode = '55000',
        hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;

  if installed_version is null or installed_version < 2026082401 then
    raise exception 'Ticketing capability 2026082401 is required before attribution capability 2026082402'
      using
        errcode = '55000',
        hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
end
$ticketing_forward_guard$;

-- Close the scan-to-trigger installation window. A writer already in flight
-- commits before this lock is granted and is included by the backfill scans; a
-- writer arriving afterward waits until the invariant/enrichment triggers are
-- installed at commit.
lock table
  public.ticket_bookings,
  public.ticket_transactions,
  public.commission_source_events
in share row exclusive mode;

create or replace function public.ticketing_uuid_array_is_unique_2026082402(
  p_values uuid[]
)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(cardinality(p_values), 0) = (
    select count(distinct value)
    from unnest(coalesce(p_values, array[]::uuid[])) as item(value)
  )
$$;

-- This table exists only long enough for one security-definer RPC call. It is
-- the unforgeable bridge that allows the existing atomic Quick TK function to
-- retain the real actor while inserting the selected primary owner and initial
-- assistants. No application role can read or write these rows.
create table if not exists public.ticket_attribution_write_contexts (
  id uuid primary key default gen_random_uuid(),
  context_mode text not null,
  actor_employee_id uuid not null
    references public.employees(id) on delete restrict,
  primary_employee_id uuid not null
    references public.employees(id) on delete restrict,
  assistant_employee_ids uuid[] not null default array[]::uuid[],
  booking_id uuid,
  reason text,
  created_at timestamptz not null default clock_timestamp(),
  constraint ticket_attribution_write_contexts_mode_check
    check (context_mode in ('quick_create', 'correction')),
  constraint ticket_attribution_write_contexts_assistant_count_check
    check (cardinality(assistant_employee_ids) between 0 and 10),
  constraint ticket_attribution_write_contexts_assistant_unique_check
    check (public.ticketing_uuid_array_is_unique_2026082402(assistant_employee_ids)),
  constraint ticket_attribution_write_contexts_primary_not_assistant_check
    check (not (primary_employee_id = any(assistant_employee_ids))),
  constraint ticket_attribution_write_contexts_reason_check
    check (reason is null or length(btrim(reason)) between 1 and 500),
  constraint ticket_attribution_write_contexts_correction_booking_check
    check (context_mode <> 'correction' or booking_id is not null)
);

create table if not exists public.ticket_booking_attribution_versions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null
    references public.ticket_bookings(id) on delete restrict,
  root_transaction_id uuid not null,
  attribution_version integer not null,
  supersedes_attribution_id uuid,
  change_kind text not null,
  primary_employee_id uuid not null,
  entered_by_employee_id uuid not null,
  changed_by_employee_id uuid not null,
  reason text,
  created_at timestamptz not null default clock_timestamp(),
  constraint ticket_booking_attribution_versions_version_check
    check (attribution_version > 0),
  constraint ticket_booking_attribution_versions_kind_check
    check (change_kind in ('initial', 'override', 'correction', 'migration')),
  constraint ticket_booking_attribution_versions_reason_check
    check (reason is null or length(btrim(reason)) between 1 and 500),
  constraint ticket_booking_attribution_versions_correction_reason_check
    check (change_kind <> 'correction' or reason is not null),
  constraint ticket_booking_attribution_versions_booking_version_key
    unique (booking_id, attribution_version),
  constraint ticket_booking_attribution_versions_id_booking_key
    unique (id, booking_id),
  constraint ticket_booking_attribution_versions_root_booking_fkey
    foreign key (root_transaction_id, booking_id)
    references public.ticket_transactions(id, booking_id)
    on delete restrict,
  constraint ticket_booking_attribution_versions_supersedes_booking_fkey
    foreign key (supersedes_attribution_id, booking_id)
    references public.ticket_booking_attribution_versions(id, booking_id)
    on delete restrict,
  constraint ticket_booking_attribution_versions_primary_employee_id_fkey
    foreign key (primary_employee_id)
    references public.employees(id)
    on delete restrict,
  constraint ticket_booking_attribution_versions_entered_by_employee_id_fkey
    foreign key (entered_by_employee_id)
    references public.employees(id)
    on delete restrict,
  constraint ticket_booking_attribution_versions_changed_by_employee_id_fkey
    foreign key (changed_by_employee_id)
    references public.employees(id)
    on delete restrict
);

create index if not exists ticket_booking_attribution_versions_booking_created_idx
  on public.ticket_booking_attribution_versions (
    booking_id,
    attribution_version desc,
    created_at desc
  );

create table if not exists public.ticket_booking_attribution_assistants (
  attribution_id uuid not null,
  booking_id uuid not null,
  employee_id uuid not null,
  sort_order smallint not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint ticket_booking_attribution_assistants_pkey
    primary key (attribution_id, employee_id),
  constraint ticket_booking_attribution_assistants_sort_key
    unique (attribution_id, sort_order),
  constraint ticket_booking_attribution_assistants_sort_check
    check (sort_order between 1 and 10),
  constraint ticket_booking_attribution_assistants_attribution_booking_fkey
    foreign key (attribution_id, booking_id)
    references public.ticket_booking_attribution_versions(id, booking_id)
    on delete restrict,
  constraint ticket_booking_attribution_assistants_employee_id_fkey
    foreign key (employee_id)
    references public.employees(id)
    on delete restrict
);

create index if not exists ticket_booking_attribution_assistants_employee_idx
  on public.ticket_booking_attribution_assistants (employee_id, created_at desc);

create or replace function public.validate_ticket_booking_attribution_version_2026082402()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  previous_row public.ticket_booking_attribution_versions%rowtype;
begin
  if not exists (
    select 1
    from public.ticket_transactions root
    where root.id = new.root_transaction_id
      and root.booking_id = new.booking_id
      and root.service_type = 'TK'
      and root.parent_transaction_id is null
  ) then
    raise exception 'Ticket attribution must reference the root TK transaction'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.employees employee
    where employee.id = new.primary_employee_id
  ) or not exists (
    select 1 from public.employees employee
    where employee.id = new.entered_by_employee_id
  ) or not exists (
    select 1 from public.employees employee
    where employee.id = new.changed_by_employee_id
  ) then
    raise exception 'Ticket attribution employees do not exist'
      using errcode = '22023';
  end if;

  -- Historical owners may have been deactivated after doing the work. Preserve
  -- those facts during migration; every new initial/override/correction path
  -- still requires active recipients and a currently active actor.
  if new.change_kind <> 'migration' and (
    not exists (
      select 1 from public.employees employee
      where employee.id = new.primary_employee_id and employee.is_active
    ) or not exists (
      select 1 from public.employees employee
      where employee.id = new.changed_by_employee_id and employee.is_active
    )
  ) then
    raise exception 'Ticket attribution employees are inactive'
      using errcode = '22023';
  end if;

  if new.attribution_version = 1 then
    if new.supersedes_attribution_id is not null then
      raise exception 'Initial ticket attribution cannot supersede another version'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.supersedes_attribution_id is null then
    raise exception 'Corrected ticket attribution must supersede its prior version'
      using errcode = '23514';
  end if;

  select previous.*
  into previous_row
  from public.ticket_booking_attribution_versions previous
  where previous.id = new.supersedes_attribution_id
    and previous.booking_id = new.booking_id;

  if not found
    or previous_row.attribution_version <> new.attribution_version - 1
    or previous_row.root_transaction_id <> new.root_transaction_id
    or previous_row.entered_by_employee_id <> new.entered_by_employee_id
  then
    raise exception 'Invalid ticket attribution correction lineage'
      using errcode = '23514';
  end if;

  return new;
end
$$;

drop trigger if exists ticket_booking_attribution_versions_validate_2402
  on public.ticket_booking_attribution_versions;
create trigger ticket_booking_attribution_versions_validate_2402
  before insert on public.ticket_booking_attribution_versions
  for each row execute function public.validate_ticket_booking_attribution_version_2026082402();

create or replace function public.validate_ticket_booking_attribution_assistant_2026082402()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  primary_employee_id_value uuid;
begin
  select attribution.primary_employee_id
  into primary_employee_id_value
  from public.ticket_booking_attribution_versions attribution
  where attribution.id = new.attribution_id
    and attribution.booking_id = new.booking_id;

  if not found then
    return new;
  end if;

  if new.employee_id = primary_employee_id_value then
    raise exception 'Primary ticket employee cannot also be an assistant'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.employees employee
    where employee.id = new.employee_id
      and employee.is_active
  ) then
    raise exception 'Ticket assistant employee is invalid or inactive'
      using errcode = '22023';
  end if;

  return new;
end
$$;

drop trigger if exists ticket_booking_attribution_assistants_validate_2402
  on public.ticket_booking_attribution_assistants;
create trigger ticket_booking_attribution_assistants_validate_2402
  before insert on public.ticket_booking_attribution_assistants
  for each row execute function public.validate_ticket_booking_attribution_assistant_2026082402();

drop trigger if exists ticket_booking_attribution_versions_immutable_2402
  on public.ticket_booking_attribution_versions;
create trigger ticket_booking_attribution_versions_immutable_2402
  before update or delete on public.ticket_booking_attribution_versions
  for each row execute function public.reject_immutable_event_mutation();

drop trigger if exists ticket_booking_attribution_assistants_immutable_2402
  on public.ticket_booking_attribution_assistants;
create trigger ticket_booking_attribution_assistants_immutable_2402
  before update or delete on public.ticket_booking_attribution_assistants
  for each row execute function public.reject_immutable_event_mutation();

do $$
begin
  if exists (
    select 1
    from public.ticket_bookings booking
    where not exists (
      select 1
      from public.ticket_transactions root
      where root.booking_id = booking.id
        and root.service_type = 'TK'
        and root.parent_transaction_id is null
    )
  ) then
    raise exception 'Existing Ticketing bookings without a root TK transaction must be corrected before attribution installation'
      using errcode = '23514';
  end if;
end
$$;

-- Every pre-capability booking starts with a neutral immutable version: its
-- current owner remains primary and its original root transaction actor remains
-- the employee who entered it. No assistants or earnings are inferred.
insert into public.ticket_booking_attribution_versions (
  booking_id,
  root_transaction_id,
  attribution_version,
  supersedes_attribution_id,
  change_kind,
  primary_employee_id,
  entered_by_employee_id,
  changed_by_employee_id,
  reason
)
select
  booking.id,
  root.id,
  1,
  null,
  'migration',
  booking.owner_employee_id,
  root.acting_employee_id,
  root.acting_employee_id,
  'Capability 2026082402 attribution backfill'
from public.ticket_bookings booking
join public.ticket_transactions root
  on root.booking_id = booking.id
  and root.service_type = 'TK'
  and root.parent_transaction_id is null
where not exists (
  select 1
  from public.ticket_booking_attribution_versions attribution
  where attribution.booking_id = booking.id
);

create or replace view public.ticket_booking_current_attribution
with (security_invoker = true)
as
select
  attribution.booking_id,
  attribution.root_transaction_id,
  attribution.id as attribution_id,
  attribution.attribution_version,
  attribution.primary_employee_id,
  attribution.entered_by_employee_id,
  attribution.changed_by_employee_id,
  attribution.reason,
  attribution.created_at,
  coalesce(
    array_agg(assistant.employee_id order by assistant.sort_order)
      filter (where assistant.employee_id is not null),
    array[]::uuid[]
  ) as assistant_employee_ids
from public.ticket_booking_attribution_versions attribution
left join public.ticket_booking_attribution_versions later
  on later.booking_id = attribution.booking_id
  and later.attribution_version > attribution.attribution_version
left join public.ticket_booking_attribution_assistants assistant
  on assistant.attribution_id = attribution.id
  and assistant.booking_id = attribution.booking_id
where later.id is null
group by attribution.id;

comment on table public.ticket_booking_attribution_versions is
  'Immutable operational attribution versions. Rates and calculated commission do not belong in Ticketing.';
comment on table public.ticket_booking_attribution_assistants is
  'Immutable root-TK assistants for one attribution version. Assistance never contributes Ticketing target units; later DC/R-ER assistance requires transaction-scoped attribution.';
comment on view public.ticket_booking_current_attribution is
  'Current primary, immutable original entry actor, latest change actor, and assistant IDs for each Ticketing booking.';

-- Upgrade any pre-capability issued source facts without rewriting immutable
-- Commission history. This is deterministic and retry-safe: a later rerun sees
-- the enriched tail and appends nothing.
do $ticketing_backfill_issued_attribution$
declare
  source_event_row public.commission_source_events%rowtype;
  transaction_row public.ticket_transactions%rowtype;
  primary_employee_id_value uuid;
  assistant_employee_ids_value uuid[];
  source_event_key text;
begin
  for source_event_row in
    select distinct on (source_event.source_fact_key) source_event.*
    from public.commission_source_events source_event
    join public.ticket_transactions transaction
      on transaction.id = source_event.source_record_id
    where source_event.source_module = 'ticketing'
      and transaction.service_type = 'TK'
      and transaction.parent_transaction_id is null
      and source_event.source_fact_key =
        'transaction:' || source_event.source_record_id::text || ':issued'
    order by source_event.source_fact_key, source_event.event_version desc
  loop
    select transaction.*
    into transaction_row
    from public.ticket_transactions transaction
    where transaction.id = source_event_row.source_record_id;

    select
      attribution.primary_employee_id,
      attribution.assistant_employee_ids
    into
      primary_employee_id_value,
      assistant_employee_ids_value
    from public.ticket_booking_current_attribution attribution
    where attribution.booking_id = transaction_row.booking_id;

    primary_employee_id_value := coalesce(
      primary_employee_id_value,
      transaction_row.owner_employee_id
    );
    assistant_employee_ids_value := coalesce(
      assistant_employee_ids_value,
      array[]::uuid[]
    );

    if source_event_row.employee_id = primary_employee_id_value
      and source_event_row.owner_employee_id = primary_employee_id_value
      and source_event_row.variables ->> 'acting_employee_id' =
        transaction_row.acting_employee_id::text
      and source_event_row.variables ->> 'primary_responsible_employee_id' =
        primary_employee_id_value::text
      and source_event_row.variables -> 'assistant_employee_ids' =
        to_jsonb(assistant_employee_ids_value)
      and (source_event_row.variables ->> 'issued_ticket_target_units')::integer =
        transaction_row.passenger_ticket_count
      and (source_event_row.variables ->> 'assistant_target_units')::integer = 0
    then
      continue;
    end if;

    source_event_key := 'attrb:v1:' || encode(
      digest(
        source_event_row.source_fact_key || ':'
          || source_event_row.source_event_id::text || ':'
          || (source_event_row.event_version + 1)::text,
        'sha256'
      ),
      'hex'
    );

    perform public.append_commission_source_event(
      jsonb_build_object(
        'source_module', source_event_row.source_module,
        'source_event_id', gen_random_uuid(),
        'source_fact_key', source_event_row.source_fact_key,
        'source_record_id', source_event_row.source_record_id,
        'event_type', source_event_row.event_type,
        'contract_version', source_event_row.contract_version,
        'event_version', source_event_row.event_version + 1,
        'supersedes_event_id', source_event_row.source_event_id,
        'employee_id', primary_employee_id_value,
        'owner_employee_id', primary_employee_id_value,
        'location_id', source_event_row.location_id,
        'occurred_at', clock_timestamp(),
        'effective_on', source_event_row.effective_on,
        'source_path', source_event_row.source_path,
        'variables', source_event_row.variables || jsonb_build_object(
          'acting_employee_id', transaction_row.acting_employee_id,
          'primary_responsible_employee_id', primary_employee_id_value,
          'assistant_employee_ids', to_jsonb(assistant_employee_ids_value),
          'issued_ticket_target_units', transaction_row.passenger_ticket_count,
          'assistant_target_units', 0
        ),
        'idempotency_key', source_event_key
      )
    );
  end loop;
end
$ticketing_backfill_issued_attribution$;

create or replace function public.ticketing_context_id_2026082402()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  context_value text;
begin
  context_value := nullif(current_setting('ticketing.attribution_context_id', true), '');
  if context_value is null then
    return null;
  end if;

  begin
    return context_value::uuid;
  exception when invalid_text_representation then
    return null;
  end;
end
$$;

create or replace function public.ticketing_apply_initial_booking_attribution_2026082402()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  context_row public.ticket_attribution_write_contexts%rowtype;
begin
  select context.*
  into context_row
  from public.ticket_attribution_write_contexts context
  where context.id = public.ticketing_context_id_2026082402()
    and context.context_mode = 'quick_create'
    and context.actor_employee_id = new.created_by
    and context.booking_id is null
  for update;

  if not found then
    return new;
  end if;

  new.owner_employee_id := context_row.primary_employee_id;

  update public.ticket_attribution_write_contexts context
  set booking_id = new.id
  where context.id = context_row.id
    and context.booking_id is null;

  if not found then
    raise exception 'Ticket attribution write context was already consumed'
      using errcode = '55000';
  end if;

  return new;
end
$$;

drop trigger if exists ticket_bookings_apply_initial_attribution_2402
  on public.ticket_bookings;
create trigger ticket_bookings_apply_initial_attribution_2402
  before insert on public.ticket_bookings
  for each row execute function public.ticketing_apply_initial_booking_attribution_2026082402();

create or replace function public.ticketing_apply_initial_transaction_attribution_2026082402()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  context_row public.ticket_attribution_write_contexts%rowtype;
begin
  select context.*
  into context_row
  from public.ticket_attribution_write_contexts context
  where context.id = public.ticketing_context_id_2026082402()
    and context.context_mode = 'quick_create'
    and context.actor_employee_id = new.acting_employee_id
    and context.booking_id = new.booking_id;

  if found then
    new.owner_employee_id := context_row.primary_employee_id;
  end if;

  return new;
end
$$;

drop trigger if exists ticket_transactions_apply_initial_attribution_2402
  on public.ticket_transactions;
create trigger ticket_transactions_apply_initial_attribution_2402
  before insert on public.ticket_transactions
  for each row execute function public.ticketing_apply_initial_transaction_attribution_2026082402();

create or replace function public.ticketing_record_initial_attribution_2026082402()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  context_row public.ticket_attribution_write_contexts%rowtype;
  attribution_id_value uuid := gen_random_uuid();
  primary_employee_id_value uuid := new.owner_employee_id;
  entered_by_employee_id_value uuid := new.acting_employee_id;
  changed_by_employee_id_value uuid := new.acting_employee_id;
  assistants_value uuid[] := array[]::uuid[];
  reason_value text;
  change_kind_value text := 'initial';
  assistant_id uuid;
  assistant_position integer := 0;
begin
  if new.service_type <> 'TK' or new.parent_transaction_id is not null then
    return new;
  end if;

  if exists (
    select 1
    from public.ticket_booking_attribution_versions attribution
    where attribution.booking_id = new.booking_id
  ) then
    return new;
  end if;

  select context.*
  into context_row
  from public.ticket_attribution_write_contexts context
  where context.id = public.ticketing_context_id_2026082402()
    and context.context_mode = 'quick_create'
    and context.actor_employee_id = new.acting_employee_id
    and context.booking_id = new.booking_id;

  if found then
    primary_employee_id_value := context_row.primary_employee_id;
    assistants_value := context_row.assistant_employee_ids;
    reason_value := context_row.reason;
    change_kind_value := case
      when context_row.primary_employee_id <> context_row.actor_employee_id
        or cardinality(context_row.assistant_employee_ids) > 0
      then 'override'
      else 'initial'
    end;
  end if;

  insert into public.ticket_booking_attribution_versions (
    id,
    booking_id,
    root_transaction_id,
    attribution_version,
    supersedes_attribution_id,
    change_kind,
    primary_employee_id,
    entered_by_employee_id,
    changed_by_employee_id,
    reason
  ) values (
    attribution_id_value,
    new.booking_id,
    new.id,
    1,
    null,
    change_kind_value,
    primary_employee_id_value,
    entered_by_employee_id_value,
    changed_by_employee_id_value,
    reason_value
  );

  foreach assistant_id in array assistants_value
  loop
    assistant_position := assistant_position + 1;
    insert into public.ticket_booking_attribution_assistants (
      attribution_id,
      booking_id,
      employee_id,
      sort_order
    ) values (
      attribution_id_value,
      new.booking_id,
      assistant_id,
      assistant_position
    );
  end loop;

  insert into public.ticket_audit_events (
    entity_type,
    entity_id,
    booking_id,
    transaction_id,
    action,
    actor_employee_id,
    reason,
    before_state,
    after_state
  ) values (
    'booking',
    new.booking_id,
    new.booking_id,
    new.id,
    'initial_ticket_attribution',
    entered_by_employee_id_value,
    reason_value,
    null,
    jsonb_build_object(
      'attribution_version', 1,
      'primary_employee_id', primary_employee_id_value,
      'entered_by_employee_id', entered_by_employee_id_value,
      'assistant_employee_ids', to_jsonb(assistants_value),
      'issued_ticket_target_rule', 'primary_only',
      'assistant_target_units', 0
    )
  );

  return new;
end
$$;

drop trigger if exists ticket_transactions_record_initial_attribution_2402
  on public.ticket_transactions;
create trigger ticket_transactions_record_initial_attribution_2402
  after insert on public.ticket_transactions
  for each row execute function public.ticketing_record_initial_attribution_2026082402();

create or replace function public.ticketing_owner_correction_context_matches_2026082402(
  p_booking_id uuid,
  p_old_primary_employee_id uuid,
  p_new_primary_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
  select exists (
    select 1
    from public.ticket_attribution_write_contexts context
    where context.id = public.ticketing_context_id_2026082402()
      and context.context_mode = 'correction'
      and context.booking_id = p_booking_id
      and context.primary_employee_id = p_new_primary_employee_id
      and p_old_primary_employee_id is distinct from p_new_primary_employee_id
  )
$$;

create or replace function public.protect_ticket_booking_attribution_owner_2026082402()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
begin
  if new.owner_employee_id is distinct from old.owner_employee_id
    and not public.ticketing_owner_correction_context_matches_2026082402(
      old.id,
      old.owner_employee_id,
      new.owner_employee_id
    )
  then
    raise exception 'Ticket booking ownership changes require an audited attribution correction'
      using errcode = '55000', hint = 'TICKETING_ATTRIBUTION_CORRECTION_REQUIRED';
  end if;

  return new;
end
$$;

drop trigger if exists ticket_bookings_protect_attribution_owner_2402
  on public.ticket_bookings;
create trigger ticket_bookings_protect_attribution_owner_2402
  before update of owner_employee_id on public.ticket_bookings
  for each row execute function public.protect_ticket_booking_attribution_owner_2026082402();

create or replace function public.protect_ticket_transaction_attribution_owner_2026082402()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
begin
  if new.owner_employee_id is distinct from old.owner_employee_id
    and not public.ticketing_owner_correction_context_matches_2026082402(
      old.booking_id,
      old.owner_employee_id,
      new.owner_employee_id
    )
  then
    raise exception 'Ticket transaction ownership changes require an audited attribution correction'
      using errcode = '55000', hint = 'TICKETING_ATTRIBUTION_CORRECTION_REQUIRED';
  end if;

  return new;
end
$$;

drop trigger if exists ticket_transactions_protect_attribution_owner_2402
  on public.ticket_transactions;
create trigger ticket_transactions_protect_attribution_owner_2402
  before update of owner_employee_id on public.ticket_transactions
  for each row execute function public.protect_ticket_transaction_attribution_owner_2026082402();

-- Preserve every existing lifecycle and financial immutability rule. The only
-- new exception is an owner-only change carrying a matching short-lived
-- correction context. acting_employee_id is deliberately never mutable.
create or replace function public.protect_ticket_transaction_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  valid_owner_correction boolean := false;
begin
  if tg_op = 'DELETE' then
    raise exception 'Ticket transactions cannot be deleted; archive or append a correction'
      using errcode = '55000';
  end if;

  if old.operational_status in ('issued', 'cancelled', 'part_refunded', 'refunded') then
    if (
      old.operational_status = 'issued'
      and new.operational_status not in ('issued', 'cancelled', 'part_refunded', 'refunded')
    ) or (
      old.operational_status = 'cancelled'
      and new.operational_status <> 'cancelled'
    ) or (
      old.operational_status = 'part_refunded'
      and new.operational_status not in ('part_refunded', 'refunded')
    ) or (
      old.operational_status = 'refunded'
      and new.operational_status <> 'refunded'
    ) then
      raise exception 'Posted ticket lifecycle cannot move backwards'
        using errcode = '55000';
    end if;
  end if;

  if (old.payment_status = 'part_paid' and new.payment_status = 'unpaid')
    or (old.payment_status = 'paid' and new.payment_status <> 'paid')
  then
    raise exception 'Ticket payment status cannot move backwards'
      using errcode = '55000';
  end if;

  valid_owner_correction :=
    new.owner_employee_id is distinct from old.owner_employee_id
    and public.ticketing_owner_correction_context_matches_2026082402(
      old.booking_id,
      old.owner_employee_id,
      new.owner_employee_id
    )
    and row(
      new.booking_id,
      new.parent_transaction_id,
      new.supersedes_transaction_id,
      new.service_type,
      new.acting_employee_id,
      new.booking_date,
      new.time_limit_at,
      new.time_limit_timezone,
      new.issued_at,
      new.passenger_ticket_count,
      new.currency,
      new.supplier_cost_source,
      new.supplier_cost_gbp,
      new.sale_price_source,
      new.sale_price_gbp,
      new.idempotency_key
    ) is not distinct from row(
      old.booking_id,
      old.parent_transaction_id,
      old.supersedes_transaction_id,
      old.service_type,
      old.acting_employee_id,
      old.booking_date,
      old.time_limit_at,
      old.time_limit_timezone,
      old.issued_at,
      old.passenger_ticket_count,
      old.currency,
      old.supplier_cost_source,
      old.supplier_cost_gbp,
      old.sale_price_source,
      old.sale_price_gbp,
      old.idempotency_key
    );

  if old.operational_status in ('issued', 'cancelled', 'part_refunded', 'refunded')
    and row(
      new.booking_id,
      new.parent_transaction_id,
      new.supersedes_transaction_id,
      new.service_type,
      new.owner_employee_id,
      new.acting_employee_id,
      new.booking_date,
      new.time_limit_at,
      new.time_limit_timezone,
      new.issued_at,
      new.passenger_ticket_count,
      new.currency,
      new.supplier_cost_source,
      new.supplier_cost_gbp,
      new.sale_price_source,
      new.sale_price_gbp,
      new.idempotency_key
    ) is distinct from row(
      old.booking_id,
      old.parent_transaction_id,
      old.supersedes_transaction_id,
      old.service_type,
      old.owner_employee_id,
      old.acting_employee_id,
      old.booking_date,
      old.time_limit_at,
      old.time_limit_timezone,
      old.issued_at,
      old.passenger_ticket_count,
      old.currency,
      old.supplier_cost_source,
      old.supplier_cost_gbp,
      old.sale_price_source,
      old.sale_price_gbp,
      old.idempotency_key
    )
    and not valid_owner_correction
  then
    raise exception 'Posted ticket identity and financial facts are immutable; append a correction'
      using errcode = '55000';
  end if;

  if (old.paid_at is not null and new.paid_at is distinct from old.paid_at)
    or (old.cancelled_at is not null and new.cancelled_at is distinct from old.cancelled_at)
    or (old.refunded_at is not null and new.refunded_at is distinct from old.refunded_at)
  then
    raise exception 'Posted ticket lifecycle timestamps are immutable; append a correction'
      using errcode = '55000';
  end if;

  return new;
end
$$;

create or replace function public.enrich_ticketing_source_event_attribution_2026082402()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  transaction_row public.ticket_transactions%rowtype;
  primary_employee_id_value uuid;
  assistant_employee_ids_value uuid[] := array[]::uuid[];
begin
  if new.source_module <> 'ticketing'
    or new.source_fact_key <> 'transaction:' || new.source_record_id::text || ':issued'
  then
    return new;
  end if;

  select transaction.*
  into transaction_row
  from public.ticket_transactions transaction
  where transaction.id = new.source_record_id;

  if not found then
    return new;
  end if;

  -- Booking attribution describes the root ticket sale only. A later DC/R-ER
  -- may have different helpers and needs its own transaction-scoped facts.
  if transaction_row.service_type <> 'TK'
    or transaction_row.parent_transaction_id is not null
  then
    return new;
  end if;

  select
    attribution.primary_employee_id,
    attribution.assistant_employee_ids
  into
    primary_employee_id_value,
    assistant_employee_ids_value
  from public.ticket_booking_current_attribution attribution
  where attribution.booking_id = transaction_row.booking_id;

  primary_employee_id_value := coalesce(
    primary_employee_id_value,
    transaction_row.owner_employee_id
  );
  assistant_employee_ids_value := coalesce(
    assistant_employee_ids_value,
    array[]::uuid[]
  );

  new.employee_id := primary_employee_id_value;
  new.owner_employee_id := primary_employee_id_value;
  new.variables := new.variables || jsonb_build_object(
    'acting_employee_id', transaction_row.acting_employee_id,
    'primary_responsible_employee_id', primary_employee_id_value,
    'assistant_employee_ids', to_jsonb(assistant_employee_ids_value),
    'issued_ticket_target_units', transaction_row.passenger_ticket_count,
    'assistant_target_units', 0
  );

  return new;
end
$$;

drop trigger if exists commission_source_events_enrich_ticket_attribution_2402
  on public.commission_source_events;
create trigger commission_source_events_enrich_ticket_attribution_2402
  before insert on public.commission_source_events
  for each row execute function public.enrich_ticketing_source_event_attribution_2026082402();

create or replace function public.ticketing_create_quick_tk_attributed(
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_entry jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  action_name_value constant text := 'ticketing.quick_create_tk_attributed.v1';
  idempotency_key_value text;
  internal_idempotency_key text;
  business_entry jsonb;
  canonical_request jsonb;
  existing_request jsonb;
  existing_response jsonb;
  primary_employee_id_value uuid;
  assistant_employee_ids_value uuid[] := array[]::uuid[];
  assistant_count integer := 0;
  assistant_distinct_count integer := 0;
  attribution_reason_value text;
  employee_lock_row record;
  department_lock_row record;
  actor_employee_found boolean := false;
  actor_is_active boolean := false;
  actor_is_admin boolean := false;
  actor_is_manager_or_admin boolean := false;
  actor_has_ticketing_department boolean := false;
  primary_employee_is_active boolean := false;
  assistant_employee_active_count integer := 0;
  context_id_value uuid := gen_random_uuid();
  response_value jsonb;
  attribution_row record;
begin
  if p_actor_employee_id is null then
    raise exception 'Authenticated Ticketing employee required'
      using errcode = '42501';
  end if;

  idempotency_key_value := btrim(coalesce(p_idempotency_key, ''));
  if length(idempotency_key_value) not between 1 and 200 then
    raise exception 'A valid idempotency key is required'
      using errcode = '22023';
  end if;

  if p_entry is null or jsonb_typeof(p_entry) is distinct from 'object' then
    raise exception 'TK quick entry must be a JSON object'
      using errcode = '22023';
  end if;

  if p_entry ? 'responsibleEmployeeId'
    and jsonb_typeof(p_entry -> 'responsibleEmployeeId') not in ('string', 'null')
  then
    raise exception 'responsibleEmployeeId must be a UUID string or null'
      using errcode = '22023';
  end if;

  begin
    primary_employee_id_value := coalesce(
      nullif(p_entry ->> 'responsibleEmployeeId', '')::uuid,
      p_actor_employee_id
    );
  exception when invalid_text_representation then
    raise exception 'responsibleEmployeeId must be a valid UUID'
      using errcode = '22023';
  end;

  if p_entry ? 'assistantEmployeeIds'
    and jsonb_typeof(p_entry -> 'assistantEmployeeIds') is distinct from 'array'
  then
    raise exception 'assistantEmployeeIds must be an array'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(
      coalesce(p_entry -> 'assistantEmployeeIds', '[]'::jsonb)
    ) item(value)
    where jsonb_typeof(item.value) is distinct from 'string'
  ) then
    raise exception 'Each assistantEmployeeIds value must be a UUID string'
      using errcode = '22023';
  end if;

  begin
    select
      coalesce(array_agg(parsed.employee_id order by parsed.employee_id), array[]::uuid[]),
      count(*)::integer,
      count(distinct parsed.employee_id)::integer
    into
      assistant_employee_ids_value,
      assistant_count,
      assistant_distinct_count
    from (
      select (item.value #>> '{}')::uuid as employee_id
      from jsonb_array_elements(
        coalesce(p_entry -> 'assistantEmployeeIds', '[]'::jsonb)
      ) item(value)
    ) parsed;
  exception when invalid_text_representation then
    raise exception 'assistantEmployeeIds contains an invalid UUID'
      using errcode = '22023';
  end;

  if assistant_count > 10 then
    raise exception 'A ticket may have at most 10 assistants'
      using errcode = '22023';
  end if;

  if assistant_count <> assistant_distinct_count then
    raise exception 'assistantEmployeeIds must be unique'
      using errcode = '22023';
  end if;

  if primary_employee_id_value = any(assistant_employee_ids_value) then
    raise exception 'Primary ticket employee cannot also be an assistant'
      using errcode = '22023';
  end if;

  if p_entry ? 'attributionReason'
    and jsonb_typeof(p_entry -> 'attributionReason') not in ('string', 'null')
  then
    raise exception 'attributionReason must be a string or null'
      using errcode = '22023';
  end if;

  attribution_reason_value := nullif(btrim(p_entry ->> 'attributionReason'), '');
  if attribution_reason_value is not null and length(attribution_reason_value) > 500 then
    raise exception 'attributionReason cannot exceed 500 characters'
      using errcode = '22023';
  end if;

  -- Resolve and lock the complete employee set in UUID order before deriving
  -- activity or role facts. These SHARE locks remain held through commit, so a
  -- concurrent deactivation or role change cannot invalidate the checked
  -- attribution envelope while the write is in flight.
  for employee_lock_row in
    select
      employee.id,
      employee.is_active,
      regexp_replace(lower(btrim(role.name)), '[_-]+', ' ', 'g') as role_name
    from public.employees employee
    join public.roles role on role.id = employee.role_id
    where employee.id = any(
      array[p_actor_employee_id, primary_employee_id_value]
        || assistant_employee_ids_value
    )
    order by employee.id
    for share of employee, role
  loop
    if employee_lock_row.id = p_actor_employee_id then
      actor_employee_found := true;
      actor_is_active := employee_lock_row.is_active;
      actor_is_admin := employee_lock_row.role_name in (
        'admin', 'master admin', 'super admin'
      );
      actor_is_manager_or_admin := employee_lock_row.role_name in (
        'manager', 'admin', 'master admin', 'super admin'
      );
    end if;

    if employee_lock_row.id = primary_employee_id_value then
      primary_employee_is_active := employee_lock_row.is_active;
    end if;

    if employee_lock_row.id = any(assistant_employee_ids_value)
      and employee_lock_row.is_active
    then
      assistant_employee_active_count := assistant_employee_active_count + 1;
    end if;
  end loop;

  -- Ticketing department membership is also part of Quick-entry authority.
  -- Lock existing membership and department rows before using that fact so a
  -- concurrent removal/rename cannot revoke access midway through the write.
  for department_lock_row in
    select membership.department_id, department.name
    from public.employee_departments membership
    join public.departments department on department.id = membership.department_id
    where membership.employee_id = p_actor_employee_id
    order by membership.department_id
    for share of membership, department
  loop
    if lower(btrim(department_lock_row.name)) = 'ticketing' then
      actor_has_ticketing_department := true;
    end if;
  end loop;

  if not actor_employee_found
    or not actor_is_active
    or not (actor_is_manager_or_admin or actor_has_ticketing_department)
  then
    raise exception 'Actor is not an active authorised Ticketing employee'
      using errcode = '42501';
  end if;

  if (primary_employee_id_value <> p_actor_employee_id or assistant_count > 0)
    and attribution_reason_value is null
  then
    raise exception 'An attribution reason is required for a primary override or assistants'
      using errcode = '22023', hint = 'TICKETING_ATTRIBUTION_REASON_REQUIRED';
  end if;

  if (primary_employee_id_value <> p_actor_employee_id or assistant_count > 0)
    and not actor_is_admin
  then
    raise exception 'Only an administrator may override ticket attribution'
      using errcode = '42501';
  end if;

  business_entry := p_entry
    - 'responsibleEmployeeId'
    - 'assistantEmployeeIds'
    - 'attributionReason';

  canonical_request := jsonb_build_object(
    'entry', business_entry - 'confirmDuplicate',
    'responsibleEmployeeId', primary_employee_id_value,
    'assistantEmployeeIds', to_jsonb(assistant_employee_ids_value),
    'attributionReason', attribution_reason_value
  );

  perform pg_advisory_xact_lock(hashtextextended(
    action_name_value || ':' || p_actor_employee_id::text || ':' || idempotency_key_value,
    0
  ));

  select key_row.request_payload, key_row.response_payload
  into existing_request, existing_response
  from public.ticket_idempotency_keys key_row
  where key_row.action_name = action_name_value
    and key_row.actor_employee_id = p_actor_employee_id
    and key_row.idempotency_key = idempotency_key_value;

  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'Idempotency key was reused with different ticket attribution'
        using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
    end if;
    if existing_response is null then
      raise exception 'Attributed TK quick-entry idempotency record is incomplete'
        using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  -- Recipient activity is a new-write rule, not a replay rule. An exact retry
  -- must remain readable if a recipient is deactivated after the commit.
  if not primary_employee_is_active then
    raise exception 'Responsible employee is invalid or inactive'
      using errcode = '22023';
  end if;

  if assistant_employee_active_count <> assistant_count then
    raise exception 'One or more assistant employees are invalid or inactive'
      using errcode = '22023';
  end if;

  internal_idempotency_key := 'attrq:i:' || encode(
    digest(p_actor_employee_id::text || ':' || idempotency_key_value, 'sha256'),
    'hex'
  );

  insert into public.ticket_attribution_write_contexts (
    id,
    context_mode,
    actor_employee_id,
    primary_employee_id,
    assistant_employee_ids,
    reason
  ) values (
    context_id_value,
    'quick_create',
    p_actor_employee_id,
    primary_employee_id_value,
    assistant_employee_ids_value,
    attribution_reason_value
  );

  perform set_config(
    'ticketing.attribution_context_id',
    context_id_value::text,
    true
  );

  response_value := public.ticketing_create_quick_tk(
    p_actor_employee_id,
    internal_idempotency_key,
    business_entry
  );

  select attribution.*
  into attribution_row
  from public.ticket_booking_current_attribution attribution
  where attribution.booking_id = (response_value #>> '{booking,id}')::uuid;

  if not found
    or attribution_row.primary_employee_id <> primary_employee_id_value
    or attribution_row.entered_by_employee_id <> p_actor_employee_id
    or attribution_row.assistant_employee_ids is distinct from assistant_employee_ids_value
  then
    raise exception 'Initial ticket attribution was not recorded atomically'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  response_value := jsonb_set(
    response_value,
    '{booking}',
    (response_value -> 'booking') || jsonb_build_object(
      'ownerEmployeeId', primary_employee_id_value
    )
  ) || jsonb_build_object(
    'attribution', jsonb_build_object(
      'version', attribution_row.attribution_version,
      'primaryEmployeeId', attribution_row.primary_employee_id,
      'enteredByEmployeeId', attribution_row.entered_by_employee_id,
      'changedByEmployeeId', attribution_row.changed_by_employee_id,
      'assistantEmployeeIds', to_jsonb(attribution_row.assistant_employee_ids),
      'reason', attribution_row.reason
    ),
    'idempotentReplay', false
  );

  delete from public.ticket_attribution_write_contexts context
  where context.id = context_id_value;
  perform set_config('ticketing.attribution_context_id', '', true);

  insert into public.ticket_idempotency_keys (
    action_name,
    actor_employee_id,
    idempotency_key,
    request_payload,
    response_payload,
    completed_at
  ) values (
    action_name_value,
    p_actor_employee_id,
    idempotency_key_value,
    canonical_request,
    response_value,
    clock_timestamp()
  );

  return response_value;
end
$$;

comment on function public.ticketing_create_quick_tk_attributed(uuid, text, jsonb) is
  'Atomic Quick TK compatibility adapter that preserves the authenticated actor while recording a selected primary owner and assistants in source-event version 1.';

create or replace function public.ticketing_correct_booking_attribution(
  p_actor_employee_id uuid,
  p_booking_id uuid,
  p_expected_booking_version bigint,
  p_idempotency_key text,
  p_attribution jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  expected_keys constant text[] := array[
    'responsibleEmployeeId',
    'assistantEmployeeIds',
    'reason'
  ];
  action_name_value constant text := 'ticketing.correct_booking_attribution.v1';
  idempotency_key_value text;
  canonical_request jsonb;
  existing_request jsonb;
  existing_response jsonb;
  primary_employee_id_value uuid;
  assistant_employee_ids_value uuid[] := array[]::uuid[];
  assistant_count integer := 0;
  assistant_distinct_count integer := 0;
  reason_value text;
  unknown_key text;
  employee_lock_row record;
  actor_employee_found boolean := false;
  actor_is_active boolean := false;
  actor_is_admin boolean := false;
  primary_employee_is_active boolean := false;
  assistant_employee_active_count integer := 0;
  booking_row public.ticket_bookings%rowtype;
  current_attribution public.ticket_booking_attribution_versions%rowtype;
  current_assistant_ids uuid[] := array[]::uuid[];
  next_attribution_id uuid := gen_random_uuid();
  next_attribution_version integer;
  assistant_id uuid;
  assistant_position integer := 0;
  context_id_value uuid := gen_random_uuid();
  audit_event_id_value uuid := gen_random_uuid();
  source_event_row public.commission_source_events%rowtype;
  source_event_id_value uuid;
  source_event_key text;
  source_event_result jsonb;
  source_event_corrections jsonb := '[]'::jsonb;
  response_value jsonb;
  booking_version_value bigint;
  now_value timestamptz := clock_timestamp();
begin
  if p_actor_employee_id is null then
    raise exception 'Authenticated administrator required'
      using errcode = '42501';
  end if;

  if p_booking_id is null then
    raise exception 'Ticket booking ID is required'
      using errcode = '22023';
  end if;

  if p_expected_booking_version is null or p_expected_booking_version < 1 then
    raise exception 'A valid expected booking version is required'
      using errcode = '22023';
  end if;

  idempotency_key_value := btrim(coalesce(p_idempotency_key, ''));
  if length(idempotency_key_value) not between 1 and 200 then
    raise exception 'A valid idempotency key is required'
      using errcode = '22023';
  end if;

  if p_attribution is null or jsonb_typeof(p_attribution) is distinct from 'object' then
    raise exception 'Ticket attribution correction must be a JSON object'
      using errcode = '22023';
  end if;

  select supplied.key
  into unknown_key
  from jsonb_object_keys(p_attribution) supplied(key)
  where supplied.key <> all(expected_keys)
  limit 1;

  if found then
    raise exception 'Unknown ticket attribution correction field: %', unknown_key
      using errcode = '22023';
  end if;

  if not p_attribution ?& expected_keys
    or jsonb_typeof(p_attribution -> 'responsibleEmployeeId') is distinct from 'string'
    or jsonb_typeof(p_attribution -> 'assistantEmployeeIds') is distinct from 'array'
    or jsonb_typeof(p_attribution -> 'reason') is distinct from 'string'
  then
    raise exception 'Ticket attribution correction fields are missing or invalid'
      using errcode = '22023';
  end if;

  begin
    primary_employee_id_value := (p_attribution ->> 'responsibleEmployeeId')::uuid;
  exception when invalid_text_representation then
    raise exception 'responsibleEmployeeId must be a valid UUID'
      using errcode = '22023';
  end;

  if exists (
    select 1
    from jsonb_array_elements(p_attribution -> 'assistantEmployeeIds') item(value)
    where jsonb_typeof(item.value) is distinct from 'string'
  ) then
    raise exception 'Each assistantEmployeeIds value must be a UUID string'
      using errcode = '22023';
  end if;

  begin
    select
      coalesce(array_agg(parsed.employee_id order by parsed.employee_id), array[]::uuid[]),
      count(*)::integer,
      count(distinct parsed.employee_id)::integer
    into
      assistant_employee_ids_value,
      assistant_count,
      assistant_distinct_count
    from (
      select (item.value #>> '{}')::uuid as employee_id
      from jsonb_array_elements(p_attribution -> 'assistantEmployeeIds') item(value)
    ) parsed;
  exception when invalid_text_representation then
    raise exception 'assistantEmployeeIds contains an invalid UUID'
      using errcode = '22023';
  end;

  reason_value := nullif(btrim(p_attribution ->> 'reason'), '');

  if assistant_count > 10 then
    raise exception 'A ticket may have at most 10 assistants'
      using errcode = '22023';
  end if;

  if assistant_count <> assistant_distinct_count then
    raise exception 'assistantEmployeeIds must be unique'
      using errcode = '22023';
  end if;

  if primary_employee_id_value = any(assistant_employee_ids_value) then
    raise exception 'Primary ticket employee cannot also be an assistant'
      using errcode = '22023';
  end if;

  if reason_value is null or length(reason_value) > 500 then
    raise exception 'A correction reason between 1 and 500 characters is required'
      using errcode = '22023', hint = 'TICKETING_ATTRIBUTION_REASON_REQUIRED';
  end if;

  -- Use one stable lock order for the actor and every selected recipient. Role
  -- and activity decisions are derived from these locked rows, preventing a
  -- concurrent demotion/deactivation from racing the correction commit.
  for employee_lock_row in
    select
      employee.id,
      employee.is_active,
      regexp_replace(lower(btrim(role.name)), '[_-]+', ' ', 'g') as role_name
    from public.employees employee
    join public.roles role on role.id = employee.role_id
    where employee.id = any(
      array[p_actor_employee_id, primary_employee_id_value]
        || assistant_employee_ids_value
    )
    order by employee.id
    for share of employee, role
  loop
    if employee_lock_row.id = p_actor_employee_id then
      actor_employee_found := true;
      actor_is_active := employee_lock_row.is_active;
      actor_is_admin := employee_lock_row.role_name in (
        'admin', 'master admin', 'super admin'
      );
    end if;

    if employee_lock_row.id = primary_employee_id_value then
      primary_employee_is_active := employee_lock_row.is_active;
    end if;

    if employee_lock_row.id = any(assistant_employee_ids_value)
      and employee_lock_row.is_active
    then
      assistant_employee_active_count := assistant_employee_active_count + 1;
    end if;
  end loop;

  if not actor_employee_found or not actor_is_active or not actor_is_admin then
    raise exception 'Only an active administrator may correct ticket attribution'
      using errcode = '42501';
  end if;

  canonical_request := jsonb_build_object(
    'bookingId', p_booking_id,
    'expectedBookingVersion', p_expected_booking_version,
    'responsibleEmployeeId', primary_employee_id_value,
    'assistantEmployeeIds', to_jsonb(assistant_employee_ids_value),
    'reason', reason_value
  );

  perform pg_advisory_xact_lock(hashtextextended(
    action_name_value || ':' || p_actor_employee_id::text || ':' || idempotency_key_value,
    0
  ));

  select key_row.request_payload, key_row.response_payload
  into existing_request, existing_response
  from public.ticket_idempotency_keys key_row
  where key_row.action_name = action_name_value
    and key_row.actor_employee_id = p_actor_employee_id
    and key_row.idempotency_key = idempotency_key_value;

  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'Idempotency key was reused with a different attribution correction'
        using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
    end if;
    if existing_response is null then
      raise exception 'Ticket attribution idempotency record is incomplete'
        using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  if not primary_employee_is_active then
    raise exception 'Responsible employee is invalid or inactive'
      using errcode = '22023';
  end if;

  if assistant_employee_active_count <> assistant_count then
    raise exception 'One or more assistant employees are invalid or inactive'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'ticketing.attribution.booking:' || p_booking_id::text,
    0
  ));

  select booking.*
  into booking_row
  from public.ticket_bookings booking
  where booking.id = p_booking_id
  for update;

  if not found then
    raise exception 'Ticket record not found'
      using errcode = 'P0002', hint = 'TICKETING_RECORD_NOT_FOUND';
  end if;

  if booking_row.version <> p_expected_booking_version then
    raise exception 'Ticket booking version is stale'
      using
        errcode = '40001',
        detail = jsonb_build_object('bookingVersion', booking_row.version)::text,
        hint = 'TICKETING_VERSION_CONFLICT';
  end if;

  select attribution.*
  into current_attribution
  from public.ticket_booking_attribution_versions attribution
  where attribution.booking_id = booking_row.id
  order by attribution.attribution_version desc
  limit 1
  for update;

  if not found then
    raise exception 'Ticket attribution history is missing'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  select coalesce(
    array_agg(assistant.employee_id order by assistant.sort_order),
    array[]::uuid[]
  )
  into current_assistant_ids
  from public.ticket_booking_attribution_assistants assistant
  where assistant.attribution_id = current_attribution.id;

  if current_attribution.primary_employee_id = primary_employee_id_value
    and current_assistant_ids is not distinct from assistant_employee_ids_value
  then
    raise exception 'Ticket attribution correction does not change the primary or assistants'
      using errcode = '22023', hint = 'TICKETING_ATTRIBUTION_NO_CHANGE';
  end if;

  next_attribution_version := current_attribution.attribution_version + 1;

  insert into public.ticket_attribution_write_contexts (
    id,
    context_mode,
    actor_employee_id,
    primary_employee_id,
    assistant_employee_ids,
    booking_id,
    reason
  ) values (
    context_id_value,
    'correction',
    p_actor_employee_id,
    primary_employee_id_value,
    assistant_employee_ids_value,
    booking_row.id,
    reason_value
  );

  perform set_config(
    'ticketing.attribution_context_id',
    context_id_value::text,
    true
  );

  set constraints
    ticket_transactions_validate_owner_alignment,
    ticket_bookings_validate_transaction_owner_alignment
    deferred;

  if current_attribution.primary_employee_id <> primary_employee_id_value then
    update public.ticket_transactions transaction
    set owner_employee_id = primary_employee_id_value
    where transaction.booking_id = booking_row.id;

    update public.ticket_bookings booking
    set owner_employee_id = primary_employee_id_value,
        updated_by = p_actor_employee_id
    where booking.id = booking_row.id;
  else
    update public.ticket_bookings booking
    set updated_by = p_actor_employee_id
    where booking.id = booking_row.id;
  end if;

  set constraints
    ticket_transactions_validate_owner_alignment,
    ticket_bookings_validate_transaction_owner_alignment
    immediate;

  insert into public.ticket_booking_attribution_versions (
    id,
    booking_id,
    root_transaction_id,
    attribution_version,
    supersedes_attribution_id,
    change_kind,
    primary_employee_id,
    entered_by_employee_id,
    changed_by_employee_id,
    reason,
    created_at
  ) values (
    next_attribution_id,
    booking_row.id,
    current_attribution.root_transaction_id,
    next_attribution_version,
    current_attribution.id,
    'correction',
    primary_employee_id_value,
    current_attribution.entered_by_employee_id,
    p_actor_employee_id,
    reason_value,
    now_value
  );

  foreach assistant_id in array assistant_employee_ids_value
  loop
    assistant_position := assistant_position + 1;
    insert into public.ticket_booking_attribution_assistants (
      attribution_id,
      booking_id,
      employee_id,
      sort_order,
      created_at
    ) values (
      next_attribution_id,
      booking_row.id,
      assistant_id,
      assistant_position,
      now_value
    );
  end loop;

  for source_event_row in
    select distinct on (source_event.source_fact_key) source_event.*
    from public.commission_source_events source_event
    join public.ticket_transactions transaction
      on transaction.id = source_event.source_record_id
    where source_event.source_module = 'ticketing'
      and transaction.booking_id = booking_row.id
      and transaction.id = current_attribution.root_transaction_id
      and transaction.service_type = 'TK'
      and transaction.parent_transaction_id is null
      and source_event.source_fact_key =
        'transaction:' || source_event.source_record_id::text || ':issued'
    order by source_event.source_fact_key, source_event.event_version desc
  loop
    source_event_id_value := gen_random_uuid();
    source_event_key := 'attrc:v1:' || encode(
      digest(
        p_actor_employee_id::text || ':' || idempotency_key_value || ':'
          || source_event_row.source_fact_key || ':'
          || (source_event_row.event_version + 1)::text,
        'sha256'
      ),
      'hex'
    );

    source_event_result := public.append_commission_source_event(
      jsonb_build_object(
        'source_module', source_event_row.source_module,
        'source_event_id', source_event_id_value,
        'source_fact_key', source_event_row.source_fact_key,
        'source_record_id', source_event_row.source_record_id,
        'event_type', source_event_row.event_type,
        'contract_version', source_event_row.contract_version,
        'event_version', source_event_row.event_version + 1,
        'supersedes_event_id', source_event_row.source_event_id,
        'employee_id', primary_employee_id_value,
        'owner_employee_id', primary_employee_id_value,
        'location_id', source_event_row.location_id,
        'occurred_at', now_value,
        'effective_on', source_event_row.effective_on,
        'source_path', source_event_row.source_path,
        'variables', source_event_row.variables || jsonb_build_object(
          'acting_employee_id', (
            select transaction.acting_employee_id
            from public.ticket_transactions transaction
            where transaction.id = source_event_row.source_record_id
          ),
          'primary_responsible_employee_id', primary_employee_id_value,
          'assistant_employee_ids', to_jsonb(assistant_employee_ids_value),
          'issued_ticket_target_units', (
            select transaction.passenger_ticket_count
            from public.ticket_transactions transaction
            where transaction.id = source_event_row.source_record_id
          ),
          'assistant_target_units', 0
        ),
        'idempotency_key', source_event_key
      )
    );

    source_event_corrections := source_event_corrections || jsonb_build_array(
      jsonb_build_object(
        'sourceFactKey', source_event_row.source_fact_key,
        'sourceEventId', source_event_result ->> 'sourceEventId',
        'eventVersion', (source_event_result ->> 'eventVersion')::integer
      )
    );
  end loop;

  insert into public.ticket_audit_events (
    id,
    entity_type,
    entity_id,
    booking_id,
    transaction_id,
    action,
    actor_employee_id,
    reason,
    before_state,
    after_state,
    created_at
  ) values (
    audit_event_id_value,
    'booking',
    booking_row.id,
    booking_row.id,
    current_attribution.root_transaction_id,
    'correct_ticket_attribution',
    p_actor_employee_id,
    reason_value,
    jsonb_build_object(
      'attribution_version', current_attribution.attribution_version,
      'primary_employee_id', current_attribution.primary_employee_id,
      'entered_by_employee_id', current_attribution.entered_by_employee_id,
      'assistant_employee_ids', to_jsonb(current_assistant_ids)
    ),
    jsonb_build_object(
      'attribution_version', next_attribution_version,
      'primary_employee_id', primary_employee_id_value,
      'entered_by_employee_id', current_attribution.entered_by_employee_id,
      'changed_by_employee_id', p_actor_employee_id,
      'assistant_employee_ids', to_jsonb(assistant_employee_ids_value),
      'issued_ticket_target_rule', 'primary_only',
      'assistant_target_units', 0,
      'source_event_corrections', source_event_corrections
    ),
    now_value
  );

  delete from public.ticket_attribution_write_contexts context
  where context.id = context_id_value;
  perform set_config('ticketing.attribution_context_id', '', true);

  select booking.version
  into booking_version_value
  from public.ticket_bookings booking
  where booking.id = booking_row.id;

  response_value := jsonb_build_object(
    'bookingId', booking_row.id,
    'bookingVersion', booking_version_value,
    'attribution', jsonb_build_object(
      'version', next_attribution_version,
      'primaryEmployeeId', primary_employee_id_value,
      'enteredByEmployeeId', current_attribution.entered_by_employee_id,
      'changedByEmployeeId', p_actor_employee_id,
      'assistantEmployeeIds', to_jsonb(assistant_employee_ids_value),
      'reason', reason_value
    ),
    'auditEventId', audit_event_id_value,
    'sourceEventCorrections', source_event_corrections,
    'idempotentReplay', false
  );

  insert into public.ticket_idempotency_keys (
    action_name,
    actor_employee_id,
    idempotency_key,
    request_payload,
    response_payload,
    completed_at
  ) values (
    action_name_value,
    p_actor_employee_id,
    idempotency_key_value,
    canonical_request,
    response_value,
    clock_timestamp()
  );

  return response_value;
end
$$;

comment on function public.ticketing_correct_booking_attribution(uuid, uuid, bigint, text, jsonb) is
  'Administrator-only idempotent correction of primary/assistant attribution with immutable history, owner alignment, audit, and issued source-event supersession.';

alter table public.ticket_attribution_write_contexts enable row level security;
alter table public.ticket_booking_attribution_versions enable row level security;
alter table public.ticket_booking_attribution_assistants enable row level security;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname, tablename
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in (
        'ticket_attribution_write_contexts',
        'ticket_booking_attribution_versions',
        'ticket_booking_attribution_assistants'
      )
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      policy_row.policyname,
      policy_row.tablename
    );
  end loop;
end
$$;

create policy "Service role reads ticket attribution versions"
  on public.ticket_booking_attribution_versions
  for select
  to service_role
  using (true);

create policy "Service role reads ticket attribution assistants"
  on public.ticket_booking_attribution_assistants
  for select
  to service_role
  using (true);

revoke all on table public.ticket_attribution_write_contexts
  from public, anon, authenticated, service_role;
revoke all on table public.ticket_booking_attribution_versions
  from public, anon, authenticated, service_role;
revoke all on table public.ticket_booking_attribution_assistants
  from public, anon, authenticated, service_role;

grant select on table public.ticket_booking_attribution_versions
  to service_role;
grant select on table public.ticket_booking_attribution_assistants
  to service_role;

revoke all on table public.ticket_booking_current_attribution
  from public, anon, authenticated, service_role;
grant select on table public.ticket_booking_current_attribution
  to service_role;

revoke all on function public.ticketing_uuid_array_is_unique_2026082402(uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.validate_ticket_booking_attribution_version_2026082402()
  from public, anon, authenticated, service_role;
revoke all on function public.validate_ticket_booking_attribution_assistant_2026082402()
  from public, anon, authenticated, service_role;
revoke all on function public.ticketing_context_id_2026082402()
  from public, anon, authenticated, service_role;
revoke all on function public.ticketing_apply_initial_booking_attribution_2026082402()
  from public, anon, authenticated, service_role;
revoke all on function public.ticketing_apply_initial_transaction_attribution_2026082402()
  from public, anon, authenticated, service_role;
revoke all on function public.ticketing_record_initial_attribution_2026082402()
  from public, anon, authenticated, service_role;
revoke all on function public.ticketing_owner_correction_context_matches_2026082402(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.protect_ticket_booking_attribution_owner_2026082402()
  from public, anon, authenticated, service_role;
revoke all on function public.protect_ticket_transaction_attribution_owner_2026082402()
  from public, anon, authenticated, service_role;
revoke all on function public.protect_ticket_transaction_history()
  from public, anon, authenticated, service_role;
revoke all on function public.enrich_ticketing_source_event_attribution_2026082402()
  from public, anon, authenticated, service_role;

revoke all on function public.ticketing_create_quick_tk_attributed(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ticketing_create_quick_tk_attributed(uuid, text, jsonb)
  to service_role;

revoke all on function public.ticketing_correct_booking_attribution(uuid, uuid, bigint, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ticketing_correct_booking_attribution(uuid, uuid, bigint, text, jsonb)
  to service_role;

-- The legacy RPC remains callable for compatibility, but its root-transaction
-- trigger now guarantees a version-1 attribution row and source-event target
-- facts. It can no longer create a silent post-ratchet bypass.
revoke all on function public.ticketing_create_quick_tk(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ticketing_create_quick_tk(uuid, text, jsonb)
  to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026082402,
  now(),
  jsonb_build_object(
    'migration', '20260824_ticketing_attribution_overrides.sql',
    'capabilities', coalesce(
      (
        select schema_version.details -> 'capabilities'
        from public.portal_schema_versions schema_version
        where schema_version.component = 'ticketing'
          and jsonb_typeof(schema_version.details -> 'capabilities') = 'array'
      ),
      '[]'::jsonb
    ) || jsonb_build_array(
      'primary-ticket-attribution',
      'assistant-attribution-with-zero-target-units',
      'root-tk-only-assistant-attribution',
      'primary-only-issued-ticket-target-units',
      'immutable-attribution-history',
      'audited-attribution-corrections',
      'versioned-issued-event-attribution-corrections',
      'legacy-quick-entry-attribution-invariant'
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
    'ready', coalesce(version >= 2026082402, false),
    'version', version,
    'requiredVersion', greatest(version, 2026082402),
    'appliedAt', applied_at,
    'details', details
  )
  from public.portal_schema_versions
  where component = 'ticketing'
$$;

revoke all on function public.ticketing_schema_status()
  from public, anon, authenticated;
grant execute on function public.ticketing_schema_status()
  to service_role;

commit;
