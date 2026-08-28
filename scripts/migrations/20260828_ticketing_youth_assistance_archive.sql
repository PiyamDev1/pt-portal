-- Forward-only Ticketing capability 2026082801.
-- Adds YTH fares/passengers, permits agents to record assistants on their own
-- TK sales, and adds an audited booking archive boundary.

begin;

select pg_advisory_xact_lock(hashtextextended('ticketing:schema-migration', 0));

do $guard$
declare installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'ticketing'
  for update;

  if installed_version > 2026082801 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026082801, installed_version
      using errcode = '55000', hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
  if installed_version is null or installed_version < 2026082703 then
    raise exception 'Ticketing capability 2026082703 is required before capability 2026082801'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
end
$guard$;

alter table public.ticket_passenger_fare_lines
  drop constraint if exists ticket_passenger_fare_lines_type_check;
alter table public.ticket_passenger_fare_lines
  add constraint ticket_passenger_fare_lines_type_check
  check (passenger_type in ('ADT', 'YTH', 'CHD', 'INF'));

alter table public.ticket_passengers
  drop constraint if exists ticket_passengers_type_check;
alter table public.ticket_passengers
  add constraint ticket_passengers_type_check
  check (passenger_type in ('ADT', 'YTH', 'CHD', 'INF'));

alter table public.ticket_passenger_fare_lines
  add column if not exists unit_gross_sale_price_source numeric(14,2),
  add column if not exists unit_gross_sale_price_gbp numeric(14,2),
  add column if not exists unit_discount_source numeric(14,2) not null default 0,
  add column if not exists unit_discount_gbp numeric(14,2) not null default 0;

alter table public.ticket_passenger_fare_lines
  drop constraint if exists ticket_passenger_fare_lines_discount_check;
alter table public.ticket_passenger_fare_lines
  add constraint ticket_passenger_fare_lines_discount_check check (
    unit_discount_source >= 0 and unit_discount_gbp >= 0
    and (unit_gross_sale_price_source is null or unit_gross_sale_price_source >= unit_discount_source)
    and (unit_gross_sale_price_gbp is null or unit_gross_sale_price_gbp >= unit_discount_gbp)
    and (currency <> 'GBP' or (
      unit_gross_sale_price_source is not distinct from unit_gross_sale_price_gbp
      and unit_discount_source = unit_discount_gbp
    ))
  );

-- Extend the installed function bodies without duplicating several thousand
-- lines of the already-versioned atomic boundaries. Every replacement is
-- asserted so a future source change fails closed instead of silently drifting.
do $extend_passenger_contracts$
declare
  signature regprocedure;
  definition text;
  updated_definition text;
begin
  foreach signature in array array[
    'public.ticketing_create_quick_tk(uuid,text,jsonb)'::regprocedure,
    'public.ticketing_complete_tk_details(uuid,uuid,text,jsonb)'::regprocedure,
    'public.ticketing_complete_tk_details_authorized(uuid,uuid,text,jsonb)'::regprocedure,
    'public.ticketing_append_service_transaction_core_2026082303(uuid,uuid,text,jsonb)'::regprocedure
  ] loop
    definition := pg_get_functiondef(signature);
    updated_definition := replace(
      replace(definition,
        $types$('ADT', 'CHD', 'INF')$types$,
        $types$('ADT', 'YTH', 'CHD', 'INF')$types$),
      'not between 1 and 3', 'not between 1 and 4'
    );
    if updated_definition = definition
      and position($types$('ADT', 'YTH', 'CHD', 'INF')$types$ in definition) = 0
    then
      raise exception 'Passenger contract extension did not match function %', signature
        using errcode = '55000', hint = 'TICKETING_SCHEMA_DRIFT';
    end if;
    execute updated_definition;
  end loop;
end
$extend_passenger_contracts$;

-- An agent may add assistants only while remaining the responsible employee.
-- Selecting another responsible employee remains an administrator-only action.
do $extend_assistance_boundary$
declare
  signature constant regprocedure :=
    'public.ticketing_create_quick_tk_attributed(uuid,text,jsonb)'::regprocedure;
  definition text;
  updated_definition text;
