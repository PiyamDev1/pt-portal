-- Forward-only Ticketing capability 2026083102.
-- Adds auditable per-booking commission treatment and staff/family pricing rules.

begin;

select pg_advisory_xact_lock(hashtextextended('ticketing:schema-migration', 0));

do $ticketing_staff_family_forward_guard$
declare
  installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'ticketing'
  for update;

  if installed_version is null or installed_version < 2026083101 then
    raise exception 'Ticketing capability 2026083101 is required before staff/family capability 2026083102'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
  if installed_version > 2026083102 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026083102, installed_version
      using errcode = '55000', hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$ticketing_staff_family_forward_guard$;

alter table public.ticket_bookings
  add column if not exists commercial_treatment text not null default 'standard',
  add column if not exists commission_waiver_reason text;

alter table public.ticket_bookings
  drop constraint if exists ticket_bookings_commercial_treatment_check;
alter table public.ticket_bookings
  add constraint ticket_bookings_commercial_treatment_check
    check (commercial_treatment in ('standard', 'staff_family', 'commission_waived'));

alter table public.ticket_bookings
  drop constraint if exists ticket_bookings_commission_waiver_reason_check;
alter table public.ticket_bookings
  add constraint ticket_bookings_commission_waiver_reason_check check (
    (commercial_treatment = 'standard' and commission_waiver_reason is null)
    or (
      commercial_treatment <> 'standard'
      and length(btrim(commission_waiver_reason)) between 3 and 500
    )
  );

