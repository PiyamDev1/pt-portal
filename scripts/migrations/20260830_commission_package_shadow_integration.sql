-- Commission capability 2026083003.
-- Promotes financially reconciled, closed package folders into the same immutable
-- non-payable source-event and correction pipeline used by Ticketing.

begin;

select pg_advisory_xact_lock(hashtextextended('commission:schema-migration', 0));

do $migration_guard$
declare installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'commission'
  for update;

  if installed_version is null or installed_version < 2026083002 then
    raise exception 'Commission capability 2026083002 is required first'
      using errcode = '55000';
  end if;
  if installed_version > 2026083003 then
    raise exception 'Refusing to replay Commission capability 2026083003 over installed capability %',
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
  active_invoice_count integer := 0;
  unsettled_invoice_count integer := 0;
  invoice_sold_value numeric := 0;
  invoice_booked_value numeric := 0;
  non_gbp_count integer := 0;
  pending_payment_count integer := 0;
  booked_cost_value numeric := 0;
  sold_value numeric := 0;
  discount_value numeric := 0;
  reservation_received_commission_value numeric := 0;
  received_commission_value numeric := 0;
  supplier_refund_value numeric := 0;
  customer_refund_value numeric := 0;
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
    reservation_received_commission_value,
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
    count(*) filter (where invoice.status <> 'void'),
    count(*) filter (
      where invoice.status <> 'void'
        and (invoice.status not in ('paid', 'released') or abs(invoice.balance_due) > 0.009)
    ),
    coalesce(sum(invoice.total_sold) filter (where invoice.status <> 'void'), 0),
    coalesce(sum(invoice.total_booked_cost) filter (where invoice.status <> 'void'), 0),
    coalesce(sum(invoice.received_commission_total)
      filter (where invoice.status <> 'void'), 0)
  into active_invoice_count, unsettled_invoice_count, invoice_sold_value,
    invoice_booked_value, received_commission_value
  from public.travel_package_invoices invoice
  where invoice.package_id = p_package_id;

  select count(*) into non_gbp_count
  from (
    select reservation.currency
    from public.travel_package_reservations reservation
    where reservation.package_id = p_package_id
    union all
    select invoice.currency
    from public.travel_package_invoices invoice
    where invoice.package_id = p_package_id and invoice.status <> 'void'
    union all
    select payment.currency
    from public.travel_package_payments payment
    where payment.package_id = p_package_id
      and payment.payment_status not in ('failed', 'cancelled')
  ) source_currency
  where upper(btrim(coalesce(source_currency.currency, ''))) <> 'GBP';

  select count(*) into pending_payment_count
  from public.travel_package_payments payment
  where payment.package_id = p_package_id
    and payment.payment_status = 'pending';

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
  if active_invoice_count = 0 then
    authority_reasons := authority_reasons || jsonb_build_array('missing_active_invoice');
  end if;
  if unsettled_invoice_count > 0 then
    authority_reasons := authority_reasons || jsonb_build_array('invoice_not_settled');
  end if;
  if abs(received_commission_value - reservation_received_commission_value) > 0.009 then
    authority_reasons := authority_reasons
      || jsonb_build_array('supplier_commission_not_reconciled');
  end if;
  if abs(invoice_sold_value - (sold_value - discount_value)) > 0.009 then
    authority_reasons := authority_reasons || jsonb_build_array('invoice_sales_not_reconciled');
  end if;
  if abs(invoice_booked_value - booked_cost_value) > 0.009 then
    authority_reasons := authority_reasons || jsonb_build_array('invoice_cost_not_reconciled');
  end if;
  if package_row.payment_status <> 'paid' then
    authority_reasons := authority_reasons || jsonb_build_array('package_payment_not_paid');
  end if;
  if pending_payment_count > 0 then
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
    'integration_version', 2026083003,
    'package_id', package_row.id,
    'package_reference', package_row.package_reference,
    'package_type', package_row.package_type,
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
    'invoice_sale_value_gbp', round(invoice_sold_value, 2),
    'booked_cost_gbp', round(booked_cost_value, 2),
    'net_booked_cost_gbp', round(net_booked_value, 2),
    'invoice_booked_cost_gbp', round(invoice_booked_value, 2),
    'discount_gbp', round(discount_value, 2),
    'supplier_commission_received_gbp', round(received_commission_value, 2),
    'reservation_commission_received_gbp', round(reservation_received_commission_value, 2),
    'supplier_refund_gbp', round(supplier_refund_value, 2),
    'customer_refund_gbp', round(customer_refund_value, 2),
    'package_profit_gbp', package_profit_value
  );

  return variables_value || jsonb_build_object(
    'snapshot_hash', public.commission_sha256_2026082901(variables_value::text)
  );
