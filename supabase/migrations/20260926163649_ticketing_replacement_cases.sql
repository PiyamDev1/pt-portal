begin;

create table if not exists public.ticket_replacement_cases (
  id uuid primary key default gen_random_uuid(),
  original_booking_id uuid not null references public.ticket_bookings(id) on delete restrict,
  original_transaction_id uuid not null references public.ticket_transactions(id) on delete restrict,
  responsible_employee_id uuid not null references public.employees(id) on delete restrict,
  created_by_employee_id uuid not null references public.employees(id) on delete restrict,
  reason text not null,
  recovery_policy text not null,
  original_sale_gbp numeric(14,2) not null,
  original_supplier_cost_gbp numeric(14,2) not null,
  replacement_supplier_cost_gbp numeric(14,2) not null,
  supplier_cost_increase_gbp numeric(14,2) not null,
  company_margin_absorbed_gbp numeric(14,2) not null,
  employee_recovery_gbp numeric(14,2) not null,
  original_commission_treatment text not null default 'reverse',
  replacement_commission_treatment text not null default 'standard',
  status text not null default 'recorded',
  notes text,
  request_payload jsonb not null,
  idempotency_key text not null,
  version bigint not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint ticket_replacement_cases_original_unique unique (original_booking_id),
  constraint ticket_replacement_cases_actor_key_unique
    unique (created_by_employee_id, idempotency_key),
  constraint ticket_replacement_cases_reason_check check (
    reason in (
      'fare_expired_staff_error', 'supplier_failure', 'schedule_disruption',
      'customer_requested_change', 'other'
    )
  ),
  constraint ticket_replacement_cases_recovery_policy_check check (
    recovery_policy in ('above_customer_sale', 'full_cost_increase', 'business_absorbs')
  ),
  constraint ticket_replacement_cases_commission_check check (
    original_commission_treatment = 'reverse'
    and replacement_commission_treatment = 'standard'
  ),
  constraint ticket_replacement_cases_status_check check (
    status in ('recorded', 'closed', 'voided')
  ),
  constraint ticket_replacement_cases_money_check check (
    original_sale_gbp >= 0 and original_supplier_cost_gbp >= 0
    and replacement_supplier_cost_gbp >= 0 and supplier_cost_increase_gbp >= 0
    and company_margin_absorbed_gbp >= 0 and employee_recovery_gbp >= 0
  ),
  constraint ticket_replacement_cases_notes_check check (
    notes is null or length(btrim(notes)) between 1 and 2000
  ),
  constraint ticket_replacement_cases_key_check check (
    length(btrim(idempotency_key)) between 8 and 200
  ),
  constraint ticket_replacement_cases_request_check check (
    jsonb_typeof(request_payload) = 'object'
  )
);

create table if not exists public.ticket_replacement_case_items (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.ticket_replacement_cases(id) on delete restrict,
  booking_id uuid not null references public.ticket_bookings(id) on delete restrict,
  transaction_id uuid not null references public.ticket_transactions(id) on delete restrict,
  owner_employee_id uuid not null references public.employees(id) on delete restrict,
  pnr text not null,
  supplier_cost_gbp numeric(14,2) not null,
  sale_price_gbp numeric(14,2) not null,
  position integer not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint ticket_replacement_case_items_booking_unique unique (booking_id),
  constraint ticket_replacement_case_items_case_booking_unique unique (case_id, booking_id),
  constraint ticket_replacement_case_items_case_position_unique unique (case_id, position),
  constraint ticket_replacement_case_items_position_check check (position between 1 and 8),
  constraint ticket_replacement_case_items_money_check check (
    supplier_cost_gbp >= 0 and sale_price_gbp >= 0
  ),
  constraint ticket_replacement_case_items_pnr_check check (
    length(btrim(pnr)) between 3 and 12
  )
);