create table if not exists public.ticketing_staff_family_policy (
  id boolean primary key default true,
  low_fare_company_fee_percent numeric(5,2) not null default 30,
  change_admin_fee_gbp numeric(14,2) not null default 25,
  refund_admin_fee_gbp numeric(14,2) not null default 25,
  updated_by uuid references public.employees(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  constraint ticketing_staff_family_policy_singleton_check check (id),
  constraint ticketing_staff_family_policy_percent_check
    check (low_fare_company_fee_percent between 0 and 100),
  constraint ticketing_staff_family_policy_fees_check
    check (change_admin_fee_gbp between 0 and 99999999.99
      and refund_admin_fee_gbp between 0 and 99999999.99)
);

insert into public.ticketing_staff_family_policy (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.ticketing_staff_family_employee_policies (
  employee_id uuid primary key references public.employees(id) on delete restrict,
  low_fare_company_fee_percent numeric(5,2) not null,
  updated_by uuid not null references public.employees(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  constraint ticketing_staff_family_employee_policy_percent_check
    check (low_fare_company_fee_percent between 0 and 100)
);

comment on table public.ticketing_staff_family_policy is
  'Singleton default staff/family pricing policy. Low Fare percentage is a company fee on supplier savings, never employee commission.';
comment on table public.ticketing_staff_family_employee_policies is
  'Optional per-agent override of the company fee percentage retained from staff/family Low Fare savings.';

create table if not exists public.ticket_staff_family_fare_reprices (
  adjustment_id uuid primary key references public.ticket_fare_adjustments(id) on delete restrict,
  booking_id uuid not null references public.ticket_bookings(id) on delete restrict,
  owner_employee_id uuid not null references public.employees(id) on delete restrict,
  company_fee_percent numeric(5,2) not null,
  supplier_difference_gbp numeric(14,2) not null,
  customer_price_before_gbp numeric(14,2) not null,
  company_fee_gbp numeric(14,2) not null,
  customer_credit_gbp numeric(14,2) not null,
  customer_additional_charge_gbp numeric(14,2) not null,
  customer_price_after_gbp numeric(14,2) not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint ticket_staff_family_fare_reprices_booking_unique
    unique (adjustment_id, booking_id),
  constraint ticket_staff_family_fare_reprices_percent_check
    check (company_fee_percent between 0 and 100),
  constraint ticket_staff_family_fare_reprices_amounts_check check (
    supplier_difference_gbp <> 0
    and customer_price_before_gbp >= 0
    and company_fee_gbp >= 0
    and customer_credit_gbp >= 0
    and customer_additional_charge_gbp >= 0
    and customer_price_after_gbp >= 0
    and (
      (supplier_difference_gbp > 0
        and customer_additional_charge_gbp = 0
        and company_fee_gbp = round(
          supplier_difference_gbp * company_fee_percent / 100,
          2
        )
        and customer_credit_gbp + company_fee_gbp = supplier_difference_gbp
        and customer_price_after_gbp = customer_price_before_gbp - customer_credit_gbp)
      or
      (supplier_difference_gbp < 0
        and company_fee_gbp = 0
        and customer_credit_gbp = 0
        and customer_additional_charge_gbp = -supplier_difference_gbp
        and customer_price_after_gbp = customer_price_before_gbp + customer_additional_charge_gbp)
    )
  )
);

create index if not exists ticket_staff_family_fare_reprices_booking_created_idx
  on public.ticket_staff_family_fare_reprices (booking_id, created_at desc);

comment on table public.ticket_staff_family_fare_reprices is
  'Immutable staff/family customer repricing created beside each supplier fare adjustment. Positive supplier savings become a customer credit plus company fee; they never become commission.';

create or replace function public.ticketing_record_staff_family_fare_reprice_2026083102()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  booking_row public.ticket_bookings%rowtype;
  root_sale_gbp numeric(14,2);
  previous_customer_price_gbp numeric(14,2);
  employee_fee_percent_value numeric(5,2);
  company_fee_percent_value numeric(5,2);
  company_fee_gbp_value numeric(14,2) := 0;
  customer_credit_gbp_value numeric(14,2) := 0;
  customer_additional_charge_gbp_value numeric(14,2) := 0;
  customer_price_after_gbp_value numeric(14,2);
begin
  select booking.* into booking_row
  from public.ticket_bookings booking
  where booking.id = new.booking_id
  for update;

  if not found or booking_row.commercial_treatment <> 'staff_family' then
    return new;
  end if;

  select policy.low_fare_company_fee_percent
  into company_fee_percent_value
  from public.ticketing_staff_family_policy policy
  where policy.id
  for share;

  select employee_policy.low_fare_company_fee_percent
  into employee_fee_percent_value
  from public.ticketing_staff_family_employee_policies employee_policy
  where employee_policy.employee_id = booking_row.owner_employee_id
  for share;

  company_fee_percent_value := coalesce(
    employee_fee_percent_value,
    company_fee_percent_value
  );

  if company_fee_percent_value is null then
    raise exception 'Staff/family Low Fare policy is unavailable'
      using errcode = '55000', hint = 'TICKETING_STAFF_FAMILY_POLICY_REQUIRED';
  end if;

  if new.previous_adjustment_id is null then
    select transaction.sale_price_gbp into root_sale_gbp
    from public.ticket_transactions transaction
    where transaction.id = new.root_transaction_id
      and transaction.booking_id = new.booking_id
      and transaction.service_type = 'TK'
      and transaction.parent_transaction_id is null
    for share;
    previous_customer_price_gbp := root_sale_gbp;
  else
    select reprice.customer_price_after_gbp into previous_customer_price_gbp
    from public.ticket_staff_family_fare_reprices reprice
    where reprice.adjustment_id = new.previous_adjustment_id
      and reprice.booking_id = new.booking_id
    for share;
  end if;

  if previous_customer_price_gbp is null then
    raise exception 'Staff/family ticket price is unavailable for Low Fare repricing'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  if new.difference_gbp > 0 then
    company_fee_gbp_value := round(new.difference_gbp * company_fee_percent_value / 100, 2);
    customer_credit_gbp_value := new.difference_gbp - company_fee_gbp_value;
    customer_price_after_gbp_value := previous_customer_price_gbp - customer_credit_gbp_value;
  else
    customer_additional_charge_gbp_value := -new.difference_gbp;
    customer_price_after_gbp_value :=
      previous_customer_price_gbp + customer_additional_charge_gbp_value;
  end if;

  if customer_price_after_gbp_value < 0 then
    raise exception 'Staff/family Low Fare customer price cannot become negative'
      using errcode = '23514', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;

  insert into public.ticket_staff_family_fare_reprices (
    adjustment_id,
    booking_id,
    owner_employee_id,
    company_fee_percent,
    supplier_difference_gbp,
    customer_price_before_gbp,
    company_fee_gbp,
    customer_credit_gbp,
    customer_additional_charge_gbp,
    customer_price_after_gbp
  ) values (
    new.id,
    new.booking_id,
    booking_row.owner_employee_id,
    company_fee_percent_value,
    new.difference_gbp,
    previous_customer_price_gbp,
    company_fee_gbp_value,
    customer_credit_gbp_value,
    customer_additional_charge_gbp_value,
    customer_price_after_gbp_value
  );

  return new;
end
$$;

drop trigger if exists ticket_fare_adjustments_staff_family_reprice_3102
  on public.ticket_fare_adjustments;
create trigger ticket_fare_adjustments_staff_family_reprice_3102
  after insert on public.ticket_fare_adjustments
  for each row execute function public.ticketing_record_staff_family_fare_reprice_2026083102();

drop trigger if exists ticket_staff_family_fare_reprices_immutable_3102
  on public.ticket_staff_family_fare_reprices;
create trigger ticket_staff_family_fare_reprices_immutable_3102
  before update or delete on public.ticket_staff_family_fare_reprices
  for each row execute function public.reject_immutable_event_mutation();

create or replace view public.ticket_fare_adjustment_current
with (security_invoker = true)
as
select distinct on (adjustment.booking_id)
  adjustment.id,
  adjustment.booking_id,
  adjustment.root_transaction_id,
  adjustment.previous_adjustment_id,
  adjustment.sequence_number,
  adjustment.acting_employee_id,
  adjustment.owner_employee_id,
  adjustment.actor_location_id,
  adjustment.booking_location_id,
  adjustment.currency,
  adjustment.original_fare_source,
  adjustment.original_fare_gbp,
  adjustment.new_fare_source,
  adjustment.new_fare_gbp,
  adjustment.difference_source,
  adjustment.difference_gbp,
  adjustment.passenger_ticket_count,
  adjustment.effective_on,
  adjustment.notes,
  adjustment.package_match_status,
  adjustment.commission_scope,
  adjustment.package_link_ids,
  adjustment.package_id,
  adjustment.reservation_id,
  adjustment.group_id,
  adjustment.package_type,
  adjustment.created_at,
  reprice.company_fee_percent as staff_family_company_fee_percent,
  reprice.customer_price_before_gbp as staff_family_customer_price_before_gbp,
  reprice.company_fee_gbp as staff_family_company_fee_gbp,
  reprice.customer_credit_gbp as staff_family_customer_credit_gbp,
  reprice.customer_additional_charge_gbp as staff_family_customer_additional_charge_gbp,
  reprice.customer_price_after_gbp as staff_family_customer_price_after_gbp
from public.ticket_fare_adjustments adjustment
left join public.ticket_staff_family_fare_reprices reprice
  on reprice.adjustment_id = adjustment.id
order by adjustment.booking_id, adjustment.sequence_number desc;

comment on view public.ticket_fare_adjustment_current is
  'One latest immutable Low Fare adjustment per adjusted booking, including staff/family customer repricing. Never-adjusted bookings are absent.';

create or replace function public.enrich_ticketing_source_event_commercial_2026083102()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  booking_row public.ticket_bookings%rowtype;
  booking_id_value uuid;
  company_fee_percent_value numeric(5,2);
  reprice_row public.ticket_staff_family_fare_reprices%rowtype;
begin
  if new.source_module <> 'ticketing' then
    return new;
  end if;

  begin
    booking_id_value := nullif(new.variables ->> 'booking_id', '')::uuid;
  exception when invalid_text_representation then
    booking_id_value := null;
  end;

  if booking_id_value is null then
    select transaction.booking_id into booking_id_value
    from public.ticket_transactions transaction
    where transaction.id = new.source_record_id;
  end if;
  if booking_id_value is null then
    return new;
  end if;

  select booking.* into booking_row
  from public.ticket_bookings booking
  where booking.id = booking_id_value;
  if not found then
    return new;
  end if;

  select coalesce(employee_policy.low_fare_company_fee_percent,
      default_policy.low_fare_company_fee_percent)
  into company_fee_percent_value
  from public.ticketing_staff_family_policy default_policy
  left join public.ticketing_staff_family_employee_policies employee_policy
    on employee_policy.employee_id = booking_row.owner_employee_id
  where default_policy.id;

  if new.event_type in ('ticket_low_fare_adjusted', 'ticket_higher_fare_adjusted') then
    select reprice.* into reprice_row
    from public.ticket_staff_family_fare_reprices reprice
    where reprice.adjustment_id = new.source_record_id;
  end if;

  new.variables := new.variables || jsonb_strip_nulls(jsonb_build_object(
    'commercial_treatment', booking_row.commercial_treatment,
    'commission_waived', booking_row.commercial_treatment <> 'standard',
    'commission_waiver_reason', booking_row.commission_waiver_reason,
    'staff_family_company_fee_percent', company_fee_percent_value,
    'staff_family_customer_price_before_gbp', reprice_row.customer_price_before_gbp,
    'staff_family_company_fee_gbp', reprice_row.company_fee_gbp,
    'staff_family_customer_credit_gbp', reprice_row.customer_credit_gbp,
    'staff_family_customer_additional_charge_gbp',
      reprice_row.customer_additional_charge_gbp,
    'staff_family_customer_price_after_gbp', reprice_row.customer_price_after_gbp
  ));

  return new;
end
$$;

drop trigger if exists commission_source_events_enrich_ticket_commercial_3102
  on public.commission_source_events;
create trigger commission_source_events_enrich_ticket_commercial_3102
  before insert on public.commission_source_events
  for each row execute function public.enrich_ticketing_source_event_commercial_2026083102();

create or replace function public.ticketing_validate_staff_family_fare_line_2026083102()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  treatment_value text;
  service_type_value text;
  parent_transaction_id_value uuid;
  admin_fee_gbp_value numeric(14,2);
begin
  select booking.commercial_treatment, transaction.service_type,
    transaction.parent_transaction_id
  into treatment_value, service_type_value, parent_transaction_id_value
  from public.ticket_transactions transaction
  join public.ticket_bookings booking on booking.id = transaction.booking_id
  where transaction.id = new.transaction_id;

  if treatment_value <> 'staff_family' then
    return new;
  end if;

  if service_type_value = 'TK' and parent_transaction_id_value is null then
    if new.unit_sale_price_source is not null
      and new.unit_sale_price_source is distinct from new.unit_supplier_cost_source
    then
      raise exception 'Staff/family root tickets must be sold at supplier cost'
        using errcode = '23514', hint = 'TICKETING_STAFF_FAMILY_AT_COST_REQUIRED';
    end if;
  elsif service_type_value in ('DC', 'R-ER') then
    select policy.change_admin_fee_gbp into admin_fee_gbp_value
    from public.ticketing_staff_family_policy policy
    where policy.id
    for share;
    if new.unit_sale_price_source is null
      or new.unit_supplier_cost_source is null
      or new.unit_sale_price_source is distinct from
        round(new.unit_supplier_cost_source + admin_fee_gbp_value, 2)
    then
      raise exception 'Staff/family service charge must equal airline cost plus the admin fee'
        using errcode = '23514', hint = 'TICKETING_STAFF_FAMILY_SERVICE_FEE_REQUIRED';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists ticket_passenger_fare_lines_staff_family_3102
  on public.ticket_passenger_fare_lines;
create trigger ticket_passenger_fare_lines_staff_family_3102
  before insert or update of unit_supplier_cost_source, unit_sale_price_source
  on public.ticket_passenger_fare_lines
  for each row execute function public.ticketing_validate_staff_family_fare_line_2026083102();

create or replace function public.ticketing_validate_staff_family_refund_2026083102()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  treatment_value text;
  refund_fee_gbp_value numeric(14,2);
begin
  select booking.commercial_treatment into treatment_value
  from public.ticket_bookings booking
  where booking.id = new.booking_id;
  if treatment_value <> 'staff_family' then
    return new;
  end if;

  select policy.refund_admin_fee_gbp into refund_fee_gbp_value
  from public.ticketing_staff_family_policy policy
  where policy.id
  for share;

  if new.supplier_cancellation_charge_gbp <> 0
    or new.retained_agent_commission_gbp <> 0
    or new.desired_company_markup_gbp is distinct from refund_fee_gbp_value
  then
    raise exception 'Staff/family refund must equal airline fee plus the configured admin fee'
      using errcode = '23514', hint = 'TICKETING_STAFF_FAMILY_REFUND_FEE_REQUIRED';
  end if;

  return new;
end
$$;

drop trigger if exists ticket_refunds_staff_family_3102 on public.ticket_refunds;
create trigger ticket_refunds_staff_family_3102
  before insert on public.ticket_refunds
  for each row execute function public.ticketing_validate_staff_family_refund_2026083102();

create or replace function public.ticketing_create_quick_tk_commercial(
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
  commercial_treatment_value text := coalesce(
    nullif(btrim(p_entry ->> 'commercialTreatment'), ''), 'standard'
  );
  commission_waiver_reason_value text := nullif(btrim(p_entry ->> 'commissionWaiverReason'), '');
  response_value jsonb;
  booking_id_value uuid;
  transaction_id_value uuid;
  booking_row public.ticket_bookings%rowtype;
  source_event_row public.commission_source_events%rowtype;
  invalid_fare_count integer;
begin
  if p_entry is null or jsonb_typeof(p_entry) <> 'object'
    or commercial_treatment_value not in ('standard', 'staff_family', 'commission_waived')
    or (p_entry ? 'commercialTreatment'
      and jsonb_typeof(p_entry -> 'commercialTreatment') <> 'string')
    or (p_entry ? 'commissionWaiverReason'
      and jsonb_typeof(p_entry -> 'commissionWaiverReason') not in ('string', 'null'))
    or (commercial_treatment_value = 'standard' and commission_waiver_reason_value is not null)
    or (commercial_treatment_value <> 'standard'
      and length(coalesce(commission_waiver_reason_value, '')) not between 3 and 500)
  then
    raise exception 'Valid ticket commission treatment and waiver reason required'
      using errcode = '22023';
  end if;

  response_value := public.ticketing_create_quick_tk_supplied(
    p_actor_employee_id,
    p_idempotency_key,
    p_entry - 'commercialTreatment' - 'commissionWaiverReason'
  );
  booking_id_value := (response_value #>> '{booking,id}')::uuid;
  transaction_id_value := (response_value #>> '{transaction,id}')::uuid;

  select booking.* into booking_row
  from public.ticket_bookings booking
  where booking.id = booking_id_value
  for update;

  if response_value ->> 'idempotentReplay' = 'true' then
    if booking_row.commercial_treatment is distinct from commercial_treatment_value
      or booking_row.commission_waiver_reason is distinct from commission_waiver_reason_value
    then
      raise exception 'Idempotency key was reused with a different commission treatment'
        using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
    end if;
  else
    if commercial_treatment_value = 'staff_family'
      and booking_row.operational_status = 'issued'
    then
      select count(*)::integer into invalid_fare_count
      from public.ticket_passenger_fare_lines fare
      where fare.transaction_id = transaction_id_value
        and (
          fare.unit_supplier_cost_source is null
          or fare.unit_sale_price_source is null
          or fare.unit_supplier_cost_source is distinct from fare.unit_sale_price_source
        );
      if invalid_fare_count > 0 then
        raise exception 'Staff/family tickets must be sold at supplier cost'
          using errcode = '23514', hint = 'TICKETING_STAFF_FAMILY_AT_COST_REQUIRED';
      end if;
    end if;

    update public.ticket_bookings booking
    set commercial_treatment = commercial_treatment_value,
        commission_waiver_reason = commission_waiver_reason_value,
        updated_by = p_actor_employee_id
    where booking.id = booking_id_value;

    insert into public.ticket_audit_events (
      entity_type, entity_id, booking_id, transaction_id, action,
      actor_employee_id, before_state, after_state
    ) values (
      'booking', booking_id_value, booking_id_value, transaction_id_value,
      'ticket_commercial_treatment_recorded', p_actor_employee_id,
      jsonb_build_object('commercialTreatment', booking_row.commercial_treatment),
      jsonb_build_object(
        'commercialTreatment', commercial_treatment_value,
        'commissionWaived', commercial_treatment_value <> 'standard',
        'reason', commission_waiver_reason_value
      )
    );

    booking_row.commercial_treatment := commercial_treatment_value;
    booking_row.commission_waiver_reason := commission_waiver_reason_value;

    if commercial_treatment_value <> 'standard'
      and booking_row.operational_status = 'issued'
    then
      select distinct on (source_event.source_fact_key) source_event.*
      into source_event_row
      from public.commission_source_events source_event
      where source_event.source_module = 'ticketing'
        and source_event.source_fact_key =
          'transaction:' || transaction_id_value::text || ':issued'
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
          'variables', source_event_row.variables,
          'idempotency_key', 'commercial:' || booking_id_value::text
        ));
      end if;
    end if;
  end if;

  return response_value || jsonb_build_object(
    'commercialTreatment', booking_row.commercial_treatment,
    'commissionWaived', booking_row.commercial_treatment <> 'standard',
    'commissionWaiverReason', booking_row.commission_waiver_reason
  );
end
$$;

create or replace function public.ticketing_append_fare_adjustment_commercial(
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
declare
  response_value jsonb;
  reprice_row public.ticket_staff_family_fare_reprices%rowtype;
  treatment_value text;
begin
  response_value := public.ticketing_append_fare_adjustment(
    p_actor_employee_id, p_booking_id, p_idempotency_key, p_entry
  );

  select reprice.* into reprice_row
  from public.ticket_staff_family_fare_reprices reprice
  where reprice.adjustment_id = (response_value #>> '{adjustment,id}')::uuid;

  select booking.commercial_treatment into treatment_value
  from public.ticket_bookings booking
  where booking.id = p_booking_id;

  return response_value || jsonb_build_object(
    'commercialTreatment', treatment_value,
    'staffFamilyReprice', case when reprice_row.adjustment_id is null then null
      else jsonb_build_object(
        'companyFeePercent', reprice_row.company_fee_percent,
        'supplierDifferenceGbp', reprice_row.supplier_difference_gbp,
        'customerPriceBeforeGbp', reprice_row.customer_price_before_gbp,
        'companyFeeGbp', reprice_row.company_fee_gbp,
        'customerCreditGbp', reprice_row.customer_credit_gbp,
        'customerAdditionalChargeGbp', reprice_row.customer_additional_charge_gbp,
        'customerPriceAfterGbp', reprice_row.customer_price_after_gbp
      ) end
  );
end
$$;

revoke all on table public.ticketing_staff_family_policy,
  public.ticketing_staff_family_employee_policies,
  public.ticket_staff_family_fare_reprices
  from public, anon, authenticated, service_role;
grant select on table public.ticketing_staff_family_policy,
  public.ticketing_staff_family_employee_policies,
  public.ticket_staff_family_fare_reprices
  to service_role;

alter table public.ticketing_staff_family_policy enable row level security;
alter table public.ticketing_staff_family_employee_policies enable row level security;
alter table public.ticket_staff_family_fare_reprices enable row level security;

drop policy if exists "Service role reads ticketing_staff_family_policy"
  on public.ticketing_staff_family_policy;
create policy "Service role reads ticketing_staff_family_policy"
  on public.ticketing_staff_family_policy for select to service_role using (true);
drop policy if exists "Service role reads ticketing_staff_family_employee_policies"
  on public.ticketing_staff_family_employee_policies;
create policy "Service role reads ticketing_staff_family_employee_policies"
  on public.ticketing_staff_family_employee_policies for select to service_role using (true);
drop policy if exists "Service role reads ticket_staff_family_fare_reprices"
  on public.ticket_staff_family_fare_reprices;
create policy "Service role reads ticket_staff_family_fare_reprices"
  on public.ticket_staff_family_fare_reprices for select to service_role using (true);

revoke all on function public.ticketing_record_staff_family_fare_reprice_2026083102(),
  public.enrich_ticketing_source_event_commercial_2026083102(),
  public.ticketing_validate_staff_family_fare_line_2026083102(),
  public.ticketing_validate_staff_family_refund_2026083102(),
  public.ticketing_create_quick_tk_commercial(uuid,text,jsonb),
  public.ticketing_append_fare_adjustment_commercial(uuid,uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.ticketing_create_quick_tk_commercial(uuid,text,jsonb),
  public.ticketing_append_fare_adjustment_commercial(uuid,uuid,text,jsonb)
  to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026083102,
  clock_timestamp(),
  coalesce((select details from public.portal_schema_versions where component = 'ticketing'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260831_ticketing_waiver_staff_family_commercial_policy.sql',
      'capabilities', coalesce((
        select details -> 'capabilities'
        from public.portal_schema_versions
        where component = 'ticketing' and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array(
        'booking-commission-treatment',
        'staff-family-at-cost-ticketing',
        'staff-family-low-fare-repricing',
        'staff-family-change-refund-fees'
      )
    )
)
on conflict (component) do update
set version = excluded.version,
    applied_at = excluded.applied_at,
    details = excluded.details
where public.portal_schema_versions.version < excluded.version;

commit;
