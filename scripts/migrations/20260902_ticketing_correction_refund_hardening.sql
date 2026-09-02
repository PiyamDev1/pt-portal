-- Forward-only Ticketing capability 2026090204.
-- Hardens staff/commercial corrections and Refund confirmation without
-- rewriting data already deployed by capabilities 2026090201-2026090203.

begin;

select pg_advisory_xact_lock(hashtextextended('ticketing:schema-migration', 0));

do $ticketing_2026090204_guard$
declare
  installed_version bigint;
begin
  select version into installed_version
  from public.portal_schema_versions
  where component = 'ticketing'
  for update;

  if installed_version is null or installed_version < 2026090203 then
    raise exception 'Ticketing capability 2026090203 is required before capability 2026090204'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_NOT_READY';
  end if;
  if installed_version > 2026090204 then
    raise exception 'Ticketing migration capability % cannot run after installed capability %',
      2026090204, installed_version
      using errcode = '55000', hint = 'TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED';
  end if;
end
$ticketing_2026090204_guard$;

create or replace function public.ticketing_correct_booking_attribution_commercial_2026090201(
  p_actor_employee_id uuid,
  p_booking_id uuid,
  p_expected_booking_version bigint,
  p_idempotency_key text,
  p_correction jsonb
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
    'commercialTreatment',
    'commissionWaiverReason',
    'reason'
  ];
  action_name_value constant text := 'ticketing.correct_staff_commercial.v1';
  idempotency_key_value text := btrim(coalesce(p_idempotency_key, ''));
  canonical_request jsonb;
  existing_request jsonb;
  existing_response jsonb;
  unknown_key text;
  primary_employee_id_value uuid;
  assistant_employee_ids_value uuid[] := array[]::uuid[];
  assistant_count integer := 0;
  assistant_distinct_count integer := 0;
  commercial_treatment_value text;
  commission_waiver_reason_value text;
  correction_reason_value text;
  employee_lock_row record;
  actor_employee_found boolean := false;
  actor_is_active boolean := false;
  actor_is_admin boolean := false;
  primary_employee_is_active boolean := false;
  assistant_employee_active_count integer := 0;
  booking_row public.ticket_bookings%rowtype;
  previous_commercial_treatment text;
  previous_commission_waiver_reason text;
  current_attribution public.ticket_booking_attribution_versions%rowtype;
  current_assistant_ids uuid[] := array[]::uuid[];
  attribution_changed boolean;
  commercial_changed boolean;
  internal_attribution_key text;
  response_value jsonb;
  source_event_row public.commission_source_events%rowtype;
  source_event_result jsonb;
  source_event_corrections jsonb := '[]'::jsonb;
  invalid_fare_count integer := 0;
  incompatible_artifact_count integer := 0;
  refund_row public.ticket_refunds%rowtype;
  refund_context_id uuid;
  refund_event_id uuid;
  final_booking_version bigint;
  now_value timestamptz := clock_timestamp();
