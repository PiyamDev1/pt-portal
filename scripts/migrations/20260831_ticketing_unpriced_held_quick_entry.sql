-- Forward-only Ticketing capability 2026083101.
-- Allows Held quick-entry bookings to remain unpriced and exact package matches to use the
-- accepted quotation's passenger-level flight prices instead of client-entered sale values.

begin;

select pg_advisory_xact_lock(hashtextextended('ticketing:schema-migration', 0));

do $ticketing_unpriced_held_forward_guard$
declare
  installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'ticketing'
  for update;

  if installed_version is null or installed_version < 2026083001 then
    raise exception 'Ticketing capability 2026083001 is required before unpriced Held capability 2026083101'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
  if installed_version > 2026083101 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026083101, installed_version
      using errcode = '55000', hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$ticketing_unpriced_held_forward_guard$;

create or replace function public.ticketing_package_quote_pricing_2026083101(
  p_booking_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  package_id_value uuid;
  reservation_id_value uuid;
  package_reference_value text;
  snapshot_value jsonb;
  reservation_metadata jsonb;
  combination_value jsonb;
  payload_value jsonb;
  option_value jsonb;
  linked_selection jsonb;
  service_passengers integer;
  quoted_children integer;
  option_price numeric;
  adult_price numeric;
  child_price numeric;
  infant_price numeric;
begin
  select
    package.id,
    link.reservation_id,
    package.package_reference,
    package.selected_quote_snapshot,
    coalesce(reservation.metadata, '{}'::jsonb)
  into
    package_id_value,
    reservation_id_value,
    package_reference_value,
    snapshot_value,
    reservation_metadata
  from public.ticket_package_links link
  join public.travel_packages package on package.id = link.package_id
  left join public.travel_package_reservations reservation on reservation.id = link.reservation_id
  where link.booking_id = p_booking_id
    and link.match_status = 'matched'
    and link.retired_at is null
    and link.package_id is not null
    and package.archived_at is null
    and package.status <> 'archived'
  order by link.detected_at, link.id
  limit 1;

  if not found or snapshot_value is null then
    return null;
  end if;

  combination_value := snapshot_value #> '{selection,combination}';
  payload_value := snapshot_value -> 'payload';
  if jsonb_typeof(combination_value) <> 'object'
    or jsonb_typeof(payload_value) <> 'object'
    or coalesce(combination_value ->> 'currency', '') <> 'GBP'
  then
    return null;
  end if;

  if reservation_metadata ->> 'flightPart' = 'linked_leg' then
    select item.value into linked_selection
    from jsonb_array_elements(
      coalesce(combination_value -> 'linkedFlightSelections', '[]'::jsonb)
    ) item(value)
    where (
        nullif(reservation_metadata ->> 'groupId', '') is null
        or item.value #>> '{group,id}' = reservation_metadata ->> 'groupId'
      )
      and (
        nullif(reservation_metadata ->> 'optionId', '') is null
        or item.value #>> '{option,id}' = reservation_metadata ->> 'optionId'
      )
    order by item.value #>> '{group,id}', item.value #>> '{option,id}'
    limit 1;
    option_value := linked_selection -> 'option';
  else
    option_value := combination_value -> 'flightOption';
  end if;

  if jsonb_typeof(option_value) <> 'object' then
    return null;
  end if;

  service_passengers := coalesce(
    nullif(combination_value ->> 'servicePassengers', '')::integer,
    coalesce((payload_value ->> 'adults')::integer, 0)
      + coalesce((payload_value ->> 'childrenPaying')::integer, 0)
      + coalesce((payload_value ->> 'childrenFree')::integer, 0)
      + coalesce((payload_value ->> 'infants')::integer, 0)
  );
  quoted_children := coalesce((payload_value ->> 'childrenPaying')::integer, 0)
    + coalesce((payload_value ->> 'childrenFree')::integer, 0);

  if option_value ? 'adultPrice'
    or option_value ? 'childPrice'
    or option_value ? 'infantPrice'
  then
    adult_price := coalesce((option_value ->> 'adultPrice')::numeric, 0);
    child_price := coalesce((option_value ->> 'childPrice')::numeric, 0);
    infant_price := coalesce((option_value ->> 'infantPrice')::numeric, 0);
  else
    option_price := coalesce((option_value ->> 'price')::numeric, 0);
    if option_value ->> 'pricingMode' = 'per_person' then
      adult_price := option_price;
      child_price := option_price;
      infant_price := option_price;
    elsif service_passengers > 0 then
      adult_price := option_price / service_passengers;
      child_price := option_price / service_passengers;
      infant_price := option_price / service_passengers;
    else
      return null;
    end if;
  end if;

  if adult_price < 0 or child_price < 0 or infant_price < 0 then
    return null;
  end if;

  return jsonb_build_object(
    'source', 'package_quote',
    'packageId', package_id_value,
    'packageReference', package_reference_value,
    'reservationId', reservation_id_value,
    'quotedChildren', quoted_children,
    'adultPrice', round(adult_price, 2),
    'youthPrice', round(case when quoted_children > 0 then child_price else adult_price end, 2),
    'childPrice', round(child_price, 2),
    'infantPrice', round(infant_price, 2)
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return null;
end
$$;

revoke all on function public.ticketing_package_quote_pricing_2026083101(uuid)
  from public, anon, authenticated, service_role;

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
  effective_fares jsonb;
  package_quote_pricing jsonb;
  pricing_source_value text := 'ticketing_ledger';
  source_event_row public.commission_source_events%rowtype;
  operational_status_value text := p_entry ->> 'operationalStatus';
  fare_count integer := 0;
  unpriced_fare_count integer := 0;
  child_fare_count integer := 0;
begin
  if p_entry is null or jsonb_typeof(p_entry) <> 'object'
    or jsonb_typeof(p_entry -> 'fares') <> 'array'
    or length(idempotency_key_value) not between 1 and 200
    or operational_status_value not in ('held', 'issued')
  then
    raise exception 'Valid priced TK quick entry required' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_entry -> 'fares') fare(value)
    where not (fare.value ?& array['unitSalePrice', 'unitDiscount'])
      or case
        when jsonb_typeof(fare.value -> 'unitSalePrice') = 'number'
          and jsonb_typeof(fare.value -> 'unitDiscount') = 'number'
        then (fare.value ->> 'unitSalePrice')::numeric < 0
          or (fare.value ->> 'unitDiscount')::numeric < 0
          or (fare.value ->> 'unitDiscount')::numeric
            > (fare.value ->> 'unitSalePrice')::numeric
          or scale((fare.value ->> 'unitSalePrice')::numeric) > 2
          or scale((fare.value ->> 'unitDiscount')::numeric) > 2
        when jsonb_typeof(fare.value -> 'unitSalePrice') = 'null'
          and jsonb_typeof(fare.value -> 'unitDiscount') = 'null'
        then false
        else true
      end
  ) then
    raise exception 'Fare sale price and discount are invalid' using errcode = '22023';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where jsonb_typeof(fare.value -> 'unitSalePrice') = 'null'
    )::integer
  into fare_count, unpriced_fare_count
  from jsonb_array_elements(p_entry -> 'fares') fare(value);

  select coalesce(sum((fare.value ->> 'quantity')::integer), 0)::integer
  into child_fare_count
  from jsonb_array_elements(p_entry -> 'fares') fare(value)
  where fare.value ->> 'passengerType' = 'CHD';

  if unpriced_fare_count > 0 and unpriced_fare_count <> fare_count then
    raise exception 'Fare sale prices and discounts must all be supplied or all be omitted'
      using errcode = '22023';
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

  if operational_status_value = 'held' and unpriced_fare_count = fare_count then
    response_value := response_value || jsonb_build_object('pricingSource', 'unpriced_held');
    insert into public.ticket_idempotency_keys (
      action_name, actor_employee_id, idempotency_key, request_payload,
      response_payload, completed_at
    ) values (
      action_name_value, p_actor_employee_id, idempotency_key_value,
      canonical_request, response_value, clock_timestamp()
    );
    return response_value;
  end if;

  if operational_status_value = 'issued' then
    package_quote_pricing := public.ticketing_package_quote_pricing_2026083101(
      (response_value #>> '{booking,id}')::uuid
    );
  end if;

  if package_quote_pricing is not null then
    pricing_source_value := 'package_quote';
    select jsonb_agg(
      fare.value || jsonb_build_object(
        'unitSalePrice', case fare.value ->> 'passengerType'
          when 'ADT' then (package_quote_pricing ->> 'adultPrice')::numeric
          when 'YTH' then case
            when (package_quote_pricing ->> 'quotedChildren')::integer > child_fare_count
              then (package_quote_pricing ->> 'childPrice')::numeric
            else (package_quote_pricing ->> 'adultPrice')::numeric
          end
          when 'CHD' then (package_quote_pricing ->> 'childPrice')::numeric
          else (package_quote_pricing ->> 'infantPrice')::numeric
        end,
        'unitDiscount', 0
      )
      order by case fare.value ->> 'passengerType'
        when 'ADT' then 1 when 'YTH' then 2 when 'CHD' then 3 else 4
      end
    )
    into effective_fares
    from jsonb_array_elements(p_entry -> 'fares') fare(value);
  elsif operational_status_value = 'issued' and unpriced_fare_count = fare_count then
    raise exception 'Standalone Issued tickets require sale prices; no package quotation price matched this PNR'
      using errcode = '22023', hint = 'TICKETING_STANDALONE_SALE_REQUIRED';
  else
    effective_fares := p_entry -> 'fares';
  end if;

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
  from jsonb_array_elements(effective_fares) fare(value)
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
        'fare_prices', pricing_value,
        'pricing_source', pricing_source_value,
        'package_quote', package_quote_pricing
      ),
      'idempotency_key', 'priced:' || transaction_id_value::text
    ));
  end if;

  delete from public.ticket_initial_pricing_contexts where id = context_id_value;
  perform set_config('ticketing.initial_pricing_context_id', '', true);

  response_value := response_value || jsonb_build_object('pricingSource', pricing_source_value);

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

revoke all on function public.ticketing_create_quick_tk_priced(uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.ticketing_create_quick_tk_priced(uuid,text,jsonb) to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026083101,
  clock_timestamp(),
  coalesce((select details from public.portal_schema_versions where component = 'ticketing'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260831_ticketing_unpriced_held_quick_entry.sql',
      'capabilities', coalesce((
        select details -> 'capabilities'
        from public.portal_schema_versions
        where component = 'ticketing' and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array(
        'unpriced-held-quick-entry',
        'package-quote-ticket-pricing',
        'standalone-issued-sale-required'
      )
    )
)
on conflict (component) do update
set version = excluded.version,
    applied_at = excluded.applied_at,
    details = excluded.details
where public.portal_schema_versions.version < excluded.version;

commit;
