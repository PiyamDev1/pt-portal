-- Commission capability 2026090301.
-- Reservations are the financial and Commission authority for Packages.
-- Completed Payment-tab movements settle the reservation sale balance.
-- Customer invoices are optional presentation documents and never gate Commission.

begin;

select pg_advisory_xact_lock(hashtextextended('commission:schema-migration', 0));

do $migration_guard$
declare installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'commission'
  for update;

  if installed_version is null or installed_version < 2026090202 then
    raise exception 'Commission capability 2026090202 is required first'
      using errcode = '55000';
  end if;
  if installed_version > 2026090301 then
    raise exception 'Refusing to replay Commission capability 2026090301 over installed capability %',
      installed_version
      using errcode = '55000', hint = 'COMMISSION_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$migration_guard$;

create or replace function public.commission_package_financial_snapshot_2026083003(
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
  package_row public.travel_packages%rowtype;
  reservation_count integer := 0;
  unfinished_reservation_count integer := 0;
  group_main_transport_count integer := 0;
  group_reference_count integer := 0;
  passenger_count_value integer := 0;
  non_gbp_count integer := 0;
  pending_payment_count integer := 0;
  booked_cost_value numeric := 0;
  sold_value numeric := 0;
  discount_value numeric := 0;
  received_commission_value numeric := 0;
  supplier_refund_value numeric := 0;
  customer_refund_value numeric := 0;
  payment_received_value numeric := 0;
  payment_due_value numeric := 0;
  outstanding_balance_value numeric := 0;
  net_booked_value numeric := 0;
  net_sold_value numeric := 0;
  package_profit_value numeric := 0;
  owner_employee_id_value uuid;
  authority_reasons jsonb := '[]'::jsonb;
  variables_value jsonb;
begin
  select * into package_row
  from public.travel_packages package_folder
  where package_folder.id = p_package_id;

  if not found then
    raise exception 'Travel package was not found'
      using errcode = 'P0002';
  end if;

  owner_employee_id_value := coalesce(
    package_row.sales_responsible_employee_id,
    package_row.sales_employee_id
  );

  with tagged as (
    select
      reservation.*,
      reservation.reservation_type = 'transport'
        and reservation.metadata -> 'sharedGroupTransport' = 'true'::jsonb
        and reservation.metadata -> 'physicalReservation' = 'true'::jsonb
          as is_group_main,
      reservation.reservation_type = 'transport'
        and reservation.metadata -> 'sharedGroupTransport' = 'true'::jsonb
        and reservation.metadata -> 'billingAllocation' = 'true'::jsonb
        and reservation.metadata -> 'physicalReservation' is distinct from 'true'::jsonb
          as is_group_reference
    from public.travel_package_reservations reservation
    where reservation.package_id = p_package_id
  ), reference_totals as (
    select
      coalesce(sum(sold_price_total), 0) as sold,
      coalesce(sum(discount_total), 0) as discount,
      coalesce(sum(commission_received_total), 0) as received_commission,
      coalesce(sum(supplier_refund_total), 0) as supplier_refund,
      coalesce(sum(customer_refund_total), 0) as customer_refund
    from tagged
    where is_group_reference
  ), calculation_lines as (
    select
      tagged.is_group_reference,
      tagged.is_group_main,
      case when tagged.is_group_reference then 0
        else tagged.booked_cost_total end as booked,
      case
        when tagged.is_group_reference then 0
        when tagged.is_group_main
          and tagged.metadata -> 'soldPriceOverride' is distinct from 'true'::jsonb
          then reference_totals.sold
        else tagged.sold_price_total
      end as sold,
      case when tagged.is_group_reference then 0
        when tagged.is_group_main then tagged.discount_total + reference_totals.discount
        else tagged.discount_total end as discount,
      case when tagged.is_group_reference then 0
        when tagged.is_group_main
          then tagged.commission_received_total + reference_totals.received_commission
        else tagged.commission_received_total end as received_commission,
      case when tagged.is_group_reference then 0
        when tagged.is_group_main
          then tagged.supplier_refund_total + reference_totals.supplier_refund
        else tagged.supplier_refund_total end as supplier_refund,
      case when tagged.is_group_reference then 0
        when tagged.is_group_main
          then tagged.customer_refund_total + reference_totals.customer_refund
        else tagged.customer_refund_total end as customer_refund
    from tagged
    cross join reference_totals
  )
  select
    (select count(*) from tagged),
    (select count(*) from tagged where is_group_main),
    (select count(*) from tagged where is_group_reference),
    coalesce(sum(booked) filter (where not is_group_reference), 0),
    coalesce(sum(sold) filter (where not is_group_reference), 0),
    coalesce(sum(discount) filter (where not is_group_reference), 0),
    coalesce(sum(received_commission) filter (where not is_group_reference), 0),
    coalesce(sum(supplier_refund) filter (where not is_group_reference), 0),
    coalesce(sum(customer_refund) filter (where not is_group_reference), 0),
    coalesce(sum(greatest(0, booked - supplier_refund))
      filter (where not is_group_reference), 0),
    coalesce(sum(greatest(0, sold - customer_refund))
      filter (where not is_group_reference), 0)
  into
    reservation_count,
    group_main_transport_count,
    group_reference_count,
    booked_cost_value,
    sold_value,
    discount_value,
    received_commission_value,
    supplier_refund_value,
    customer_refund_value,
    net_booked_value,
    net_sold_value
  from calculation_lines;

  select count(*) into unfinished_reservation_count
  from public.travel_package_reservations reservation
  where reservation.package_id = p_package_id
    and reservation.status not in ('paid', 'confirmed', 'changed', 'cancelled');

  select count(*) into passenger_count_value
  from public.travel_package_passengers passenger
  where passenger.package_id = p_package_id;

  select
    coalesce(sum(case
      when payment.payment_status = 'completed'
        and payment.payment_type in ('deposit', 'payment', 'account_credit')
        then payment.amount
      when payment.payment_status = 'completed'
        and payment.payment_type in ('refund', 'chargeback')
        then -payment.amount
      else 0
    end), 0),
    count(*) filter (
      where payment.payment_status = 'pending'
        and payment.payment_type in ('deposit', 'payment', 'account_credit')
    )
  into payment_received_value, pending_payment_count
  from public.travel_package_payments payment
  where payment.package_id = p_package_id;

  select count(*) into non_gbp_count
  from (
    select reservation.currency
    from public.travel_package_reservations reservation
    where reservation.package_id = p_package_id
    union all
    select payment.currency
    from public.travel_package_payments payment
    where payment.package_id = p_package_id
      and payment.payment_status not in ('failed', 'cancelled')
  ) source_currency
  where upper(btrim(coalesce(source_currency.currency, ''))) <> 'GBP';

  payment_due_value := greatest(0, net_sold_value - discount_value);
  outstanding_balance_value := greatest(0, payment_due_value - payment_received_value);

  if package_row.status <> 'closed' then
    authority_reasons := authority_reasons || jsonb_build_array('package_not_closed');
  end if;
  if package_row.earned_at is null or package_row.closed_at is null then
    authority_reasons := authority_reasons || jsonb_build_array('missing_earned_date');
  end if;
  if owner_employee_id_value is null then
    authority_reasons := authority_reasons || jsonb_build_array('missing_sales_employee');
  end if;
  if package_row.location_id is null then
    authority_reasons := authority_reasons || jsonb_build_array('missing_package_location');
  end if;
  if reservation_count = 0 then
    authority_reasons := authority_reasons || jsonb_build_array('missing_reservations');
  end if;
  if unfinished_reservation_count > 0 then
    authority_reasons := authority_reasons || jsonb_build_array('unfinished_reservations');
  end if;
  if passenger_count_value = 0 then
    authority_reasons := authority_reasons || jsonb_build_array('missing_passengers');
  end if;
  if group_reference_count > 0 and group_main_transport_count <> 1 then
    authority_reasons := authority_reasons || jsonb_build_array('invalid_shared_transport_structure');
  elsif group_main_transport_count > 1 then
    authority_reasons := authority_reasons || jsonb_build_array('invalid_shared_transport_structure');
  end if;
  if payment_received_value + 0.009 < payment_due_value then
    authority_reasons := authority_reasons || jsonb_build_array('package_payment_not_paid');
  end if;
  if pending_payment_count > 0 and payment_received_value + 0.009 < payment_due_value then
    authority_reasons := authority_reasons || jsonb_build_array('pending_package_payments');
  end if;
  if non_gbp_count > 0 then
    authority_reasons := authority_reasons || jsonb_build_array('non_gbp_package_source');
  end if;

  package_profit_value := round(
    net_sold_value - discount_value - net_booked_value + received_commission_value,
    2
  );

  variables_value := jsonb_build_object(
    'commission_scope', 'package',
    'authoritative', jsonb_array_length(authority_reasons) = 0,
    'authority_reasons', authority_reasons,
    'integration_version', 2026090301,
    'package_id', package_row.id,
    'package_reference', package_row.package_reference,
    'package_type', package_row.package_type,
    'return_date', package_row.return_date,
    'commission_payout_date', package_row.return_date + 3,
    'group_id', package_row.group_id,
    'sales_employee_id', owner_employee_id_value,
    'booking_location_id', package_row.location_id,
    'passenger_count', passenger_count_value,
    'reservation_count', reservation_count,
    'calculation_row_count', reservation_count - group_reference_count,
    'invoice_reference_row_count', group_reference_count,
    'group_main_transport_count', group_main_transport_count,
    'sale_value_gbp', round(sold_value, 2),
    'net_sale_value_gbp', round(net_sold_value, 2),
    'booked_cost_gbp', round(booked_cost_value, 2),
    'net_booked_cost_gbp', round(net_booked_value, 2),
    'discount_gbp', round(discount_value, 2),
    'supplier_commission_received_gbp', round(received_commission_value, 2),
    'supplier_refund_gbp', round(supplier_refund_value, 2),
    'customer_refund_gbp', round(customer_refund_value, 2),
    'payment_received_gbp', round(payment_received_value, 2),
    'payment_due_gbp', round(payment_due_value, 2),
    'outstanding_balance_gbp', round(outstanding_balance_value, 2),
    'package_profit_gbp', package_profit_value
  );

  return variables_value || jsonb_build_object(
    'snapshot_hash', public.commission_sha256_2026082901(variables_value::text)
  );
end
$function$;

comment on function public.commission_package_financial_snapshot_2026083003(uuid) is
  'Authoritative Package Commission snapshot from reservations and completed Payment-tab movements. Customer invoices are optional and excluded.';

-- Invoice edits cannot change Commission source facts.
drop trigger if exists commission_package_source_invoice_3003 on public.travel_package_invoices;

-- A Ticketing event that is linked to a Package is represented by the
-- Package source event. It must not create a second earning or a permanent
-- "not authoritative" exception. Keep the event processed for lineage and
-- let the Package event wait for its own completion/payment conditions.
do $install_package_ticket_handoff$
declare
  core_definition text;
  updated_definition text;
begin
  if to_regprocedure(
    'public.commission_process_shadow_core_2026090201(uuid,integer,text)'
  ) is null then
    raise exception 'Commission shadow core 2026090201 is required first'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;

  select replace(pg_get_functiondef(
    'public.commission_process_shadow_core_2026090201(uuid,integer,text)'::regprocedure
  ), E'\r\n', E'\n') into core_definition;

  if position('Package-linked Ticketing event is represented by Package Commission.' in core_definition) = 0 then
    updated_definition := regexp_replace(
      core_definition,
      $pattern$elsif event[.]variables ->> 'commission_scope' = 'package' then[[:space:]]+failure_code := 'package_source_not_authoritative';$pattern$,
      $replacement$elsif event.variables ->> 'commission_scope' = 'package' then
        update public.commission_source_event_states
        set processing_status = 'processed', last_error = null,
            next_attempt_at = null, updated_at = clock_timestamp()
        where event_id = event.id;
        update public.commission_exceptions
        set status = 'resolved', resolved_by = p_actor_employee_id,
            resolved_at = clock_timestamp(),
            resolution_note = 'Package-linked Ticketing event is represented by Package Commission.'
        where source_event_id = event.id and status = 'open';
        processed_count := processed_count + 1;
        continue;$replacement$
    );

    if updated_definition = core_definition
      or position(
        'Package-linked Ticketing event is represented by Package Commission.'
        in updated_definition
      ) = 0
    then
      raise exception 'Package Ticketing handoff could not be installed'
        using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
    end if;
    execute updated_definition;
  end if;
end
$install_package_ticket_handoff$;

-- Clear the old duplicate attention items immediately. Their Package source
-- remains independently queued/held until it is genuinely commission-ready.
update public.commission_source_event_states state
set processing_status = 'processed',
    last_error = null,
    next_attempt_at = null,
    updated_at = clock_timestamp()
from public.commission_source_events event
where state.event_id = event.id
  and event.source_module = 'ticketing'
  and event.variables ->> 'commission_scope' = 'package'
  and state.processing_status in ('pending', 'processing', 'held', 'rejected');

update public.commission_exceptions commission_exception
set status = 'resolved',
    resolved_at = clock_timestamp(),
    resolution_note = 'Package-linked Ticketing event is represented by Package Commission.'
from public.commission_source_events event
where commission_exception.source_event_id = event.id
  and event.source_module = 'ticketing'
  and event.variables ->> 'commission_scope' = 'package'
  and commission_exception.status = 'open'
  and commission_exception.exception_code in (
    'package_source_not_authoritative',
    'unresolved_package_scope'
  );

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'commission',
  2026090301,
  clock_timestamp(),
  coalesce((select details from public.portal_schema_versions where component = 'commission'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260903_commission_package_reservation_payment_authority.sql',
      'mode', 'shadow',
      'capabilities', coalesce((
        select details -> 'capabilities' from public.portal_schema_versions
        where component = 'commission' and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array(
        'package-reservations-financial-authority',
        'package-payment-tab-settlement-authority',
        'package-invoice-optional',
        'package-ticket-handoff'
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
         ? 'package-payment-tab-settlement-authority',
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
    'packageReservationPaymentAuthorityReady', coalesce(version >= 2026090301, false),
    'version', coalesce(version, 0),
    'requiredVersion', 2026090301,
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