begin
  if p_actor_employee_id is null or p_booking_id is null
    or p_expected_booking_version is null or p_expected_booking_version < 1
    or length(idempotency_key_value) not between 1 and 200
  then
    raise exception 'Actor, booking, expected version, and idempotency key are required'
      using errcode = '22023';
  end if;

  if p_correction is null or jsonb_typeof(p_correction) is distinct from 'object' then
    raise exception 'Ticket correction must be a JSON object' using errcode = '22023';
  end if;

  select supplied.key into unknown_key
  from jsonb_object_keys(p_correction) supplied(key)
  where supplied.key <> all(expected_keys)
  limit 1;
  if found then
    raise exception 'Unknown ticket correction field: %', unknown_key using errcode = '22023';
  end if;

  if not p_correction ?& expected_keys
    or jsonb_typeof(p_correction -> 'responsibleEmployeeId') is distinct from 'string'
    or jsonb_typeof(p_correction -> 'assistantEmployeeIds') is distinct from 'array'
    or jsonb_typeof(p_correction -> 'commercialTreatment') is distinct from 'string'
    or jsonb_typeof(p_correction -> 'commissionWaiverReason') not in ('string', 'null')
    or jsonb_typeof(p_correction -> 'reason') is distinct from 'string'
  then
    raise exception 'Ticket correction fields are missing or invalid' using errcode = '22023';
  end if;

  begin
    primary_employee_id_value := (p_correction ->> 'responsibleEmployeeId')::uuid;
    select
      coalesce(array_agg(parsed.employee_id order by parsed.employee_id), array[]::uuid[]),
      count(*)::integer,
      count(distinct parsed.employee_id)::integer
    into assistant_employee_ids_value, assistant_count, assistant_distinct_count
    from (
      select (item.value #>> '{}')::uuid as employee_id
      from jsonb_array_elements(p_correction -> 'assistantEmployeeIds') item(value)
    ) parsed;
  exception when invalid_text_representation then
    raise exception 'Ticket correction contains an invalid employee ID' using errcode = '22023';
  end;

  commercial_treatment_value := lower(btrim(p_correction ->> 'commercialTreatment'));
  commission_waiver_reason_value := nullif(btrim(p_correction ->> 'commissionWaiverReason'), '');
  correction_reason_value := nullif(btrim(p_correction ->> 'reason'), '');

  if assistant_count > 10 or assistant_count <> assistant_distinct_count
    or primary_employee_id_value = any(assistant_employee_ids_value)
  then
    raise exception 'Select a valid responsible employee and unique assistants'
      using errcode = '22023', hint = 'TICKETING_ATTRIBUTION_INVALID';
  end if;
  if commercial_treatment_value not in ('standard', 'staff_family', 'commission_waived')
    or (commercial_treatment_value = 'standard' and commission_waiver_reason_value is not null)
    or (commercial_treatment_value <> 'standard'
      and length(coalesce(commission_waiver_reason_value, '')) not between 3 and 500)
  then
    raise exception 'Select a valid commission treatment and reason' using errcode = '22023';
  end if;
  if correction_reason_value is null or length(correction_reason_value) > 500 then
    raise exception 'A correction reason between 1 and 500 characters is required'
      using errcode = '22023', hint = 'TICKETING_ATTRIBUTION_REASON_REQUIRED';
  end if;

  canonical_request := jsonb_build_object(
    'bookingId', p_booking_id,
    'expectedBookingVersion', p_expected_booking_version,
    'responsibleEmployeeId', primary_employee_id_value,
    'assistantEmployeeIds', to_jsonb(assistant_employee_ids_value),
    'commercialTreatment', commercial_treatment_value,
    'commissionWaiverReason', commission_waiver_reason_value,
    'reason', correction_reason_value
  );

  -- Lock every identity in one stable order before consulting idempotency.
  -- Revoked actors cannot replay privileged responses, and selected inactive
  -- employees cannot be restored through an old retry.
  for employee_lock_row in
    select employee.id, employee.is_active,
      regexp_replace(lower(btrim(role.name)), '[_-]+', ' ', 'g') as role_name
    from public.employees employee
    join public.roles role on role.id = employee.role_id
    where employee.id = any(
      array[p_actor_employee_id, primary_employee_id_value] || assistant_employee_ids_value
    )
    order by employee.id
    for share of employee, role
  loop
    if employee_lock_row.id = p_actor_employee_id then
      actor_employee_found := true;
      actor_is_active := employee_lock_row.is_active;
      actor_is_admin := employee_lock_row.role_name in (
        'maintenance admin', 'admin', 'master admin', 'super admin'
      );
    end if;
    if employee_lock_row.id = primary_employee_id_value then
      primary_employee_is_active := employee_lock_row.is_active;
    end if;
    if employee_lock_row.id = any(assistant_employee_ids_value)
      and employee_lock_row.is_active then
      assistant_employee_active_count := assistant_employee_active_count + 1;
    end if;
  end loop;
  if not actor_employee_found or not actor_is_active or not actor_is_admin then
    raise exception 'Only an active record manager may correct this ticket'
      using errcode = '42501';
  end if;
  if not primary_employee_is_active or assistant_employee_active_count <> assistant_count then
    raise exception 'One or more attribution employees are invalid or inactive'
      using errcode = '22023', hint = 'TICKETING_ATTRIBUTION_EMPLOYEE_INVALID';
  end if;

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
      raise exception 'Idempotency key was reused with a different ticket correction'
        using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
    end if;
    if existing_response is null then
      raise exception 'Ticket correction idempotency record is incomplete'
        using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'ticketing.attribution.booking:' || p_booking_id::text,
    0
  ));
  select booking.* into booking_row
  from public.ticket_bookings booking
  where booking.id = p_booking_id and booking.archived_at is null
  for update;
  if not found then
    raise exception 'Ticket record not found'
      using errcode = 'P0002', hint = 'TICKETING_RECORD_NOT_FOUND';
  end if;
  if booking_row.version <> p_expected_booking_version then
    raise exception 'Ticket booking version is stale'
      using errcode = '40001',
        detail = jsonb_build_object('bookingVersion', booking_row.version)::text,
        hint = 'TICKETING_VERSION_CONFLICT';
  end if;

  select attribution.* into current_attribution
  from public.ticket_booking_attribution_versions attribution
  where attribution.booking_id = p_booking_id
  order by attribution.attribution_version desc
  limit 1
  for update;
  if not found then
    raise exception 'Ticket attribution history is missing'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;
  select coalesce(array_agg(assistant.employee_id order by assistant.employee_id), array[]::uuid[])
  into current_assistant_ids
  from public.ticket_booking_attribution_assistants assistant
  where assistant.attribution_id = current_attribution.id;

  previous_commercial_treatment := booking_row.commercial_treatment;
  previous_commission_waiver_reason := booking_row.commission_waiver_reason;
  attribution_changed := current_attribution.primary_employee_id <> primary_employee_id_value
    or current_assistant_ids is distinct from assistant_employee_ids_value;
  commercial_changed := booking_row.commercial_treatment <> commercial_treatment_value
    or booking_row.commission_waiver_reason is distinct from commission_waiver_reason_value;

  if not attribution_changed and not commercial_changed then
    raise exception 'Ticket correction does not change staff attribution or commission treatment'
      using errcode = '22023', hint = 'TICKETING_ATTRIBUTION_NO_CHANGE';
  end if;

  -- Stable commercial lock order: booking, transactions, then live refunds.
  perform 1 from public.ticket_transactions transaction
  where transaction.booking_id = p_booking_id order by transaction.id for update;
  perform 1 from public.ticket_refunds refund
  where refund.booking_id = p_booking_id and refund.status <> 'voided'
  order by refund.id for update;

  if commercial_changed and commercial_treatment_value = 'staff_family'
  then
    select
      (select count(*) from public.ticket_transactions transaction
       where transaction.booking_id = p_booking_id
         and (transaction.service_type in ('DC', 'R-ER')
           or transaction.parent_transaction_id is not null))
      + (select count(*) from public.ticket_fare_adjustments adjustment
         where adjustment.booking_id = p_booking_id)
      + (select count(*) from public.ticket_refunds refund
         where refund.booking_id = p_booking_id)
      + (select count(*) from public.ticket_vouchers voucher
         where voucher.booking_id = p_booking_id)
      + (select count(*) from public.ticket_package_links package_link
         where package_link.booking_id = p_booking_id)
    into incompatible_artifact_count;
    if incompatible_artifact_count > 0 then
      raise exception 'Staff/family reclassification is unsafe after commercial activity exists'
        using errcode = '55000', hint = 'TICKETING_STAFF_FAMILY_RECLASSIFICATION_BLOCKED';
    end if;

    select count(*)::integer into invalid_fare_count
    from public.ticket_passenger_fare_lines fare
    join public.ticket_transactions transaction on transaction.id = fare.transaction_id
    where transaction.booking_id = p_booking_id
      and transaction.service_type = 'TK'
      and transaction.parent_transaction_id is null
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

  if attribution_changed then
    internal_attribution_key := 'staff-commercial:' || encode(
      digest(p_actor_employee_id::text || ':' || idempotency_key_value, 'sha256'),
      'hex'
    );
    response_value := public.ticketing_correct_booking_attribution(
      p_actor_employee_id,
      p_booking_id,
      p_expected_booking_version,
      internal_attribution_key,
      jsonb_build_object(
        'responsibleEmployeeId', primary_employee_id_value,
        'assistantEmployeeIds', to_jsonb(assistant_employee_ids_value),
        'reason', correction_reason_value
      )
    );
    source_event_corrections := coalesce(
      response_value -> 'sourceEventCorrections',
      '[]'::jsonb
    );
  end if;

  if commercial_changed then
    update public.ticket_bookings booking
    set commercial_treatment = commercial_treatment_value,
        commission_waiver_reason = commission_waiver_reason_value,
        updated_by = p_actor_employee_id
    where booking.id = p_booking_id;

    -- The predecessor attribution operation may have emitted an intermediate
    -- root-ticket version using the old treatment. Only report the final
    -- commercial correction versions from this operation.
    source_event_corrections := '[]'::jsonb;
  end if;

  if attribution_changed then
    for refund_row in
      select refund.* from public.ticket_refunds refund
      where refund.booking_id = p_booking_id and refund.status <> 'voided'
      order by refund.id
    loop
      refund_context_id := gen_random_uuid();
      insert into public.ticket_refund_write_contexts (id, refund_id, actor_employee_id)
      values (refund_context_id, refund_row.id, p_actor_employee_id);
      perform set_config('ticketing.refund_context_id', refund_context_id::text, true);
      update public.ticket_refunds refund set owner_employee_id = primary_employee_id_value
      where refund.id = refund_row.id
        and refund.owner_employee_id is distinct from primary_employee_id_value;
      delete from public.ticket_refund_write_contexts where id = refund_context_id;
      perform set_config('ticketing.refund_context_id', '', true);

      insert into public.ticket_audit_events (
        entity_type, entity_id, booking_id, transaction_id, action,
        actor_employee_id, reason, before_state, after_state
      ) values (
        'refund', refund_row.id, refund_row.booking_id, refund_row.transaction_id,
        'correct_refund_responsible_employee', p_actor_employee_id, correction_reason_value,
        jsonb_build_object('ownerEmployeeId', refund_row.owner_employee_id),
        jsonb_build_object('ownerEmployeeId', primary_employee_id_value)
      );

      if refund_row.confirmed_correct_at is not null then
        refund_event_id := gen_random_uuid();
        insert into public.ticket_refund_events (
          id, refund_id, event_type, actor_employee_id, event_date, reference,
          notes, event_data, idempotency_key
        ) values (
          refund_event_id, refund_row.id, 'booking_correction', p_actor_employee_id,
          current_date, 'STAFF-CORRECTION', correction_reason_value,
          jsonb_build_object(
            'bookingId', p_booking_id,
            'previousOwnerEmployeeId', refund_row.owner_employee_id,
            'ownerEmployeeId', primary_employee_id_value,
            'commercialTreatmentChanged', commercial_changed
          ),
          'refund-booking-correction:' || encode(digest(
            p_actor_employee_id::text || ':' || idempotency_key_value || ':'
              || refund_row.id::text, 'sha256'
          ), 'hex')
        );
      end if;
    end loop;
  elsif commercial_changed then
    for refund_row in
      select refund.* from public.ticket_refunds refund
      where refund.booking_id = p_booking_id and refund.status <> 'voided'
        and refund.confirmed_correct_at is not null
      order by refund.id
    loop
      refund_event_id := gen_random_uuid();
      insert into public.ticket_refund_events (
        id, refund_id, event_type, actor_employee_id, event_date, reference,
        notes, event_data, idempotency_key
      ) values (
        refund_event_id, refund_row.id, 'booking_correction', p_actor_employee_id,
        current_date, 'TREATMENT-CORRECTION', correction_reason_value,
        jsonb_build_object(
          'bookingId', p_booking_id,
          'ownerEmployeeId', refund_row.owner_employee_id,
          'commercialTreatmentChanged', true
        ),
        'refund-treatment-correction:' || encode(digest(
          p_actor_employee_id::text || ':' || idempotency_key_value || ':'
            || refund_row.id::text, 'sha256'
        ), 'hex')
      );
    end loop;
  end if;

  if attribution_changed or commercial_changed then
    for source_event_row in
      select distinct on (source_event.source_fact_key) source_event.*
      from public.commission_source_events source_event
      where source_event.source_module = 'ticketing'
        and source_event.source_fact_key not like 'refund:%:confirmed'
        and (
          source_event.variables ->> 'booking_id' = p_booking_id::text
          or exists (
            select 1 from public.ticket_transactions transaction
            where transaction.id = source_event.source_record_id
              and transaction.booking_id = p_booking_id
          )
          or exists (
            select 1 from public.ticket_fare_adjustments adjustment
            where adjustment.id = source_event.source_record_id
              and adjustment.booking_id = p_booking_id
          )
        )
        and (
          commercial_changed
          or not exists (
            select 1
            from jsonb_array_elements(source_event_corrections) correction(value)
            where correction.value ->> 'sourceFactKey' = source_event.source_fact_key
          )
        )
      order by source_event.source_fact_key, source_event.event_version desc
    loop
      source_event_result := public.append_commission_source_event(jsonb_build_object(
        'source_module', source_event_row.source_module,
        'source_event_id', gen_random_uuid(),
        'source_fact_key', source_event_row.source_fact_key,
        'source_record_id', source_event_row.source_record_id,
        'event_type', source_event_row.event_type,
        'contract_version', source_event_row.contract_version,
        'event_version', source_event_row.event_version + 1,
        'supersedes_event_id', source_event_row.source_event_id,
        'employee_id', case when attribution_changed
          then primary_employee_id_value else source_event_row.employee_id end,
        'owner_employee_id', case when attribution_changed
          then primary_employee_id_value else source_event_row.owner_employee_id end,
        'location_id', source_event_row.location_id,
        'occurred_at', now_value,
        'effective_on', source_event_row.effective_on,
        'source_path', source_event_row.source_path,
        'variables', (source_event_row.variables
          - 'commercial_treatment' - 'commission_waived' - 'commission_waiver_reason'
          - 'staff_family_company_fee_percent'
          - 'staff_family_customer_price_before_gbp'
          - 'staff_family_company_fee_gbp' - 'staff_family_customer_credit_gbp'
          - 'staff_family_customer_additional_charge_gbp'
          - 'staff_family_customer_price_after_gbp'
        ) || jsonb_build_object(
          'primary_responsible_employee_id', primary_employee_id_value,
          'assistant_employee_ids', to_jsonb(assistant_employee_ids_value)
        ),
        'idempotency_key', 'staff-commercial-correction:' || encode(digest(
          p_actor_employee_id::text || ':' || idempotency_key_value || ':'
            || source_event_row.source_fact_key,
          'sha256'
        ), 'hex')
      ));
      source_event_corrections := source_event_corrections || jsonb_build_array(
        jsonb_build_object(
          'sourceFactKey', source_event_row.source_fact_key,
          'sourceEventId', source_event_result ->> 'sourceEventId',
          'eventVersion', (source_event_result ->> 'eventVersion')::integer
        )
      );
    end loop;
  end if;

  if commercial_changed then
    insert into public.ticket_audit_events (
      entity_type, entity_id, booking_id, transaction_id, action,
      actor_employee_id, reason, before_state, after_state
    ) values (
      'booking', p_booking_id, p_booking_id, current_attribution.root_transaction_id,
      'correct_ticket_commercial_treatment', p_actor_employee_id, correction_reason_value,
      jsonb_build_object(
        'commercialTreatment', previous_commercial_treatment,
        'commissionWaiverReason', previous_commission_waiver_reason
      ),
      jsonb_build_object(
        'commercialTreatment', commercial_treatment_value,
        'commissionWaiverReason', commission_waiver_reason_value,
        'sourceEventCorrections', source_event_corrections
      )
    );
  end if;

  select booking.version into final_booking_version
  from public.ticket_bookings booking where booking.id = p_booking_id;
  select attribution.* into current_attribution
  from public.ticket_booking_attribution_versions attribution
  where attribution.booking_id = p_booking_id
  order by attribution.attribution_version desc
  limit 1;

  response_value := jsonb_build_object(
    'bookingId', p_booking_id,
    'bookingVersion', final_booking_version,
    'attribution', jsonb_build_object(
      'version', current_attribution.attribution_version,
      'primaryEmployeeId', current_attribution.primary_employee_id,
      'assistantEmployeeIds', to_jsonb(assistant_employee_ids_value),
      'reason', correction_reason_value
    ),
    'commercialTreatment', commercial_treatment_value,
    'commissionWaiverReason', commission_waiver_reason_value,
    'sourceEventCorrections', source_event_corrections,
    'idempotentReplay', false
  );

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