create table if not exists public.ticket_replacement_case_changes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.ticket_replacement_cases(id) on delete restrict,
  replaced_item_id uuid not null references public.ticket_replacement_case_items(id) on delete restrict,
  new_booking_id uuid not null references public.ticket_bookings(id) on delete restrict,
  new_transaction_id uuid not null references public.ticket_transactions(id) on delete restrict,
  servicing_employee_id uuid not null references public.employees(id) on delete restrict,
  created_by_employee_id uuid not null references public.employees(id) on delete restrict,
  new_pnr text not null,
  supplier_refund_gbp numeric(14,2) not null,
  supplier_admin_fee_gbp numeric(14,2) not null,
  new_supplier_cost_gbp numeric(14,2) not null,
  customer_charge_gbp numeric(14,2) not null,
  incremental_result_gbp numeric(14,2) not null,
  notes text,
  request_payload jsonb not null,
  idempotency_key text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint ticket_replacement_case_changes_new_booking_unique unique (new_booking_id),
  constraint ticket_replacement_case_changes_case_new_booking_unique
    unique (case_id, new_booking_id),
  constraint ticket_replacement_case_changes_actor_key_unique
    unique (created_by_employee_id, idempotency_key),
  constraint ticket_replacement_case_changes_money_check check (
    supplier_refund_gbp >= 0 and supplier_admin_fee_gbp >= 0
    and new_supplier_cost_gbp >= 0 and customer_charge_gbp >= 0
  ),
  constraint ticket_replacement_case_changes_notes_check check (
    notes is null or length(btrim(notes)) between 1 and 2000
  ),
  constraint ticket_replacement_case_changes_key_check check (
    length(btrim(idempotency_key)) between 8 and 200
  ),
  constraint ticket_replacement_case_changes_request_check check (
    jsonb_typeof(request_payload) = 'object'
  )
);

create index if not exists ticket_replacement_cases_responsible_idx
  on public.ticket_replacement_cases (responsible_employee_id, created_at desc);
create index if not exists ticket_replacement_cases_created_by_idx
  on public.ticket_replacement_cases (created_by_employee_id, created_at desc);
create index if not exists ticket_replacement_case_items_booking_idx
  on public.ticket_replacement_case_items (booking_id);
create index if not exists ticket_replacement_case_items_transaction_idx
  on public.ticket_replacement_case_items (transaction_id);
create index if not exists ticket_replacement_case_items_owner_idx
  on public.ticket_replacement_case_items (owner_employee_id, created_at desc);
create index if not exists ticket_replacement_case_changes_item_idx
  on public.ticket_replacement_case_changes (replaced_item_id, created_at desc);
create index if not exists ticket_replacement_case_changes_new_transaction_idx
  on public.ticket_replacement_case_changes (new_transaction_id);
create index if not exists ticket_replacement_case_changes_servicing_idx
  on public.ticket_replacement_case_changes (servicing_employee_id, created_at desc);

alter table public.ticket_replacement_cases enable row level security;
alter table public.ticket_replacement_case_items enable row level security;
alter table public.ticket_replacement_case_changes enable row level security;

revoke all on table
  public.ticket_replacement_cases,
  public.ticket_replacement_case_items,
  public.ticket_replacement_case_changes
  from public, anon, authenticated, service_role;
grant select on table
  public.ticket_replacement_cases,
  public.ticket_replacement_case_items,
  public.ticket_replacement_case_changes
  to service_role;