end
$function$;

comment on function public.commission_package_financial_snapshot_2026083003(uuid) is
  'Authoritative closed-package Commission snapshot. Shared family transport references never double-count the one physical transport row.';

create or replace function public.commission_emit_package_sale_event_2026083003(
  p_package_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  package_row public.travel_packages%rowtype;
  latest_event public.commission_source_events%rowtype;
  variables_value jsonb;
  owner_employee_id_value uuid;
  next_version integer := 1;
  source_event_id_value uuid := gen_random_uuid();
  emitted_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'commission-package-source:' || p_package_id::text,
    0
  ));

  select * into package_row
  from public.travel_packages package_folder
  where package_folder.id = p_package_id;
  if not found or package_row.status <> 'closed' then
    return jsonb_build_object('emitted', false, 'reason', 'package_not_closed');
  end if;

  variables_value := public.commission_package_financial_snapshot_2026083003(p_package_id);
  owner_employee_id_value := coalesce(
    package_row.sales_responsible_employee_id,
    package_row.sales_employee_id
  );
  if owner_employee_id_value is null then
    return jsonb_build_object(
      'emitted', false,
      'reason', 'missing_sales_employee',
      'snapshotHash', variables_value ->> 'snapshot_hash'
    );
  end if;

  select * into latest_event
  from public.commission_source_events source_event
  where source_event.source_module = 'packages'
    and source_event.source_fact_key = 'package-sale:' || p_package_id::text
  order by source_event.event_version desc, source_event.created_at desc
  limit 1
  for update;

  if found and latest_event.variables ->> 'snapshot_hash' = variables_value ->> 'snapshot_hash' then
    return jsonb_build_object(
      'emitted', false,
      'reason', 'unchanged_snapshot',
      'id', latest_event.id,
      'eventVersion', latest_event.event_version
    );
  end if;
  if found then next_version := latest_event.event_version + 1; end if;

  emitted_result := public.append_commission_source_event(jsonb_build_object(
    'source_module', 'packages',
    'source_event_id', source_event_id_value,
    'source_fact_key', 'package-sale:' || p_package_id::text,
    'source_record_id', p_package_id,
    'event_type', 'package_closed',
    'contract_version', 1,
    'event_version', next_version,
    'supersedes_event_id', case when next_version = 1 then null else latest_event.source_event_id end,
    'employee_id', owner_employee_id_value,
    'owner_employee_id', owner_employee_id_value,
    'location_id', package_row.location_id,
    'occurred_at', clock_timestamp(),
    'effective_on', coalesce(package_row.earned_at, package_row.closed_at, clock_timestamp())::date,
    'source_path', '/dashboard/packages/' || p_package_id::text,
    'variables', variables_value,
    'idempotency_key', 'package-sale:' || p_package_id::text || ':v' || next_version::text
      || ':' || left(variables_value ->> 'snapshot_hash', 32)
  ));

  return emitted_result || jsonb_build_object('emitted', true);
end
$function$;

create or replace function public.commission_capture_package_source_2026083003()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare package_id_value uuid;
declare row_value jsonb;
begin
  row_value := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  package_id_value := case when tg_table_name = 'travel_packages'
    then (row_value ->> 'id')::uuid
    else (row_value ->> 'package_id')::uuid
  end;
  perform public.commission_emit_package_sale_event_2026083003(package_id_value);
  return coalesce(new, old);
end
$function$;

drop trigger if exists commission_package_source_package_3003 on public.travel_packages;
create trigger commission_package_source_package_3003
  after insert or update of
    status, earned_at, closed_at, sales_employee_id, sales_responsible_employee_id,
    location_id, package_type, group_id, payment_status
  on public.travel_packages
  for each row execute function public.commission_capture_package_source_2026083003();