-- Booking corrections that transfer Refund responsibility are immutable
-- lifecycle evidence and invalidate any earlier confirmation.
do $ticketing_2026090204_refund_event_constraint$
declare
  constraint_definition text;
begin
  select pg_get_constraintdef(constraint_row.oid)
  into constraint_definition
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conname = 'ticket_refund_events_type_check'
    and constraint_row.conrelid = 'public.ticket_refund_events'::regclass;

  if constraint_definition is null
    or position('booking_correction' in constraint_definition) = 0
  then
    alter table public.ticket_refund_events
      drop constraint if exists ticket_refund_events_type_check;
    alter table public.ticket_refund_events
      add constraint ticket_refund_events_type_check check (
        event_type in (
          'recorded', 'customer_settlement', 'airline_recovery', 'other_cost',
          'recovery_finalised', 'confirmed_correct', 'booking_correction', 'closed', 'voided'
        )
      );
  end if;
end
$ticketing_2026090204_refund_event_constraint$;

create or replace function public.ticketing_prepare_refund_event_2026090201()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  refund_row public.ticket_refunds%rowtype;
  context_id_value uuid := gen_random_uuid();
  confirmation_was_present boolean := false;
  previous_confirmed_result_value numeric(14,2);
  provisional_result_value numeric(14,2);
  next_status text;