create or replace function public.ticketing_create_replacement_case_2026092601(
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
  actor_is_admin boolean;
  original record;
  replacement record;
  existing public.ticket_replacement_cases%rowtype;
  created public.ticket_replacement_cases%rowtype;
  responsible_active boolean;
  replacement_value jsonb;
  replacement_booking_id_value uuid;
  replacement_transaction_id_value uuid;
  replacement_total numeric(14,2) := 0;
  supplier_increase numeric(14,2);
  recovery numeric(14,2);
  absorbed numeric(14,2);
  policy_value text;
  reason_value text;
  notes_value text;
  expected_version bigint;
  item_position integer := 0;
  canonical_request jsonb;
begin
  if p_actor_employee_id is null
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 200
    or jsonb_typeof(p_entry) <> 'object'
  then
    raise exception 'Invalid replacement-case request' using errcode = '22023';
  end if;

  select employee.is_active,
    regexp_replace(lower(btrim(role.name)), '[_-]+', ' ', 'g') in (
      'maintenance admin', 'admin', 'master admin', 'super admin'
    )
  into responsible_active, actor_is_admin
  from public.employees employee
  join public.roles role on role.id = employee.role_id
  where employee.id = p_actor_employee_id
  for share of employee, role;
  if not found or not responsible_active then
    raise exception 'Active Ticketing employee required' using errcode = '42501';
  end if;

  reason_value := p_entry ->> 'reason';
  policy_value := p_entry ->> 'recoveryPolicy';
  notes_value := nullif(btrim(p_entry ->> 'notes'), '');
  expected_version := nullif(p_entry #>> '{original,expectedBookingVersion}', '')::bigint;
  if reason_value not in (
      'fare_expired_staff_error', 'supplier_failure', 'schedule_disruption',
      'customer_requested_change', 'other'
    )
    or policy_value not in ('above_customer_sale', 'full_cost_increase', 'business_absorbs')
    or expected_version is null or expected_version < 1
    or jsonb_typeof(p_entry -> 'replacements') <> 'array'
    or jsonb_array_length(p_entry -> 'replacements') not between 1 and 8
    or (notes_value is not null and length(notes_value) > 2000)
  then
    raise exception 'Invalid replacement-case details' using errcode = '22023';
  end if;

  canonical_request := (jsonb_strip_nulls(p_entry) - 'notes')
    || jsonb_build_object('notes', notes_value);
  perform pg_advisory_xact_lock(hashtextextended(
    'ticketing-replacement-case:' || p_actor_employee_id::text || ':' || p_idempotency_key,
    0
  ));
  select * into existing
  from public.ticket_replacement_cases replacement_case
  where replacement_case.created_by_employee_id = p_actor_employee_id
    and replacement_case.idempotency_key = p_idempotency_key;
  if found then
    if existing.request_payload is distinct from canonical_request then
      raise exception 'Replacement-case save key was reused with different details'
        using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'caseId', existing.id, 'version', existing.version,
      'employeeRecoveryGbp', existing.employee_recovery_gbp,
      'idempotentReplay', true
    );
  end if;

  perform 1
  from public.ticket_bookings booking
  where booking.id = nullif(p_entry #>> '{original,bookingId}', '')::uuid
  for update;

  select booking.id as booking_id, booking.version as booking_version,
    booking.owner_employee_id, transaction.id as transaction_id,
    count(*) filter (
      where fare.sale_total_gbp is null or fare.supplier_total_gbp is null
    )::integer as incomplete_fare_count,
    coalesce(sum(fare.sale_total_gbp), 0)::numeric(14,2) as sale_total,
    coalesce(sum(fare.supplier_total_gbp), 0)::numeric(14,2) as supplier_total
  into original
  from public.ticket_bookings booking
  join public.ticket_transactions transaction
    on transaction.id = nullif(p_entry #>> '{original,transactionId}', '')::uuid
    and transaction.booking_id = booking.id
    and transaction.service_type = 'TK'
    and transaction.parent_transaction_id is null
    and transaction.operational_status = 'issued'
  join public.ticket_passenger_fare_lines fare on fare.transaction_id = transaction.id
  where booking.id = nullif(p_entry #>> '{original,bookingId}', '')::uuid
    and booking.archived_at is null
  group by booking.id, booking.version, booking.owner_employee_id, transaction.id;
  if not found then
    raise exception 'Original issued ticket was not found' using errcode = 'P0002';
  end if;
  if original.incomplete_fare_count > 0 then
    raise exception 'Complete the original supplier cost and sale price first'
      using errcode = '22023';
  end if;
  if original.booking_version <> expected_version then
    raise exception 'Original ticket changed; reload before saving'
      using errcode = '40001', hint = 'TICKETING_REPLACEMENT_VERSION_CONFLICT';
  end if;
  if not actor_is_admin and original.owner_employee_id <> p_actor_employee_id then
    raise exception 'Only the ticket owner or Master Admin may create this case'
      using errcode = '42501';
  end if;

  select employee.is_active into responsible_active
  from public.employees employee
  where employee.id = nullif(p_entry ->> 'responsibleEmployeeId', '')::uuid
  for share;
  if not found or not responsible_active then
    raise exception 'Responsible employee is invalid or inactive' using errcode = '22023';
  end if;
  if not actor_is_admin
    and nullif(p_entry ->> 'responsibleEmployeeId', '')::uuid <> p_actor_employee_id
  then
    raise exception 'Only Master Admin may assign responsibility to another employee'
      using errcode = '42501';
  end if;

  for replacement_value in
    select value from jsonb_array_elements(p_entry -> 'replacements')
  loop
    item_position := item_position + 1;
    replacement_booking_id_value := nullif(replacement_value ->> 'bookingId', '')::uuid;
    replacement_transaction_id_value := nullif(replacement_value ->> 'transactionId', '')::uuid;
    if replacement_booking_id_value is null or replacement_transaction_id_value is null
      or replacement_booking_id_value = original.booking_id
    then
      raise exception 'Select valid replacement tickets' using errcode = '22023';
    end if;

    select booking.id as booking_id, booking.owner_employee_id, booking.pnr,
      transaction.id as transaction_id,
      count(*) filter (
        where fare.sale_total_gbp is null or fare.supplier_total_gbp is null
      )::integer as incomplete_fare_count,
      coalesce(sum(fare.sale_total_gbp), 0)::numeric(14,2) as sale_total,
      coalesce(sum(fare.supplier_total_gbp), 0)::numeric(14,2) as supplier_total
    into replacement
    from public.ticket_bookings booking
    join public.ticket_transactions transaction
      on transaction.id = replacement_transaction_id_value
      and transaction.booking_id = booking.id
      and transaction.service_type = 'TK'
      and transaction.parent_transaction_id is null
      and transaction.operational_status = 'issued'
    join public.ticket_passenger_fare_lines fare on fare.transaction_id = transaction.id
    where booking.id = replacement_booking_id_value
      and booking.archived_at is null
    group by booking.id, booking.owner_employee_id, booking.pnr, transaction.id;
    if not found then
      raise exception 'An issued replacement ticket was not found' using errcode = 'P0002';
    end if;
    if replacement.incomplete_fare_count > 0 then
      raise exception 'Complete every replacement supplier cost and sale price first'
        using errcode = '22023';
    end if;
    if not actor_is_admin and replacement.owner_employee_id <> p_actor_employee_id then
      raise exception 'Only Master Admin may link another employee''s replacement ticket'
        using errcode = '42501';
    end if;
    if exists (
      select 1 from public.ticket_replacement_case_items item
      where item.booking_id = replacement.booking_id
    ) then
      raise exception 'A replacement ticket is already linked to another case'
        using errcode = '23505', hint = 'TICKETING_REPLACEMENT_ALREADY_LINKED';
    end if;
    replacement_total := round(replacement_total + replacement.supplier_total, 2);
  end loop;

  supplier_increase := greatest(round(replacement_total - original.supplier_total, 2), 0);
  recovery := case policy_value
    when 'above_customer_sale' then greatest(round(replacement_total - original.sale_total, 2), 0)
    when 'full_cost_increase' then supplier_increase
    else 0
  end;
  absorbed := greatest(round(supplier_increase - recovery, 2), 0);

  insert into public.ticket_replacement_cases (
    original_booking_id, original_transaction_id, responsible_employee_id,
    created_by_employee_id, reason, recovery_policy,
    original_sale_gbp, original_supplier_cost_gbp, replacement_supplier_cost_gbp,
    supplier_cost_increase_gbp, company_margin_absorbed_gbp, employee_recovery_gbp,
    notes, request_payload, idempotency_key
  ) values (
    original.booking_id, original.transaction_id,
    nullif(p_entry ->> 'responsibleEmployeeId', '')::uuid,
    p_actor_employee_id, reason_value, policy_value,
    original.sale_total, original.supplier_total, replacement_total,
    supplier_increase, absorbed, recovery, notes_value, canonical_request, p_idempotency_key
  ) returning * into created;

  item_position := 0;
  for replacement_value in
    select value from jsonb_array_elements(p_entry -> 'replacements')
  loop
    item_position := item_position + 1;
    replacement_booking_id_value := (replacement_value ->> 'bookingId')::uuid;
    replacement_transaction_id_value := (replacement_value ->> 'transactionId')::uuid;
    select booking.owner_employee_id, booking.pnr,
      coalesce(sum(fare.sale_total_gbp), 0)::numeric(14,2) as sale_total,
      coalesce(sum(fare.supplier_total_gbp), 0)::numeric(14,2) as supplier_total
    into replacement
    from public.ticket_bookings booking
    join public.ticket_transactions transaction
      on transaction.id = replacement_transaction_id_value
      and transaction.booking_id = booking.id
    join public.ticket_passenger_fare_lines fare on fare.transaction_id = transaction.id
    where booking.id = replacement_booking_id_value
    group by booking.owner_employee_id, booking.pnr;
    insert into public.ticket_replacement_case_items (
      case_id, booking_id, transaction_id, owner_employee_id, pnr,
      supplier_cost_gbp, sale_price_gbp, position
    ) values (
      created.id, replacement_booking_id_value, replacement_transaction_id_value,
      replacement.owner_employee_id, replacement.pnr, replacement.supplier_total,
      replacement.sale_total, item_position
    );
  end loop;

  insert into public.ticket_audit_events (
    entity_type, entity_id, booking_id, transaction_id, action,
    actor_employee_id, after_state
  ) values (
    'booking', original.booking_id, original.booking_id, original.transaction_id,
    'replacement_case_created', p_actor_employee_id,
    jsonb_build_object(
      'caseId', created.id, 'reason', created.reason,
      'recoveryPolicy', created.recovery_policy,
      'replacementSupplierCostGbp', created.replacement_supplier_cost_gbp,
      'supplierCostIncreaseGbp', created.supplier_cost_increase_gbp,
      'companyMarginAbsorbedGbp', created.company_margin_absorbed_gbp,
      'employeeRecoveryGbp', created.employee_recovery_gbp,
      'originalCommissionTreatment', created.original_commission_treatment,
      'replacementCommissionTreatment', created.replacement_commission_treatment
    )
  );

  return jsonb_build_object(
    'caseId', created.id, 'version', created.version,
    'employeeRecoveryGbp', created.employee_recovery_gbp,
    'idempotentReplay', false
  );
end
$$;

create or replace function public.ticketing_append_replacement_change_2026092601(
  p_actor_employee_id uuid,
  p_case_id uuid,
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
  actor_is_admin boolean;
  actor_active boolean;
  case_row public.ticket_replacement_cases%rowtype;
  item_row public.ticket_replacement_case_items%rowtype;
  new_ticket record;
  existing public.ticket_replacement_case_changes%rowtype;
  created public.ticket_replacement_case_changes%rowtype;
  expected_version bigint;
  supplier_refund numeric(14,2);
  supplier_admin numeric(14,2);
  customer_charge numeric(14,2);
  notes_value text;
  canonical_request jsonb;
begin
  if p_actor_employee_id is null or p_case_id is null
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 200
    or jsonb_typeof(p_entry) <> 'object'
  then
    raise exception 'Invalid replacement-change request' using errcode = '22023';
  end if;
  select employee.is_active,
    regexp_replace(lower(btrim(role.name)), '[_-]+', ' ', 'g') in (
      'maintenance admin', 'admin', 'master admin', 'super admin'
    )
  into actor_active, actor_is_admin
  from public.employees employee
  join public.roles role on role.id = employee.role_id
  where employee.id = p_actor_employee_id
  for share of employee, role;
  if not found or not actor_active then
    raise exception 'Active Ticketing employee required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'ticketing-replacement-change:' || p_actor_employee_id::text || ':' || p_idempotency_key,
    0
  ));
  select * into existing
  from public.ticket_replacement_case_changes change_row
  where change_row.created_by_employee_id = p_actor_employee_id
    and change_row.idempotency_key = p_idempotency_key;
  if found then
    canonical_request := (jsonb_strip_nulls(p_entry) - 'notes')
      || jsonb_build_object('notes', nullif(btrim(p_entry ->> 'notes'), ''));
    if existing.request_payload is distinct from canonical_request then
      raise exception 'Later-change save key was reused with different details'
        using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'caseId', existing.case_id, 'changeId', existing.id,
      'incrementalResultGbp', existing.incremental_result_gbp,
      'idempotentReplay', true
    );
  end if;

  expected_version := nullif(p_entry ->> 'expectedVersion', '')::bigint;
  supplier_refund := nullif(p_entry ->> 'supplierRefundGbp', '')::numeric(14,2);
  supplier_admin := nullif(p_entry ->> 'supplierAdminFeeGbp', '')::numeric(14,2);
  customer_charge := nullif(p_entry ->> 'customerChargeGbp', '')::numeric(14,2);
  notes_value := nullif(btrim(p_entry ->> 'notes'), '');
  canonical_request := (jsonb_strip_nulls(p_entry) - 'notes')
    || jsonb_build_object('notes', notes_value);
  if expected_version is null or expected_version < 1
    or supplier_refund is null or supplier_refund < 0
    or supplier_admin is null or supplier_admin < 0
    or customer_charge is null or customer_charge < 0
    or (notes_value is not null and length(notes_value) > 2000)
  then
    raise exception 'Invalid later-change details' using errcode = '22023';
  end if;

  select * into case_row from public.ticket_replacement_cases
  where id = p_case_id for update;
  if not found then raise exception 'Replacement case was not found' using errcode = 'P0002'; end if;
  if case_row.version <> expected_version then
    raise exception 'Replacement case changed; reload before saving'
      using errcode = '40001', hint = 'TICKETING_REPLACEMENT_VERSION_CONFLICT';
  end if;
  if case_row.status <> 'recorded' then
    raise exception 'Only an open replacement case can accept a later change'
      using errcode = '55000';
  end if;

  select * into item_row from public.ticket_replacement_case_items
  where id = nullif(p_entry ->> 'replacedItemId', '')::uuid
    and case_id = case_row.id
  for share;
  if not found then raise exception 'Select the replaced ticket from this case' using errcode = 'P0002'; end if;
  if not actor_is_admin
    and p_actor_employee_id not in (
      case_row.created_by_employee_id, case_row.responsible_employee_id, item_row.owner_employee_id
    )
  then
    raise exception 'Only a case participant or Master Admin may add this change'
      using errcode = '42501';
  end if;
  if round(supplier_refund + supplier_admin, 2) > item_row.supplier_cost_gbp then
    raise exception 'Supplier refund and admin fee exceed the replaced ticket cost'
      using errcode = '22023';
  end if;

  perform 1
  from public.ticket_bookings booking
  where booking.id = nullif(p_entry #>> '{replacement,bookingId}', '')::uuid
  for share;

  select booking.id as booking_id, booking.pnr, booking.owner_employee_id,
    transaction.id as transaction_id,
    count(*) filter (
      where fare.sale_total_gbp is null or fare.supplier_total_gbp is null
    )::integer as incomplete_fare_count,
    coalesce(sum(fare.supplier_total_gbp), 0)::numeric(14,2) as supplier_total
  into new_ticket
  from public.ticket_bookings booking
  join public.ticket_transactions transaction
    on transaction.id = nullif(p_entry #>> '{replacement,transactionId}', '')::uuid
    and transaction.booking_id = booking.id
    and transaction.service_type = 'TK'
    and transaction.parent_transaction_id is null
    and transaction.operational_status = 'issued'
  join public.ticket_passenger_fare_lines fare on fare.transaction_id = transaction.id
  where booking.id = nullif(p_entry #>> '{replacement,bookingId}', '')::uuid
    and booking.archived_at is null
  group by booking.id, booking.pnr, booking.owner_employee_id, transaction.id;
  if not found then raise exception 'New issued ticket was not found' using errcode = 'P0002'; end if;
  if new_ticket.incomplete_fare_count > 0 then
    raise exception 'Complete the new ticket supplier cost and sale price first'
      using errcode = '22023';
  end if;
  if new_ticket.booking_id in (
    case_row.original_booking_id,
    item_row.booking_id
  ) then
    raise exception 'Select the newly issued replacement ticket' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.ticket_replacement_case_items linked_item
    where linked_item.booking_id = new_ticket.booking_id
  ) or exists (
    select 1
    from public.ticket_replacement_cases linked_case
    where linked_case.original_booking_id = new_ticket.booking_id
  ) then
    raise exception 'This ticket is already linked to another replacement case'
      using errcode = '23505', hint = 'TICKETING_REPLACEMENT_ALREADY_LINKED';
  end if;
  if not actor_is_admin and new_ticket.owner_employee_id <> p_actor_employee_id then
    raise exception 'Only Master Admin may link another employee''s new ticket'
      using errcode = '42501';
  end if;

  insert into public.ticket_replacement_case_changes (
    case_id, replaced_item_id, new_booking_id, new_transaction_id,
    servicing_employee_id, created_by_employee_id, new_pnr,
    supplier_refund_gbp, supplier_admin_fee_gbp, new_supplier_cost_gbp,
    customer_charge_gbp, incremental_result_gbp, notes, request_payload, idempotency_key
  ) values (
    case_row.id, item_row.id, new_ticket.booking_id, new_ticket.transaction_id,
    new_ticket.owner_employee_id, p_actor_employee_id, new_ticket.pnr,
    supplier_refund, supplier_admin, new_ticket.supplier_total,
    customer_charge,
    round(customer_charge + supplier_refund - new_ticket.supplier_total, 2),
    notes_value, canonical_request, p_idempotency_key
  ) returning * into created;

  update public.ticket_replacement_cases replacement_case
  set version = replacement_case.version + 1,
      updated_at = clock_timestamp()
  where replacement_case.id = case_row.id
  returning * into case_row;

  insert into public.ticket_audit_events (
    entity_type, entity_id, booking_id, transaction_id, action,
    actor_employee_id, after_state
  ) values (
    'booking', case_row.original_booking_id, case_row.original_booking_id,
    case_row.original_transaction_id, 'replacement_case_change_added',
    p_actor_employee_id,
    jsonb_build_object(
      'caseId', case_row.id, 'changeId', created.id,
      'replacedItemId', created.replaced_item_id,
      'newBookingId', created.new_booking_id,
      'supplierRefundGbp', created.supplier_refund_gbp,
      'supplierAdminFeeGbp', created.supplier_admin_fee_gbp,
      'newSupplierCostGbp', created.new_supplier_cost_gbp,
      'customerChargeGbp', created.customer_charge_gbp,
      'incrementalResultGbp', created.incremental_result_gbp
    )
  );

  return jsonb_build_object(
    'caseId', case_row.id, 'caseVersion', case_row.version,
    'changeId', created.id,
    'incrementalResultGbp', created.incremental_result_gbp,
    'idempotentReplay', false
  );
end
$$;

revoke all on function
  public.ticketing_create_replacement_case_2026092601(uuid,text,jsonb),
  public.ticketing_append_replacement_change_2026092601(uuid,uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.ticketing_create_replacement_case_2026092601(uuid,text,jsonb),
  public.ticketing_append_replacement_change_2026092601(uuid,uuid,text,jsonb)
  to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026092601,
  clock_timestamp(),
  coalesce((select details from public.portal_schema_versions where component = 'ticketing'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260926163649_ticketing_replacement_cases.sql',
      'capabilities', coalesce((
        select details -> 'capabilities'
        from public.portal_schema_versions
        where component = 'ticketing' and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array(
        'multi-ticket-replacement-cases',
        'responsibility-recovery-snapshots',
        'separate-later-change-events'
      )
    )
)
on conflict (component) do update
set version = excluded.version,
    applied_at = excluded.applied_at,
    details = excluded.details
where public.portal_schema_versions.version < excluded.version;

commit;