drop trigger if exists commission_package_source_reservation_3003
  on public.travel_package_reservations;
create trigger commission_package_source_reservation_3003
  after insert or update or delete on public.travel_package_reservations
  for each row execute function public.commission_capture_package_source_2026083003();

drop trigger if exists commission_package_source_invoice_3003 on public.travel_package_invoices;
create trigger commission_package_source_invoice_3003
  after insert or update or delete on public.travel_package_invoices
  for each row execute function public.commission_capture_package_source_2026083003();

drop trigger if exists commission_package_source_payment_3003 on public.travel_package_payments;
create trigger commission_package_source_payment_3003
  after insert or update or delete on public.travel_package_payments
  for each row execute function public.commission_capture_package_source_2026083003();

drop trigger if exists commission_package_source_passenger_3003
  on public.travel_package_passengers;
create trigger commission_package_source_passenger_3003
  after insert or update or delete on public.travel_package_passengers
  for each row execute function public.commission_capture_package_source_2026083003();

create or replace function public.commission_process_package_shadow_event_2026083003(
  p_run_id uuid,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare
  event public.commission_source_events%rowtype;
  component public.commission_policy_components%rowtype;
  prior_entry public.commission_entries%rowtype;
  policy_version_id_value uuid;
  owner_employee_id_value uuid;
  period_start_value date;
  period_end_value date;
  case_key_value text;
  revision_value integer;
  amount_value numeric;
  passenger_count_value integer := 0;
  entry_count_value integer := 0;
begin
  select * into event
  from public.commission_source_events source_event
  where source_event.id = p_event_id;
  if not found or event.source_module <> 'packages' or event.event_type <> 'package_closed' then
    return jsonb_build_object(
      'entryCount', 0,
      'failureCode', 'calculation_failed',
      'failureDetails', jsonb_build_object('reason', 'unsupported_package_event')
    );
  end if;

  if not coalesce((event.variables ->> 'authoritative')::boolean, false) then
    return jsonb_build_object(
      'entryCount', 0,
      'failureCode', 'package_source_not_authoritative',
      'failureDetails', jsonb_build_object(
        'serviceCode', 'package_sale',
        'packageId', event.source_record_id,
        'reasons', coalesce(event.variables -> 'authority_reasons', '[]'::jsonb)
      )
    );
  end if;

  owner_employee_id_value := coalesce(event.owner_employee_id, event.employee_id);
  perform 1 from public.employees employee
  where employee.id = owner_employee_id_value and employee.is_active;
  if not found then
    return jsonb_build_object(
      'entryCount', 0,
      'failureCode', 'inactive_recipient',
      'failureDetails', jsonb_build_object(
        'recipientEmployeeId', owner_employee_id_value,
        'serviceCode', 'package_sale'
      )
    );
  end if;

  policy_version_id_value := public.commission_resolve_assignment_2026082901(
    owner_employee_id_value,
    'packages',
    'package_sale',
    'package_sales',
    event.location_id,
    event.effective_on
  );
  if policy_version_id_value is null then
    return jsonb_build_object(
      'entryCount', 0,
      'failureCode', 'needs_policy',
      'failureDetails', jsonb_build_object(
        'recipientEmployeeId', owner_employee_id_value,
        'serviceCode', 'package_sale',
        'recipientRole', 'package_sales'
      )
    );
  end if;

  if not exists (
    select 1 from public.commission_policy_components policy_component
    where policy_component.policy_version_id = policy_version_id_value
      and policy_component.recipient_role = 'package_sales'
      and policy_component.component_type in (
        'fixed_package', 'fixed_package_per_passenger',
        'percentage_of_package_profit', 'explicit_zero'
      )
  ) then
    return jsonb_build_object(
      'entryCount', 0,
      'failureCode', 'needs_policy',
      'failureDetails', jsonb_build_object(
        'reason', 'no_matching_component',
        'policyVersionId', policy_version_id_value,
        'serviceCode', 'package_sale'
      )
    );
  end if;

  period_start_value := date_trunc('month', event.effective_on)::date;
  period_end_value := (period_start_value + interval '1 month - 1 day')::date;
  case_key_value := event.source_module || ':' || event.source_fact_key;
  passenger_count_value := coalesce((event.variables ->> 'passenger_count')::integer, 0);

  if event.supersedes_event_id is not null then
    for prior_entry in
      select entry.* from public.commission_entries entry
      where entry.entry_mode = 'shadow'
        and entry.entry_kind = 'ordinary'
        and entry.source_case_key = case_key_value
        and not exists (
          select 1 from public.commission_entries newer
          where newer.entry_mode = entry.entry_mode
            and newer.supersedes_entry_id = entry.id
        )
    loop
      select coalesce(max(entry.revision), 0) + 1 into revision_value
      from public.commission_entries entry
      where entry.entry_mode = 'shadow'
        and entry.source_case_key = case_key_value
        and entry.recipient_employee_id = prior_entry.recipient_employee_id
        and entry.component_id = prior_entry.component_id;
      insert into public.commission_entries (
        run_id, entry_mode, entry_kind, source_event_id, source_case_key,
        recipient_employee_id, profit_owner_employee_id, location_id,
        policy_version_id, component_id, earning_on, period_start, period_end,
        amount_gbp, basis_snapshot, explanation, revision, supersedes_entry_id,
        idempotency_key
      ) values (
        p_run_id, 'shadow', prior_entry.entry_kind, event.id, case_key_value,
        prior_entry.recipient_employee_id, prior_entry.profit_owner_employee_id,
        prior_entry.location_id, prior_entry.policy_version_id, prior_entry.component_id,
        prior_entry.earning_on, prior_entry.period_start, prior_entry.period_end,
        0,
        prior_entry.basis_snapshot || jsonb_build_object(
          'correctedBySourceEventId', event.id
        ),
        prior_entry.explanation || jsonb_build_object(
          'reason', 'package_source_corrected',
          'supersededAmountGbp', prior_entry.amount_gbp
        ),
        revision_value, prior_entry.id,
        'package-correction-clear:' || event.id::text || ':' || prior_entry.id::text
      ) on conflict (entry_mode, idempotency_key) do nothing;
      if found then entry_count_value := entry_count_value + 1; end if;
    end loop;
  end if;

  for component in
    select policy_component.*
    from public.commission_policy_components policy_component
    where policy_component.policy_version_id = policy_version_id_value
      and policy_component.recipient_role = 'package_sales'
      and policy_component.component_type in (
        'fixed_package', 'fixed_package_per_passenger',
        'percentage_of_package_profit', 'explicit_zero'
      )
    order by policy_component.sequence
  loop
    amount_value := public.commission_component_amount_2026082902(
      component.id,
      event.variables || jsonb_build_object('_commission_period_start', period_start_value),
      passenger_count_value,
      0
    );

    select entry.* into prior_entry
    from public.commission_entries entry
    where entry.entry_mode = 'shadow'
      and entry.source_case_key = case_key_value
      and entry.recipient_employee_id = owner_employee_id_value
      and entry.component_id = component.id
      and not exists (
        select 1 from public.commission_entries newer
        where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
      )
    order by entry.revision desc limit 1;
    revision_value := case when found then prior_entry.revision + 1 else 1 end;

    insert into public.commission_entries (
      run_id, entry_mode, entry_kind, source_event_id, source_case_key,
      recipient_employee_id, profit_owner_employee_id, location_id,
      policy_version_id, component_id, earning_on, period_start, period_end,
      amount_gbp, basis_snapshot, explanation, revision, supersedes_entry_id,
      idempotency_key
    ) values (
      p_run_id, 'shadow', 'ordinary', event.id, case_key_value,
      owner_employee_id_value, owner_employee_id_value, event.location_id,
      policy_version_id_value, component.id, event.effective_on,
      period_start_value, period_end_value, amount_value,
      jsonb_build_object(
        'sourceVariable', component.source_variable,
        'basisValue', case when component.source_variable is null then null
          else event.variables -> component.source_variable end,
        'units', passenger_count_value,
        'packageProfitGbp', event.variables -> 'package_profit_gbp',
        'snapshotHash', event.variables -> 'snapshot_hash'
      ),
      jsonb_build_object(
        'componentType', component.component_type,
        'serviceCode', 'package_sale',
        'recipientRole', 'package_sales',
        'sourceModule', 'packages',
        'nonPayable', true
      ),
      revision_value, prior_entry.id,
      'package-ordinary:' || event.id::text || ':' || owner_employee_id_value::text
        || ':' || component.id::text || ':amount:' || amount_value::text
    ) on conflict (entry_mode, idempotency_key) do nothing;
    if found then entry_count_value := entry_count_value + 1; end if;
  end loop;

  return jsonb_build_object(
    'entryCount', entry_count_value,
    'failureCode', null,
    'failureDetails', '{}'::jsonb
  );
end
$function$;

do $upgrade_processor$
declare
  signature constant regprocedure :=
    'public.commission_process_shadow_2026082902(uuid,integer,text)'::regprocedure;
  definition text;
  updated_definition text;
  old_fragment text;
  new_fragment text;
begin
  definition := replace(pg_get_functiondef(signature), E'\r\n', E'\n');
  if position('commission_process_package_shadow_event_2026083003' in definition) > 0 then
    return;
  end if;

  old_fragment := $old$declare result_json jsonb;$old$;
  new_fragment := $new$declare result_json jsonb;
declare package_result jsonb;$new$;
  updated_definition := replace(definition, old_fragment, new_fragment);
  if updated_definition = definition then
    raise exception 'Commission package processor declaration upgrade did not match'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;
  definition := updated_definition;

  old_fragment := $old$      elsif event.source_module <> 'ticketing' then
        failure_code := 'package_source_not_authoritative';
        failure_details := jsonb_build_object('sourceModule', event.source_module);$old$;
  new_fragment := $new$      elsif event.source_module = 'packages' then
        package_result := public.commission_process_package_shadow_event_2026083003(
          run_id_value, event.id
        );
        failure_code := nullif(package_result ->> 'failureCode', '');
        failure_details := coalesce(package_result -> 'failureDetails', '{}'::jsonb);
        entry_count_value := entry_count_value
          + coalesce((package_result ->> 'entryCount')::integer, 0);
      elsif event.source_module <> 'ticketing' then
        failure_code := 'package_source_not_authoritative';
        failure_details := jsonb_build_object('sourceModule', event.source_module);$new$;
  updated_definition := replace(definition, old_fragment, new_fragment);
  if updated_definition = definition then
    raise exception 'Commission package processor branch upgrade did not match'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;

  execute updated_definition;
end
$upgrade_processor$;

do $upgrade_assignment_requeue$
declare
  signature constant regprocedure :=
    'public.commission_requeue_assignment_events_2026082902()'::regprocedure;
  definition text;
  updated_definition text;
  old_fragment text := $old$      when new.service_code = 'higher_fare' and new.recipient_role = 'low_fare_actor'
        then event.event_type = 'ticket_higher_fare_adjusted'
          and event.employee_id = new.employee_id
      else false$old$;
  new_fragment text := $new$      when new.service_code = 'higher_fare' and new.recipient_role = 'low_fare_actor'
        then event.event_type = 'ticket_higher_fare_adjusted'
          and event.employee_id = new.employee_id
      when new.service_code = 'package_sale' and new.recipient_role = 'package_sales'
        then event.event_type = 'package_closed'
          and coalesce(event.owner_employee_id, event.employee_id) = new.employee_id
      else false$new$;
begin
  definition := replace(pg_get_functiondef(signature), E'\r\n', E'\n');
  if position($needle$new.service_code = 'package_sale'$needle$ in definition) > 0 then
    return;
  end if;
  updated_definition := replace(definition, old_fragment, new_fragment);
  if updated_definition = definition then
    raise exception 'Commission package assignment requeue upgrade did not match'
      using errcode = '55000', hint = 'COMMISSION_SCHEMA_DRIFT';
  end if;
  execute updated_definition;
end
$upgrade_assignment_requeue$;

create or replace function public.commission_source_module_overview_2026083003(
  p_actor_employee_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $function$
declare result_value jsonb;
begin
  if not public.commission_actor_can_manage_2026082901(p_actor_employee_id) then
    raise exception 'Commission policy access is required'
      using errcode = '42501', hint = 'COMMISSION_FORBIDDEN';
  end if;

  with modules(source_module, label) as (
    values ('ticketing'::text, 'Ticketing'::text), ('packages'::text, 'Packages'::text)
  ), event_counts as (
    select
      event.source_module,
      count(*) filter (where state.processing_status = 'pending') as pending_events,
      count(*) filter (where state.processing_status = 'processed') as processed_events,
      count(*) filter (where state.processing_status = 'held') as held_events
    from public.commission_source_events event
    join public.commission_source_event_states state on state.event_id = event.id
    where event.source_module in ('ticketing', 'packages')
    group by event.source_module
  ), active_entries as (
    select
      source_event.source_module,
      count(*) as active_entries,
      coalesce(sum(entry.amount_gbp), 0) as total_gbp
    from public.commission_entries entry
    join public.commission_source_events source_event on source_event.id = entry.source_event_id
    where entry.entry_mode = 'shadow'
      and not exists (
        select 1 from public.commission_entries newer
        where newer.entry_mode = entry.entry_mode and newer.supersedes_entry_id = entry.id
      )
    group by source_event.source_module
  ), package_gaps as (
    select
      count(*) filter (
        where coalesce(package_folder.sales_responsible_employee_id,
          package_folder.sales_employee_id) is null
      ) as missing_owner,
      count(*) filter (
        where not exists (
          select 1 from public.commission_source_events source_event
          where source_event.source_module = 'packages'
            and source_event.source_fact_key = 'package-sale:' || package_folder.id::text
        )
      ) as missing_event
    from public.travel_packages package_folder
    where package_folder.status = 'closed'
  )
  select jsonb_agg(jsonb_build_object(
    'sourceModule', module.source_module,
    'label', module.label,
    'pendingEvents', coalesce(event_count.pending_events, 0),
    'processedEvents', coalesce(event_count.processed_events, 0),
    'heldEvents', coalesce(event_count.held_events, 0),
    'activeEntries', coalesce(active_entry.active_entries, 0),
    'totalGbp', round(coalesce(active_entry.total_gbp, 0), 2),
    'closedRecordsMissingEvent', case when module.source_module = 'packages'
      then package_gap.missing_event else 0 end,
    'closedRecordsMissingOwner', case when module.source_module = 'packages'
      then package_gap.missing_owner else 0 end
  ) order by module.source_module)
  into result_value
  from modules module
  left join event_counts event_count on event_count.source_module = module.source_module
  left join active_entries active_entry on active_entry.source_module = module.source_module
  cross join package_gaps package_gap;

  return coalesce(result_value, '[]'::jsonb);
end
$function$;

revoke all on function public.commission_package_financial_snapshot_2026083003(uuid)
  from public, anon, authenticated;
revoke all on function public.commission_emit_package_sale_event_2026083003(uuid)
  from public, anon, authenticated;
revoke all on function public.commission_process_package_shadow_event_2026083003(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.commission_source_module_overview_2026083003(uuid)
  from public, anon, authenticated;
grant execute on function public.commission_source_module_overview_2026083003(uuid)
  to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'commission',
  2026083003,
  clock_timestamp(),
  coalesce((
    select details from public.portal_schema_versions where component = 'commission'
  ), '{}'::jsonb) || jsonb_build_object(
    'migration', '20260830_commission_package_shadow_integration.sql',
    'mode', 'shadow',
    'capabilities', coalesce((
      select details -> 'capabilities'
      from public.portal_schema_versions
      where component = 'commission' and jsonb_typeof(details -> 'capabilities') = 'array'
    ), '[]'::jsonb) || jsonb_build_array(
      'authoritative-closed-package-source',
      'package-correction-lineage',
      'shared-transport-single-physical-row',
      'source-module-overview'
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
         ? 'authoritative-closed-package-source',
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
    'version', coalesce(version, 0),
    'requiredVersion', 2026083003,
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
    where not exists (
      select 1 from public.portal_schema_versions where component = 'commission'
    )
    limit 1
  ) status
$function$;

revoke all on function public.commission_schema_status() from public, anon, authenticated;
grant execute on function public.commission_schema_status() to service_role;

commit;