begin
  if new.event_type not in (
    'customer_settlement', 'airline_recovery', 'other_cost',
    'recovery_finalised', 'booking_correction', 'closed', 'voided'
  ) then
    return new;
  end if;

  select refund.* into refund_row
  from public.ticket_refunds refund
  where refund.id = new.refund_id
  for update;
  if not found then
    raise exception 'Refund was not found' using errcode = 'P0002';
  end if;

  if new.event_type = 'closed' then
    if refund_row.confirmed_correct_at is null then
      raise exception 'A provisional refund cannot be closed before it is confirmed correct'
        using errcode = '55000', hint = 'TICKETING_REFUND_CONFIRMATION_REQUIRED';
    end if;
    return new;
  end if;

  confirmation_was_present := refund_row.confirmed_correct_at is not null;
  previous_confirmed_result_value := case when confirmation_was_present
    then refund_row.actual_company_result_gbp else null end;
  provisional_result_value := case when refund_row.airline_recovery_final then
    round(
      refund_row.original_sale_price_gbp - refund_row.original_supplier_cost_gbp
        + refund_row.airline_recovered_gbp - refund_row.customer_settled_gbp
        - refund_row.other_actual_costs_gbp - refund_row.retained_agent_commission_gbp,
      2
    )
    else null end;
  next_status := case
    when refund_row.status = 'voided' then 'voided'
    when refund_row.status = 'settled' then
      case when refund_row.customer_settled_gbp > 0 or refund_row.airline_recovered_gbp > 0
        or refund_row.other_actual_costs_gbp > 0 then 'part_settled'
        else 'recovery_pending' end
    else refund_row.status
  end;

  insert into public.ticket_refund_write_contexts (id, refund_id, actor_employee_id)
  values (context_id_value, refund_row.id, new.actor_employee_id);
  perform set_config('ticketing.refund_context_id', context_id_value::text, true);
  update public.ticket_refunds refund
  set provisional_company_result_gbp = provisional_result_value,
      actual_company_result_gbp = null,
      confirmed_correct_at = null,
      confirmed_correct_by_employee_id = null,
      status = next_status
  where refund.id = refund_row.id
  returning * into refund_row;
  delete from public.ticket_refund_write_contexts context
  where context.id = context_id_value;
  perform set_config('ticketing.refund_context_id', '', true);

  new.event_data := new.event_data || jsonb_build_object(
    'status', refund_row.status,
    'version', refund_row.version,
    'provisionalCompanyResultGbp', refund_row.provisional_company_result_gbp,
    'actualCompanyResultGbp', null,
    'previousConfirmedCompanyResultGbp', previous_confirmed_result_value,
    'confirmedCorrectAt', null,
    'confirmedCorrectByEmployeeId', null
  );

  if confirmation_was_present then
    insert into public.ticket_audit_events (
      entity_type, entity_id, booking_id, transaction_id, action,
      actor_employee_id, after_state
    ) values (
      'refund', refund_row.id, refund_row.booking_id, refund_row.transaction_id,
      'refund_confirmation_withdrawn', new.actor_employee_id,
      jsonb_build_object(
        'refundEventId', new.id,
        'refundEventType', new.event_type,
        'status', refund_row.status,
        'version', refund_row.version,
        'provisionalCompanyResultGbp', refund_row.provisional_company_result_gbp
      )
    );
  end if;

  return new;
end
$$;

drop trigger if exists ticket_refund_events_prepare_confirmation_0201
  on public.ticket_refund_events;
create trigger ticket_refund_events_prepare_confirmation_0201
  before insert on public.ticket_refund_events
  for each row execute function public.ticketing_prepare_refund_event_2026090201();