begin
  definition := pg_get_functiondef(signature);
  updated_definition := replace(
    replace(
      definition,
      '(primary_employee_id_value <> p_actor_employee_id or assistant_count > 0)
    and attribution_reason_value is null',
      'primary_employee_id_value <> p_actor_employee_id
    and attribution_reason_value is null'
    ),
    '(primary_employee_id_value <> p_actor_employee_id or assistant_count > 0)
    and not actor_is_admin',
    'primary_employee_id_value <> p_actor_employee_id
    and not actor_is_admin'
  );
  if position('(primary_employee_id_value <> p_actor_employee_id or assistant_count > 0)'
      in updated_definition) > 0
  then
    raise exception 'Assistance boundary extension did not match the installed function'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_DRIFT';
  end if;
  execute updated_definition;
end
$extend_assistance_boundary$;

create table if not exists public.ticket_initial_pricing_contexts (
  id uuid primary key default gen_random_uuid(),
  actor_employee_id uuid not null references public.employees(id) on delete restrict,
  transaction_id uuid not null references public.ticket_transactions(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp()
);

create or replace function public.ticketing_initial_pricing_context_matches_2026082801(
  p_transaction_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
  select exists (
    select 1 from public.ticket_initial_pricing_contexts context
    where context.id::text = nullif(current_setting('ticketing.initial_pricing_context_id', true), '')
      and context.transaction_id = p_transaction_id
  )
$$;

do $extend_initial_pricing_guard$
declare
  signature constant regprocedure := 'public.protect_ticket_transaction_history()'::regprocedure;
  definition text;
  updated_definition text;
begin
  definition := pg_get_functiondef(signature);
  if position('ticketing_initial_pricing_context_matches_2026082801' in definition) > 0 then
    return;
  end if;
  updated_definition := replace(
    definition,
    'and not valid_owner_correction',
    'and not valid_owner_correction
    and not public.ticketing_initial_pricing_context_matches_2026082801(old.id)'
  );
  if updated_definition = definition then
    raise exception 'Initial pricing guard did not match transaction history protection'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_DRIFT';
  end if;
  execute updated_definition;
end
$extend_initial_pricing_guard$;

create or replace function public.ticketing_create_quick_tk_priced(
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
  action_name_value constant text := 'ticketing.quick_create_tk_priced.v1';
  idempotency_key_value text := btrim(coalesce(p_idempotency_key, ''));
  canonical_request jsonb;
  existing_request jsonb;
  existing_response jsonb;
  business_fares jsonb;
  business_entry jsonb;
  response_value jsonb;
  transaction_id_value uuid;
  context_id_value uuid := gen_random_uuid();
  net_sale_total numeric(14,2);
  pricing_value jsonb;
  source_event_row public.commission_source_events%rowtype;
begin
  if p_entry is null or jsonb_typeof(p_entry) <> 'object'
    or jsonb_typeof(p_entry -> 'fares') <> 'array'
    or length(idempotency_key_value) not between 1 and 200
  then
    raise exception 'Valid priced TK quick entry required' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_entry -> 'fares') fare(value)
    where jsonb_typeof(fare.value -> 'unitSalePrice') <> 'number'
      or jsonb_typeof(fare.value -> 'unitDiscount') <> 'number'
      or (fare.value ->> 'unitSalePrice')::numeric < 0
      or (fare.value ->> 'unitDiscount')::numeric < 0
      or (fare.value ->> 'unitDiscount')::numeric > (fare.value ->> 'unitSalePrice')::numeric
      or scale((fare.value ->> 'unitSalePrice')::numeric) > 2
      or scale((fare.value ->> 'unitDiscount')::numeric) > 2
  ) then
    raise exception 'Fare sale price and discount are invalid' using errcode = '22023';
  end if;

  canonical_request := p_entry - 'confirmDuplicate';
  perform pg_advisory_xact_lock(hashtextextended(
    action_name_value || ':' || p_actor_employee_id::text || ':' || idempotency_key_value, 0
  ));
  select request_payload, response_payload into existing_request, existing_response
  from public.ticket_idempotency_keys
  where action_name = action_name_value
    and actor_employee_id = p_actor_employee_id
    and idempotency_key = idempotency_key_value;
  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'Idempotency key was reused with different priced ticket details'
        using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  select jsonb_agg(fare.value - 'unitSalePrice' - 'unitDiscount')
  into business_fares
  from jsonb_array_elements(p_entry -> 'fares') fare(value);
  business_entry := jsonb_set(p_entry, '{fares}', business_fares, false);
  response_value := public.ticketing_create_quick_tk_attributed(
    p_actor_employee_id,
    'priced:' || encode(digest(
      p_actor_employee_id::text || ':' || idempotency_key_value, 'sha256'
    ), 'hex'),
    business_entry
  );
  transaction_id_value := (response_value #>> '{transaction,id}')::uuid;

  insert into public.ticket_initial_pricing_contexts (id, actor_employee_id, transaction_id)
  values (context_id_value, p_actor_employee_id, transaction_id_value);
  perform set_config('ticketing.initial_pricing_context_id', context_id_value::text, true);

  update public.ticket_passenger_fare_lines fare_line
  set unit_gross_sale_price_source = (fare.value ->> 'unitSalePrice')::numeric(14,2),
      unit_gross_sale_price_gbp = (fare.value ->> 'unitSalePrice')::numeric(14,2),
      unit_discount_source = (fare.value ->> 'unitDiscount')::numeric(14,2),
      unit_discount_gbp = (fare.value ->> 'unitDiscount')::numeric(14,2),
      unit_sale_price_source = (
        (fare.value ->> 'unitSalePrice')::numeric - (fare.value ->> 'unitDiscount')::numeric
      )::numeric(14,2),
      unit_sale_price_gbp = (
        (fare.value ->> 'unitSalePrice')::numeric - (fare.value ->> 'unitDiscount')::numeric
      )::numeric(14,2)
  from jsonb_array_elements(p_entry -> 'fares') fare(value)
  where fare_line.transaction_id = transaction_id_value
    and fare_line.passenger_type = fare.value ->> 'passengerType';

  select sum(fare_line.sale_total_source)::numeric(14,2),
    coalesce(jsonb_agg(jsonb_build_object(
      'passengerType', fare_line.passenger_type,
      'quantity', fare_line.quantity,
      'unitSalePrice', fare_line.unit_gross_sale_price_source,
      'unitDiscount', fare_line.unit_discount_source,
      'unitPayablePrice', fare_line.unit_sale_price_source
    ) order by fare_line.passenger_type), '[]'::jsonb)
  into net_sale_total, pricing_value
  from public.ticket_passenger_fare_lines fare_line
  where fare_line.transaction_id = transaction_id_value;

  update public.ticket_transactions
  set sale_price_source = net_sale_total, sale_price_gbp = net_sale_total
  where id = transaction_id_value;

  select distinct on (source_event.source_fact_key) source_event.*
  into source_event_row
  from public.commission_source_events source_event
  where source_event.source_module = 'ticketing'
    and source_event.source_fact_key = 'transaction:' || transaction_id_value::text || ':issued'
  order by source_event.source_fact_key, source_event.event_version desc;
  if found then
    perform public.append_commission_source_event(jsonb_build_object(
      'source_module', source_event_row.source_module,
      'source_event_id', gen_random_uuid(),
      'source_fact_key', source_event_row.source_fact_key,
      'source_record_id', source_event_row.source_record_id,
      'event_type', source_event_row.event_type,
      'contract_version', source_event_row.contract_version,
      'event_version', source_event_row.event_version + 1,
      'supersedes_event_id', source_event_row.source_event_id,
      'employee_id', source_event_row.employee_id,
      'owner_employee_id', source_event_row.owner_employee_id,
      'location_id', source_event_row.location_id,
      'occurred_at', clock_timestamp(),
      'effective_on', source_event_row.effective_on,
      'source_path', source_event_row.source_path,
      'variables', source_event_row.variables || jsonb_build_object(
        'sale_price_source', net_sale_total, 'sale_price_gbp', net_sale_total,
        'fare_prices', pricing_value
      ),
      'idempotency_key', 'priced:' || transaction_id_value::text
    ));
  end if;

  delete from public.ticket_initial_pricing_contexts where id = context_id_value;
  perform set_config('ticketing.initial_pricing_context_id', '', true);

  insert into public.ticket_idempotency_keys (
    action_name, actor_employee_id, idempotency_key, request_payload,
    response_payload, completed_at
  ) values (
    action_name_value, p_actor_employee_id, idempotency_key_value,
    canonical_request, response_value, clock_timestamp()
  );
  return response_value;
end
$$;

revoke all on table public.ticket_initial_pricing_contexts
  from public, anon, authenticated, service_role;
revoke all on function public.ticketing_create_quick_tk_priced(uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.ticketing_create_quick_tk_priced(uuid,text,jsonb) to service_role;

do $exclude_archives_from_attribution_enrichment$
declare
  signature constant regprocedure :=
    'public.enrich_ticketing_source_event_attribution_2026082403()'::regprocedure;
  definition text;
  updated_definition text;
begin
  definition := pg_get_functiondef(signature);
  if position($archive$new.event_type = 'ticket_entry_archived'$archive$ in definition) > 0 then
    return;
  end if;
  updated_definition := replace(
    definition,
    $archive$if new.source_module <> 'ticketing'$archive$,
    $archive$if new.event_type = 'ticket_entry_archived'
    or new.source_module <> 'ticketing'$archive$
  );
  if updated_definition = definition then
    raise exception 'Archive exclusion did not match attribution source enrichment'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_DRIFT';
  end if;
  execute updated_definition;
end
$exclude_archives_from_attribution_enrichment$;

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
as $$
declare
  booking_row public.ticket_bookings%rowtype;
  actor_row record;
  reason_value text := nullif(btrim(p_reason), '');
  source_event_row public.commission_source_events%rowtype;
begin
  if p_actor_employee_id is null or p_booking_id is null
    or reason_value is null or length(reason_value) > 500
  then
    raise exception 'A booking and archive reason are required'
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
    return jsonb_build_object('bookingId', p_booking_id, 'archived', true, 'idempotentReplay', true);
  end if;
  if booking_row.owner_employee_id <> p_actor_employee_id
    and actor_row.role_name not in ('admin', 'master admin', 'super admin')
  then
    raise exception 'Only the responsible employee or an administrator may archive this ticket'
      using errcode = '42501';
  end if;

  update public.ticket_bookings
  set archived_at = clock_timestamp(), updated_by = p_actor_employee_id
  where id = p_booking_id;

  insert into public.ticket_audit_events (
    entity_type, entity_id, booking_id, action, actor_employee_id, reason,
    before_state, after_state
  ) values (
    'booking', p_booking_id, p_booking_id, 'ticket_booking_archived',
    p_actor_employee_id, reason_value,
    jsonb_build_object('archived_at', booking_row.archived_at),
    jsonb_build_object('archived_at', clock_timestamp())
  );

  for source_event_row in
    select distinct on (source_event.source_fact_key) source_event.*
    from public.commission_source_events source_event
    join public.ticket_transactions transaction
      on transaction.id = source_event.source_record_id
    where source_event.source_module = 'ticketing'
      and transaction.booking_id = p_booking_id
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
      'occurred_at', clock_timestamp(),
      'effective_on', current_date,
      'source_path', '/ticketing/ledger',
      'variables', source_event_row.variables || jsonb_build_object(
        'archived', true, 'archive_reason', reason_value,
        'issued_ticket_target_units', 0, 'assistant_target_units', 0
      ),
      'idempotency_key', 'archive:' || p_booking_id::text || ':' || source_event_row.id::text
    ));
  end loop;

  return jsonb_build_object('bookingId', p_booking_id, 'archived', true, 'idempotentReplay', false);
end
$$;

revoke all on function public.ticketing_archive_booking(uuid,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.ticketing_archive_booking(uuid,uuid,text) to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing', 2026082801, now(),
  coalesce((select details from public.portal_schema_versions where component = 'ticketing'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260828_ticketing_youth_assistance_archive.sql',
      'capabilities', coalesce((
        select details -> 'capabilities' from public.portal_schema_versions
        where component = 'ticketing' and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array(
        'yth-passenger-fares', 'agent-recorded-assistance', 'audited-ticket-archive',
        'quick-entry-sale-price-discount'
      )
    )
)
on conflict (component) do update
set version = excluded.version, applied_at = excluded.applied_at, details = excluded.details
where public.portal_schema_versions.version < excluded.version;

create or replace function public.ticketing_schema_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'ready', coalesce(schema_version.version >= 2026082801, false)
      and to_regprocedure('public.ticketing_archive_booking(uuid,uuid,text)') is not null
      and to_regprocedure('public.ticketing_create_quick_tk_priced(uuid,text,jsonb)') is not null
      and to_regprocedure('public.ticketing_append_service_transaction_allocated(uuid,uuid,text,jsonb)') is not null,
    'version', schema_version.version,
    'requiredVersion', greatest(schema_version.version, 2026082801),
    'appliedAt', schema_version.applied_at,
    'details', schema_version.details
  )
  from public.portal_schema_versions schema_version
  where component = 'ticketing'
$$;

revoke all on function public.ticketing_schema_status() from public, anon, authenticated;
grant execute on function public.ticketing_schema_status() to service_role;

commit;