create or replace function public.ticketing_append_refund_event_2026090201(
  p_actor_employee_id uuid,
  p_refund_id uuid,
  p_expected_version bigint,
  p_event_type text,
  p_amount_gbp numeric,
  p_event_date date,
  p_reference text,
  p_notes text,
  p_override_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  action_name_value constant text := 'ticketing.refund_event.v2026090201';
  event_type_value text := lower(btrim(coalesce(p_event_type, '')));
  idempotency_key_value text := btrim(coalesce(p_idempotency_key, ''));
  reference_value text := nullif(btrim(p_reference), '');
  notes_value text := nullif(btrim(p_notes), '');
  reason_value text := nullif(btrim(p_override_reason), '');
  amount_value numeric(14,2) := case
    when p_amount_gbp is null then null else round(p_amount_gbp, 2) end;
  canonical_request jsonb;
  existing_request jsonb;
  existing_response jsonb;
  refund_row public.ticket_refunds%rowtype;
  event_row public.ticket_refund_events%rowtype;
  response_value jsonb;
  context_id_value uuid := gen_random_uuid();
  actor_is_active boolean := false;
  actor_is_admin boolean := false;
  provisional_result_value numeric(14,2);
  next_status text;
begin
  if p_actor_employee_id is null or p_refund_id is null
    or p_expected_version is null or p_expected_version < 1
    or p_event_date is null or p_event_date > current_date
    or length(idempotency_key_value) not between 8 and 200
    or event_type_value not in (
      'customer_settlement', 'airline_recovery', 'other_cost',
      'recovery_finalised', 'confirmed_correct', 'closed', 'voided'
    )
    or (reference_value is not null and length(reference_value) > 200)
    or (notes_value is not null and length(notes_value) > 2000)
    or (reason_value is not null and length(reason_value) > 500)
  then
    raise exception 'Refund event details are invalid' using errcode = '22023';
  end if;
  if event_type_value in ('customer_settlement', 'airline_recovery', 'other_cost')
    and (amount_value is null or amount_value <= 0)
  then
    raise exception 'A positive event amount is required' using errcode = '22023';
  end if;
  if event_type_value not in ('customer_settlement', 'airline_recovery', 'other_cost')
    and amount_value is not null
  then
    raise exception 'This refund event does not accept an amount' using errcode = '22023';
  end if;
  if event_type_value in ('closed', 'voided') and reason_value is null then
    raise exception 'A reason is required to close or void a refund' using errcode = '22023';
  end if;
  if event_type_value = 'confirmed_correct' and reason_value is not null then
    raise exception 'Refund confirmation does not accept an override reason'
      using errcode = '22023';
  end if;

  canonical_request := jsonb_build_object(
    'refundId', p_refund_id,
    'expectedVersion', p_expected_version,
    'eventType', event_type_value,
    'amountGbp', amount_value,
    'eventDate', p_event_date,
    'reference', reference_value,
    'notes', notes_value,
    'overrideReason', reason_value
  );

  -- Authorize and lock the actor before returning any idempotent replay.
  select employee.is_active,
    regexp_replace(lower(btrim(role.name)), '[_-]+', ' ', 'g') in (
      'maintenance admin', 'admin', 'master admin', 'super admin'
    )
  into actor_is_active, actor_is_admin
  from public.employees employee
  join public.roles role on role.id = employee.role_id
  where employee.id = p_actor_employee_id
  for share of employee, role;
  if not found or not actor_is_active
    or (event_type_value <> 'confirmed_correct' and not actor_is_admin)
  then
    raise exception 'Only an active authorized employee may record this refund event'
      using errcode = '42501';
  end if;
  if event_type_value = 'confirmed_correct' then
    select refund.* into refund_row from public.ticket_refunds refund
    where refund.id = p_refund_id for share;
    if not found then
      raise exception 'Refund was not found' using errcode = 'P0002';
    end if;
    if p_actor_employee_id <> refund_row.owner_employee_id and not actor_is_admin then
      raise exception 'Only the responsible agent or an administrator may confirm this refund'
        using errcode = '42501';
    end if;
  end if;

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
      raise exception 'Idempotency key was reused with a different refund event'
        using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
    end if;
    if existing_response is null then
      raise exception 'Refund event idempotency record is incomplete'
        using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  -- The lifecycle table also has a legacy actor/key uniqueness boundary. Do
  -- not let a key created through an older entry point replay a different body.
  if exists (
    select 1 from public.ticket_refund_events event
    where event.actor_employee_id = p_actor_employee_id
      and event.idempotency_key = idempotency_key_value
  ) then
    raise exception 'Refund event key is already owned by a legacy operation'
      using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
  end if;

  if event_type_value <> 'confirmed_correct' then
    response_value := public.ticketing_append_refund_event_2026082903(
      p_actor_employee_id, p_refund_id, p_expected_version, event_type_value,
      amount_value, p_event_date, reference_value, notes_value, reason_value,
      idempotency_key_value
    );

    select refund.* into refund_row
    from public.ticket_refunds refund where refund.id = p_refund_id;
    if not found then
      raise exception 'Refund was not found' using errcode = 'P0002';
    end if;

    response_value := response_value || jsonb_build_object(
      'status', refund_row.status,
      'version', refund_row.version,
      'provisionalCompanyResultGbp', refund_row.provisional_company_result_gbp,
      'actualCompanyResultGbp', refund_row.actual_company_result_gbp,
      'confirmedCorrectAt', refund_row.confirmed_correct_at,
      'confirmedCorrectByEmployeeId', refund_row.confirmed_correct_by_employee_id,
      'idempotentReplay', false
    );
  else
    select employee.is_active,
      regexp_replace(lower(btrim(role.name)), '[_-]+', ' ', 'g') in (
        'maintenance admin', 'admin', 'master admin', 'super admin'
      )
    into actor_is_active, actor_is_admin
    from public.employees employee
    join public.roles role on role.id = employee.role_id
    where employee.id = p_actor_employee_id
    for share of employee, role;
    if not found or not actor_is_active then
      raise exception 'Only an active employee may confirm this refund'
        using errcode = '42501';
    end if;

    select refund.* into refund_row
    from public.ticket_refunds refund where refund.id = p_refund_id for update;
    if not found then
      raise exception 'Refund was not found' using errcode = 'P0002';
    end if;
    if refund_row.version <> p_expected_version then
      raise exception 'Refund changed; reload before confirming it'
        using errcode = '40001', hint = 'TICKETING_REFUND_VERSION_CONFLICT';
    end if;
    if refund_row.status in ('closed', 'voided') then
      raise exception 'Closed or voided refunds cannot be confirmed' using errcode = '55000';
    end if;
    if refund_row.confirmed_correct_at is not null then
      raise exception 'This refund is already confirmed correct'
        using errcode = '55000', hint = 'TICKETING_REFUND_ALREADY_CONFIRMED';
    end if;
    if p_actor_employee_id <> refund_row.owner_employee_id and not actor_is_admin then
      raise exception 'Only the responsible agent or an administrator may confirm this refund'
        using errcode = '42501';
    end if;
    if not refund_row.airline_recovery_final then
      raise exception 'Airline or supplier recovery must be final before confirmation'
        using errcode = '22023', hint = 'TICKETING_REFUND_CONFIRMATION_NOT_READY';
    end if;

    provisional_result_value := round(
      refund_row.original_sale_price_gbp - refund_row.original_supplier_cost_gbp
        + refund_row.airline_recovered_gbp - refund_row.customer_settled_gbp
        - refund_row.other_actual_costs_gbp - refund_row.retained_agent_commission_gbp,
      2
    );
    next_status := case
      when refund_row.customer_settled_gbp >= refund_row.proposed_customer_refund_gbp then 'settled'
      when refund_row.customer_settled_gbp > 0 or refund_row.airline_recovered_gbp > 0
        or refund_row.other_actual_costs_gbp > 0 then 'part_settled'
      else 'recovery_pending'
    end;

    insert into public.ticket_refund_write_contexts (id, refund_id, actor_employee_id)
    values (context_id_value, refund_row.id, p_actor_employee_id);
    perform set_config('ticketing.refund_context_id', context_id_value::text, true);
    update public.ticket_refunds refund
    set provisional_company_result_gbp = provisional_result_value,
        actual_company_result_gbp = provisional_result_value,
        confirmed_correct_at = clock_timestamp(),
        confirmed_correct_by_employee_id = p_actor_employee_id,
        status = next_status
    where refund.id = refund_row.id
    returning * into refund_row;
    delete from public.ticket_refund_write_contexts context where context.id = context_id_value;
    perform set_config('ticketing.refund_context_id', '', true);

    insert into public.ticket_refund_events (
      refund_id, event_type, actor_employee_id, event_date, reference,
      notes, event_data, idempotency_key
    ) values (
      refund_row.id, event_type_value, p_actor_employee_id, p_event_date,
      reference_value, notes_value,
      jsonb_build_object(
        'status', refund_row.status,
        'version', refund_row.version,
        'provisionalCompanyResultGbp', refund_row.provisional_company_result_gbp,
        'actualCompanyResultGbp', refund_row.actual_company_result_gbp,
        'confirmedCorrectAt', refund_row.confirmed_correct_at,
        'confirmedCorrectByEmployeeId', refund_row.confirmed_correct_by_employee_id
      ),
      idempotency_key_value
    ) returning * into event_row;

    insert into public.ticket_audit_events (
      entity_type, entity_id, booking_id, transaction_id, action,
      actor_employee_id, after_state
    ) values (
      'refund', refund_row.id, refund_row.booking_id, refund_row.transaction_id,
      'refund_confirmed_correct', p_actor_employee_id, event_row.event_data
    );

    response_value := jsonb_build_object(
      'refundId', refund_row.id,
      'eventId', event_row.id,
      'status', refund_row.status,
      'version', refund_row.version,
      'provisionalCompanyResultGbp', refund_row.provisional_company_result_gbp,
      'actualCompanyResultGbp', refund_row.actual_company_result_gbp,
      'confirmedCorrectAt', refund_row.confirmed_correct_at,
      'confirmedCorrectByEmployeeId', refund_row.confirmed_correct_by_employee_id,
      'idempotentReplay', false
    );
  end if;

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

-- Replace the capability 2026090203 date-correction entry point in place. The
-- historical migration remains immutable; callers keep the same RPC name while
-- capability 2026090204 tightens its authorization, input, and timezone contract.
create or replace function public.ticketing_correct_transaction_dates_2026090203(
  p_actor_employee_id uuid,
  p_booking_id uuid,
  p_transaction_id uuid,
  p_expected_booking_version bigint,
  p_expected_transaction_version bigint,
  p_idempotency_key text,
  p_correction jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  expected_keys constant text[] := array[
    'operationalStatus', 'bookingDate', 'timeLimitAt', 'issuedAt', 'reason'
  ];
  action_name_value constant text := 'ticketing.correct_transaction_dates.v1';
  idempotency_key_value text := btrim(coalesce(p_idempotency_key, ''));
  unknown_key text;
  operational_status_value text;
  booking_date_value date;
  time_limit_local timestamp without time zone;
  time_limit_at_value timestamptz;
  local_time_candidate_count integer;
  issued_date_value date;
  issued_at_value timestamptz;
  is_deadline_correction boolean;
  reason_value text;
  canonical_request jsonb;
  existing_request jsonb;
  existing_response jsonb;
  actor_is_active boolean := false;
  actor_is_authorized boolean := false;
  booking_row public.ticket_bookings%rowtype;
  transaction_row public.ticket_transactions%rowtype;
  location_timezone text;
  context_id_value uuid := gen_random_uuid();
  source_event_row public.commission_source_events%rowtype;
  source_event_result jsonb;
  response_value jsonb;
  final_booking_version bigint;
  final_transaction_version bigint;
  now_value timestamptz := clock_timestamp();
begin
  if p_actor_employee_id is null or p_booking_id is null or p_transaction_id is null
    or p_expected_booking_version is null or p_expected_booking_version < 1
    or p_expected_transaction_version is null or p_expected_transaction_version < 1
    or length(idempotency_key_value) not between 1 and 200
  then
    raise exception 'Actor, record IDs, expected versions, and idempotency key are required'
      using errcode = '22023';
  end if;
  if p_correction is null or jsonb_typeof(p_correction) is distinct from 'object' then
    raise exception 'Ticket date correction must be an object' using errcode = '22023';
  end if;

  select supplied.key into unknown_key
  from jsonb_object_keys(p_correction) supplied(key)
  where supplied.key <> all(expected_keys)
  limit 1;
  if found or not p_correction ?& expected_keys
    or jsonb_typeof(p_correction -> 'operationalStatus') is distinct from 'string'
    or jsonb_typeof(p_correction -> 'bookingDate') is distinct from 'string'
    or jsonb_typeof(p_correction -> 'timeLimitAt') not in ('string', 'null')
    or jsonb_typeof(p_correction -> 'issuedAt') not in ('string', 'null')
    or jsonb_typeof(p_correction -> 'reason') is distinct from 'string'
  then
    raise exception 'Ticket date correction fields are missing or invalid' using errcode = '22023';
  end if;

  operational_status_value := lower(btrim(p_correction ->> 'operationalStatus'));
  reason_value := nullif(btrim(p_correction ->> 'reason'), '');
  begin
    booking_date_value := (p_correction ->> 'bookingDate')::date;
    if jsonb_typeof(p_correction -> 'timeLimitAt') = 'string' then
      time_limit_local := (p_correction ->> 'timeLimitAt')::timestamp without time zone;
    end if;
    if jsonb_typeof(p_correction -> 'issuedAt') = 'string' then
      issued_date_value := (p_correction ->> 'issuedAt')::date;
    end if;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Ticket correction contains an invalid date' using errcode = '22007';
  end;

  if to_char(booking_date_value, 'YYYY-MM-DD') <> p_correction ->> 'bookingDate'
    or reason_value is null or length(reason_value) > 500
    or operational_status_value not in ('held', 'issued', 'cancelled', 'part_refunded', 'refunded')
  then
    raise exception 'Ticket date correction is invalid' using errcode = '22023';
  end if;

  -- Hold both identity rows until the privileged operation commits. A
  -- concurrent deactivation or demotion must wait, and a revoked actor must
  -- never recover a previously successful response through idempotent replay.
  select employee.is_active,
    regexp_replace(lower(btrim(role.name)), '[_-]+', ' ', 'g') in (
      'maintenance admin', 'admin', 'master admin', 'super admin'
    )
  into actor_is_active, actor_is_authorized
  from public.employees employee
  join public.roles role on role.id = employee.role_id
  where employee.id = p_actor_employee_id
  for share of employee, role;
  if not found or not actor_is_active or not actor_is_authorized then
    raise exception 'Only an active record manager may correct ticket dates'
      using errcode = '42501';
  end if;

  select booking.* into booking_row
  from public.ticket_bookings booking
  where booking.id = p_booking_id and booking.archived_at is null
  for update;
  if not found then
    raise exception 'Ticket record not found'
      using errcode = 'P0002', hint = 'TICKETING_RECORD_NOT_FOUND';
  end if;
  select location.timezone into location_timezone
  from public.locations location where location.id = booking_row.location_id
  for share;
  if location_timezone is null then
    raise exception 'Ticket branch timezone is missing'
      using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
  end if;
  select transaction.* into transaction_row
  from public.ticket_transactions transaction
  where transaction.id = p_transaction_id and transaction.booking_id = p_booking_id
  for update;
  if not found then
    raise exception 'Ticket transaction not found'
      using errcode = 'P0002', hint = 'TICKETING_RECORD_NOT_FOUND';
  end if;
  if transaction_row.operational_status <> operational_status_value then
    raise exception 'Ticket changed; reload before correcting dates'
      using errcode = '40001',
        detail = jsonb_build_object(
          'bookingVersion', booking_row.version,
          'transactionVersion', transaction_row.version
        )::text,
        hint = 'TICKETING_VERSION_CONFLICT';
  end if;

  -- A cancelled record retains the date model it had before cancellation:
  -- pre-issuance cancellations keep a deadline; issued cancellations keep an
  -- issued date and its immutable Commission source lineage.
  is_deadline_correction := operational_status_value = 'held'
    or (operational_status_value = 'cancelled' and transaction_row.issued_at is null);
  if is_deadline_correction then
    if time_limit_local is null or issued_date_value is not null
      or time_limit_local::date < booking_date_value
      or to_char(time_limit_local, 'YYYY-MM-DD"T"HH24:MI') <> p_correction ->> 'timeLimitAt'
    then
      raise exception 'Held or pre-issuance cancelled ticket dates are invalid'
        using errcode = '22023';
    end if;
    time_limit_at_value := time_limit_local at time zone location_timezone;
    if time_limit_at_value at time zone location_timezone <> time_limit_local then
      raise exception 'Airline time limit does not exist in the branch timezone'
        using errcode = '22007';
    end if;
    select count(*)::integer into local_time_candidate_count
    from generate_series(
      time_limit_at_value - interval '26 hours',
      time_limit_at_value + interval '26 hours',
      interval '1 minute'
    ) candidate(candidate_at)
    where candidate.candidate_at at time zone location_timezone = time_limit_local;
    if local_time_candidate_count <> 1 then
      raise exception 'Airline time limit is ambiguous in the branch timezone'
        using errcode = '22007';
    end if;
  else
    if issued_date_value is null or time_limit_local is not null
      or issued_date_value < booking_date_value
      or to_char(issued_date_value, 'YYYY-MM-DD') <> p_correction ->> 'issuedAt'
    then
      raise exception 'Issued ticket dates are invalid' using errcode = '22023';
    end if;
    issued_at_value := issued_date_value::timestamp without time zone at time zone location_timezone;
  end if;

  canonical_request := jsonb_build_object(
    'bookingId', p_booking_id,
    'transactionId', p_transaction_id,
    'expectedBookingVersion', p_expected_booking_version,
    'expectedTransactionVersion', p_expected_transaction_version,
    'operationalStatus', operational_status_value,
    'bookingDate', booking_date_value,
    'timeLimitAt', case when time_limit_local is null then null
      else to_char(time_limit_local, 'YYYY-MM-DD"T"HH24:MI') end,
    'issuedAt', issued_date_value,
    'reason', reason_value
  );

  perform pg_advisory_xact_lock(hashtextextended(
    action_name_value || ':' || p_actor_employee_id::text || ':' || idempotency_key_value, 0
  ));
  select key_row.request_payload, key_row.response_payload
  into existing_request, existing_response
  from public.ticket_idempotency_keys key_row
  where key_row.action_name = action_name_value
    and key_row.actor_employee_id = p_actor_employee_id
    and key_row.idempotency_key = idempotency_key_value;
  if found then
    if existing_request is distinct from canonical_request then
      raise exception 'Idempotency key was reused with a different date correction'
        using errcode = '22023', hint = 'TICKETING_IDEMPOTENCY_CONFLICT';
    end if;
    if existing_response is null then
      raise exception 'Ticket date correction idempotency record is incomplete'
        using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  if booking_row.version <> p_expected_booking_version
    or transaction_row.version <> p_expected_transaction_version
  then
    raise exception 'Ticket changed; reload before correcting dates'
      using errcode = '40001',
        detail = jsonb_build_object(
          'bookingVersion', booking_row.version,
          'transactionVersion', transaction_row.version
        )::text,
        hint = 'TICKETING_VERSION_CONFLICT';
  end if;

  if transaction_row.booking_date = booking_date_value
    and transaction_row.time_limit_at is not distinct from time_limit_at_value
    and transaction_row.issued_at is not distinct from issued_at_value
  then
    raise exception 'Ticket dates are already current'
      using errcode = '22023', hint = 'TICKETING_DATE_NO_CHANGE';
  end if;

  insert into public.ticket_date_correction_contexts (
    id, actor_employee_id, transaction_id,
    previous_booking_date, booking_date,
    previous_time_limit_at, time_limit_at,
    previous_time_limit_timezone, time_limit_timezone,
    previous_issued_at, issued_at
  ) values (
    context_id_value, p_actor_employee_id, p_transaction_id,
    transaction_row.booking_date, booking_date_value,
    transaction_row.time_limit_at, time_limit_at_value,
    transaction_row.time_limit_timezone,
    case when time_limit_at_value is null then null else location_timezone end,
    transaction_row.issued_at, issued_at_value
  );
  perform set_config('ticketing.date_correction_context_id', context_id_value::text, true);

  update public.ticket_transactions transaction
  set booking_date = booking_date_value,
      time_limit_at = time_limit_at_value,
      time_limit_timezone = case when time_limit_at_value is null then null else location_timezone end,
      issued_at = issued_at_value,
      correction_reason = reason_value
  where transaction.id = p_transaction_id;

  delete from public.ticket_date_correction_contexts context where context.id = context_id_value;
  perform set_config('ticketing.date_correction_context_id', '', true);

  if transaction_row.service_type = 'TK' and transaction_row.parent_transaction_id is null then
    update public.ticket_bookings booking
    set booking_date = booking_date_value,
        time_limit_at = time_limit_at_value,
        time_limit_timezone = case when time_limit_at_value is null then null else location_timezone end,
        updated_by = p_actor_employee_id
    where booking.id = p_booking_id;
  end if;

  if issued_date_value is not null then
    select source_event.* into source_event_row
    from public.commission_source_events source_event
    where source_event.source_module = 'ticketing'
      and source_event.source_fact_key = 'transaction:' || p_transaction_id::text || ':issued'
    order by source_event.event_version desc
    limit 1;
    if not found then
      raise exception 'Issued ticket source fact is missing'
        using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
    end if;

    source_event_result := public.append_commission_source_event(jsonb_build_object(
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
      'occurred_at', now_value,
      'effective_on', issued_date_value,
      'source_path', source_event_row.source_path,
      'variables', jsonb_set(
        source_event_row.variables || jsonb_build_object('booking_date', booking_date_value),
        '{issued_at}', to_jsonb(issued_at_value), true
      ),
      'idempotency_key', 'date-correction:' || encode(digest(
        p_actor_employee_id::text || ':' || idempotency_key_value || ':'
          || source_event_row.source_fact_key,
        'sha256'
      ), 'hex')
    ));
  end if;

  insert into public.ticket_audit_events (
    entity_type, entity_id, booking_id, transaction_id, action,
    actor_employee_id, reason, before_state, after_state
  ) values (
    'transaction', p_transaction_id, p_booking_id, p_transaction_id,
    'correct_ticket_dates', p_actor_employee_id, reason_value,
    jsonb_build_object(
      'bookingDate', transaction_row.booking_date,
      'timeLimitAt', transaction_row.time_limit_at,
      'timeLimitTimezone', transaction_row.time_limit_timezone,
      'issuedAt', transaction_row.issued_at
    ),
    jsonb_build_object(
      'bookingDate', booking_date_value,
      'timeLimitAt', time_limit_at_value,
      'timeLimitTimezone', case when time_limit_at_value is null then null else location_timezone end,
      'issuedAt', issued_at_value,
      'sourceEventId', source_event_result ->> 'sourceEventId'
    )
  );

  select version into final_booking_version
  from public.ticket_bookings where id = p_booking_id;
  select version into final_transaction_version
  from public.ticket_transactions where id = p_transaction_id;

  response_value := jsonb_build_object(
    'bookingId', p_booking_id,
    'transactionId', p_transaction_id,
    'bookingVersion', final_booking_version,
    'transactionVersion', final_transaction_version,
    'bookingDate', booking_date_value,
    'timeLimitAt', case when time_limit_local is null then null
      else to_char(time_limit_local, 'YYYY-MM-DD"T"HH24:MI') end,
    'issuedAt', issued_date_value,
    'idempotentReplay', false
  );

  insert into public.ticket_idempotency_keys (
    action_name, actor_employee_id, idempotency_key,
    request_payload, response_payload, completed_at
  ) values (
    action_name_value, p_actor_employee_id, idempotency_key_value,
    canonical_request, response_value, now_value
  );

  return response_value;
end
$$;

-- The public wrappers delegate validated mutations to historical predecessors.
-- Preserve capability 2026090202's Maintenance Admin authority in those
-- internal paths while failing closed if either definition has drifted.
do $ticketing_2026090204_internal_authorization$
declare
  definition text;
  upgraded text;
begin
  definition := pg_get_functiondef(
    'public.ticketing_correct_booking_attribution(uuid,uuid,bigint,text,jsonb)'::regprocedure
  );
  if position($current$actor_is_admin := employee_lock_row.role_name in (
        'maintenance admin', 'admin', 'master admin', 'super admin'
      );$current$ in definition) = 0
  then
    upgraded := replace(
      definition,
      $old$actor_is_admin := employee_lock_row.role_name in (
        'admin', 'master admin', 'super admin'
      );$old$,
      $new$actor_is_admin := employee_lock_row.role_name in (
        'maintenance admin', 'admin', 'master admin', 'super admin'
      );$new$
    );
    if upgraded = definition then
      raise exception 'Internal attribution correction authorization definition has drifted'
        using errcode = '55000', hint = 'TICKETING_SCHEMA_DRIFT';
    end if;
    execute upgraded;
  end if;

  definition := pg_get_functiondef(
    'public.ticketing_append_refund_event_2026082903(uuid,uuid,bigint,text,numeric,date,text,text,text,text)'::regprocedure
  );
  if position('public.ticketing_actor_can_maintain_2026090202(p_actor_employee_id)' in definition) = 0 then
    upgraded := replace(
      definition,
      'public.ticketing_actor_is_admin_2026082802(p_actor_employee_id)',
      'public.ticketing_actor_can_maintain_2026090202(p_actor_employee_id)'
    );
    if upgraded = definition then
      raise exception 'Legacy internal Refund mutation authorization definition has drifted'
        using errcode = '55000', hint = 'TICKETING_SCHEMA_DRIFT';
    end if;
    execute upgraded;
  end if;
end
$ticketing_2026090204_internal_authorization$;

revoke all on function
  public.ticketing_prepare_refund_event_2026090201(),
  public.ticketing_correct_booking_attribution(uuid,uuid,bigint,text,jsonb),
  public.ticketing_append_refund_event_2026082903(
    uuid,uuid,bigint,text,numeric,date,text,text,text,text
  ),
  public.ticketing_correct_transaction_dates_2026090203(
    uuid,uuid,uuid,bigint,bigint,text,jsonb
  ),
  public.ticketing_correct_booking_attribution_commercial_2026090201(uuid,uuid,bigint,text,jsonb),
  public.ticketing_append_refund_event_2026090201(
    uuid,uuid,bigint,text,numeric,date,text,text,text,text
  )
  from public, anon, authenticated, service_role;
grant execute on function
  public.ticketing_correct_booking_attribution_commercial_2026090201(uuid,uuid,bigint,text,jsonb),
  public.ticketing_append_refund_event_2026090201(
    uuid,uuid,bigint,text,numeric,date,text,text,text,text
  ),
  public.ticketing_correct_transaction_dates_2026090203(
    uuid,uuid,uuid,bigint,bigint,text,jsonb
  )
  to service_role;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026090204,
  clock_timestamp(),
  coalesce((select details from public.portal_schema_versions where component = 'ticketing'), '{}'::jsonb)
    || jsonb_build_object(
      'migration', '20260902_ticketing_correction_refund_hardening.sql',
      'capabilities', coalesce((
        select details -> 'capabilities'
        from public.portal_schema_versions
        where component = 'ticketing' and jsonb_typeof(details -> 'capabilities') = 'array'
      ), '[]'::jsonb) || jsonb_build_array(
        'staff-commercial-correction-hardening',
        'refund-confirmation-authorization-hardening',
        'refund-booking-correction-withdrawal',
        'maintenance-admin-refund-operations',
        'ticket-date-correction-hardening'
      )
    )
)
on conflict (component) do update
set version = excluded.version,
    applied_at = excluded.applied_at,
    details = excluded.details
where public.portal_schema_versions.version < excluded.version;

commit;
