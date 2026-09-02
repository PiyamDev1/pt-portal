-- Integration assertions for Ticketing capability 2026090204.

do $$
declare
  admin_id constant uuid := '40000000-0000-0000-0000-000000000006';
  refund_row public.ticket_refunds%rowtype;
  booking_row public.ticket_bookings%rowtype;
  attribution_row public.ticket_booking_attribution_versions%rowtype;
  assistant_ids uuid[] := array[]::uuid[];
  result_value jsonb;
  replay_value jsonb;
  previous_version bigint;
  refund_id_value uuid;
  error_hint_value text;
  confirmation_event_id uuid;
  withdrawal_event_id uuid;
  correction_withdrawal_event_id uuid;
  corrected_owner_id uuid;
  non_owner_id uuid;
  correction_result jsonb;
begin
  if public.ticketing_schema_status() ->> 'ready' <> 'true'
    or public.ticketing_schema_status() ->> 'version' <> '2026090204'
    or to_regprocedure(
      'public.ticketing_correct_booking_attribution_commercial_2026090201(uuid,uuid,bigint,text,jsonb)'
    ) is null
    or to_regprocedure(
      'public.ticketing_append_refund_event_2026090201(uuid,uuid,bigint,text,numeric,date,text,text,text,text)'
    ) is null
  then
    raise exception 'Ticket correction/refund confirmation capability is not ready';
  end if;

  if has_function_privilege(
      'authenticated',
      'public.ticketing_append_refund_event_2026090201(uuid,uuid,bigint,text,numeric,date,text,text,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'public.ticketing_append_refund_event_2026082903(uuid,uuid,bigint,text,numeric,date,text,text,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'public.ticketing_correct_booking_attribution(uuid,uuid,bigint,text,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'public',
      'public.ticketing_prepare_refund_event_2026090201()',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.ticketing_prepare_refund_event_2026090201()',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.ticketing_prepare_refund_event_2026090201()',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'public.ticketing_prepare_refund_event_2026090201()',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.ticketing_correct_booking_attribution_commercial_2026090201(uuid,uuid,bigint,text,jsonb)',
      'EXECUTE'
    )
  then
    raise exception 'Ticket correction/refund confirmation grants are incorrect';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.ticket_refund_events'::regclass
      and trigger_row.tgname = 'ticket_refund_events_prepare_confirmation_0201'
      and not trigger_row.tgisinternal
      and (trigger_row.tgtype & 2) = 2
  ) then
    raise exception 'Refund confirmation preparation is not enforced before event insert';
  end if;

  select refund.* into refund_row
  from public.ticket_refunds refund
  where refund.notes = 'PIA cancellation calculation saved'
  order by refund.created_at desc
  limit 1;
  if not found then
    raise exception 'Refund confirmation fixture is missing';
  end if;
  refund_id_value := refund_row.id;
  non_owner_id := case
    when refund_row.owner_employee_id = '40000000-0000-0000-0000-000000000003'::uuid
      then '40000000-0000-0000-0000-000000000001'::uuid
    else '40000000-0000-0000-0000-000000000003'::uuid
  end;

  select booking.* into booking_row
  from public.ticket_bookings booking
  where booking.id = refund_row.booking_id;
  select attribution.* into attribution_row
  from public.ticket_booking_attribution_versions attribution
  where attribution.booking_id = booking_row.id
  order by attribution.attribution_version desc
  limit 1;
  select coalesce(array_agg(assistant.employee_id order by assistant.employee_id), array[]::uuid[])
  into assistant_ids
  from public.ticket_booking_attribution_assistants assistant
  where assistant.attribution_id = attribution_row.id;

  previous_version := booking_row.version;
  result_value := public.ticketing_correct_booking_attribution_commercial_2026090201(
    admin_id,
    booking_row.id,
    booking_row.version,
    'commercial-treatment-only-1',
    jsonb_build_object(
      'responsibleEmployeeId', attribution_row.primary_employee_id,
      'assistantEmployeeIds', to_jsonb(assistant_ids),
      'commercialTreatment', 'commission_waived',
      'commissionWaiverReason', 'Integration correction waiver',
      'reason', 'Correcting the commercial classification'
    )
  );
  replay_value := public.ticketing_correct_booking_attribution_commercial_2026090201(
    admin_id,
    booking_row.id,
    previous_version,
    'commercial-treatment-only-1',
    jsonb_build_object(
      'responsibleEmployeeId', attribution_row.primary_employee_id,
      'assistantEmployeeIds', to_jsonb(assistant_ids),
      'commercialTreatment', 'commission_waived',
      'commissionWaiverReason', 'Integration correction waiver',
      'reason', 'Correcting the commercial classification'
    )
  );

  if (result_value ->> 'bookingVersion')::bigint <> previous_version + 1
    or result_value #>> '{attribution,version}' <> attribution_row.attribution_version::text
    or not (replay_value ->> 'idempotentReplay')::boolean
    or (select commercial_treatment from public.ticket_bookings where id = booking_row.id)
      <> 'commission_waived'
    or not exists (
      select 1 from public.ticket_audit_events audit
      where audit.booking_id = booking_row.id
        and audit.action = 'correct_ticket_commercial_treatment'
    )
    or exists (
      select 1
      from (
        select distinct on (source_event.source_fact_key) source_event.*
        from public.commission_source_events source_event
        where source_event.source_module = 'ticketing'
          and source_event.variables ->> 'booking_id' = booking_row.id::text
        order by source_event.source_fact_key, source_event.event_version desc
      ) latest
      where latest.variables ->> 'commercial_treatment' <> 'commission_waived'
        or latest.variables ->> 'commission_waived' <> 'true'
        or latest.variables ->> 'commission_waiver_reason'
          <> 'Integration correction waiver'
        or latest.variables ? 'staff_family_customer_price_after_gbp'
        or latest.variables ? 'staff_family_company_fee_gbp'
    )
  then
    raise exception 'Treatment-only staff correction or replay is incorrect: %', result_value;
  end if;

  begin
    update public.employees set is_active = false where id = admin_id;
    perform public.ticketing_correct_booking_attribution_commercial_2026090201(
      admin_id,
      booking_row.id,
      previous_version,
      'commercial-treatment-only-1',
      jsonb_build_object(
        'responsibleEmployeeId', attribution_row.primary_employee_id,
        'assistantEmployeeIds', to_jsonb(assistant_ids),
        'commercialTreatment', 'commission_waived',
        'commissionWaiverReason', 'Integration correction waiver',
        'reason', 'Correcting the commercial classification'
      )
    );
    raise exception 'An inactive actor replayed a privileged ticket correction';
  exception when insufficient_privilege then null;
  end;

  -- Reclassification cannot reinterpret already-recorded commercial activity
  -- under staff/family pricing rules that were not validated when recorded.
  begin
    perform public.ticketing_correct_booking_attribution_commercial_2026090201(
      admin_id,
      booking_row.id,
      (select version from public.ticket_bookings where id = booking_row.id),
      'staff-family-downstream-block-1',
      jsonb_build_object(
        'responsibleEmployeeId', attribution_row.primary_employee_id,
        'assistantEmployeeIds', to_jsonb(assistant_ids),
        'commercialTreatment', 'staff_family',
        'commissionWaiverReason', 'Requested staff family reclassification',
        'reason', 'Attempting unsafe historical reclassification'
      )
    );
    raise exception 'Staff/family reclassification accepted downstream commercial artifacts';
  exception when sqlstate '55000' then
    get stacked diagnostics error_hint_value = pg_exception_hint;
    if error_hint_value <> 'TICKETING_STAFF_FAMILY_RECLASSIFICATION_BLOCKED' then
      raise exception 'Staff/family reclassification returned the wrong failure hint: %',
        error_hint_value;
    end if;
  end;

  select refund.* into refund_row
  from public.ticket_refunds refund where refund.id = refund_id_value;
  if refund_row.confirmed_correct_at is not null
    or refund_row.actual_company_result_gbp is not null
    or refund_row.provisional_company_result_gbp <> 5
    or refund_row.status <> 'part_settled'
  then
    raise exception 'Existing settled Refund was not moved to provisional state';
  end if;

  begin
    perform public.ticketing_append_refund_event_2026090201(
      admin_id,
      refund_row.id,
      refund_row.version,
      'closed',
      null,
      current_date,
      'PREMATURE-CLOSE-1',
      null,
      'Attempted close before confirmation',
      'refund-premature-close-1'
    );
    raise exception 'A provisional Refund was closed before confirmation';
  exception when sqlstate '55000' then null;
  end;

  begin
    perform public.ticketing_append_refund_event_2026090201(
      non_owner_id, refund_row.id, refund_row.version, 'confirmed_correct', null,
      current_date, 'NON-OWNER-CONFIRM-1', 'Unauthorized confirmation', null,
      'refund-non-owner-confirm-1'
    );
    raise exception 'A non-owner confirmed another employee Refund';
  exception when insufficient_privilege then null;
  end;

  -- The responsible agent, not only an administrator, confirms the supplier result.
  result_value := public.ticketing_append_refund_event_2026090201(
    refund_row.owner_employee_id,
    refund_row.id,
    refund_row.version,
    'confirmed_correct',
    null,
    current_date,
    'AGENT-CONFIRM-1',
    'Airline refund checked',
    null,
    'refund-agent-confirm-1'
  );
  if result_value ->> 'status' <> 'settled'
    or (result_value ->> 'actualCompanyResultGbp')::numeric <> 5
    or (select confirmed_correct_by_employee_id from public.ticket_refunds
        where id = refund_row.id) <> refund_row.owner_employee_id
  then
    raise exception 'Responsible-agent Refund confirmation is incorrect: %', result_value;
  end if;

  begin
    update public.employees set is_active = false
    where id = refund_row.owner_employee_id;
    perform public.ticketing_append_refund_event_2026090201(
      refund_row.owner_employee_id,
      refund_row.id,
      refund_row.version,
      'confirmed_correct', null, current_date, 'AGENT-CONFIRM-1',
      'Airline refund checked', null, 'refund-agent-confirm-1'
    );
    raise exception 'An inactive actor replayed a privileged Refund confirmation';
  exception when insufficient_privilege then null;
  end;

  -- Later financial evidence invalidates confirmation until it is checked again.
  result_value := public.ticketing_append_refund_event_2026090201(
    admin_id,
    refund_row.id,
    (result_value ->> 'version')::bigint,
    'other_cost',
    2,
    current_date,
    'LATE-COST-1',
    'Late supplier charge',
    null,
    'refund-late-cost-1'
  );
  if result_value ->> 'status' <> 'part_settled'
    or result_value ->> 'confirmedCorrectAt' is not null
    or (select actual_company_result_gbp from public.ticket_refunds where id = refund_row.id)
      is not null
    or (select provisional_company_result_gbp from public.ticket_refunds where id = refund_row.id)
      <> 3
  then
    raise exception 'Later settlement evidence did not return the Refund to provisional: %',
      result_value;
  end if;

  -- A completed outer idempotency record owns the exact canonical request.
  -- Reusing its key with a different body must not replay or mutate anything.
  begin
    perform public.ticketing_append_refund_event_2026090201(
      admin_id,
      refund_row.id,
      (result_value ->> 'version')::bigint,
      'other_cost',
      2,
      current_date,
      'LATE-COST-1',
      'Different body for the same key',
      null,
      'refund-late-cost-1'
    );
    raise exception 'A Refund idempotency key accepted a different canonical body';
  exception when sqlstate '22023' then
    get stacked diagnostics error_hint_value = pg_exception_hint;
    if error_hint_value <> 'TICKETING_IDEMPOTENCY_CONFLICT' then
      raise exception 'Refund idempotency mismatch returned the wrong failure hint: %',
        error_hint_value;
    end if;
  end;

  begin
    perform public.ticketing_append_refund_event_2026090201(
      refund_row.owner_employee_id,
      refund_row.id,
      (result_value ->> 'version')::bigint,
      'other_cost',
      1,
      current_date,
      'AGENT-COST-1',
      null,
      null,
      'refund-agent-cost-denied-1'
    );
    raise exception 'A ticket owner recorded an administrator-only settlement amount';
  exception when insufficient_privilege then null;
  end;

  -- Confirm the revised supplier result, then prove a fresh key cannot create
  -- a second confirmation for an already-confirmed version.
  result_value := public.ticketing_append_refund_event_2026090201(
    refund_row.owner_employee_id,
    refund_row.id,
    (result_value ->> 'version')::bigint,
    'confirmed_correct',
    null,
    current_date,
    'AGENT-CONFIRM-2',
    'Late charge checked',
    null,
    'refund-agent-confirm-2'
  );
  confirmation_event_id := (result_value ->> 'eventId')::uuid;
  begin
    perform public.ticketing_append_refund_event_2026090201(
      refund_row.owner_employee_id,
      refund_row.id,
      (result_value ->> 'version')::bigint,
      'confirmed_correct',
      null,
      current_date,
      'AGENT-CONFIRM-DUPLICATE',
      'Duplicate confirmation attempt',
      null,
      'refund-agent-confirm-duplicate'
    );
    raise exception 'An already-confirmed Refund accepted another confirmation';
  exception when sqlstate '55000' then
    get stacked diagnostics error_hint_value = pg_exception_hint;
    if error_hint_value <> 'TICKETING_REFUND_ALREADY_CONFIRMED' then
      raise exception 'Duplicate Refund confirmation returned the wrong failure hint: %',
        error_hint_value;
    end if;
  end;

  -- Correct Staff owns all live refund responsibility. A confirmed refund is
  -- atomically transferred and returned to provisional through an immutable
  -- lifecycle event before the corrected owner reconfirms it.
  corrected_owner_id := case
    when refund_row.owner_employee_id = '40000000-0000-0000-0000-000000000003'::uuid
      then '40000000-0000-0000-0000-000000000001'::uuid
    else '40000000-0000-0000-0000-000000000003'::uuid
  end;
  select attribution.* into attribution_row
  from public.ticket_booking_attribution_versions attribution
  where attribution.booking_id = booking_row.id
  order by attribution.attribution_version desc limit 1;
  correction_result := public.ticketing_correct_booking_attribution_commercial_2026090201(
    admin_id,
    booking_row.id,
    (select version from public.ticket_bookings where id = booking_row.id),
    'confirmed-refund-owner-correction-1',
    jsonb_build_object(
      'responsibleEmployeeId', corrected_owner_id,
      'assistantEmployeeIds', '[]'::jsonb,
      'commercialTreatment', 'commission_waived',
      'commissionWaiverReason', 'Integration correction waiver',
      'reason', 'Transferring responsibility for confirmed refund'
    )
  );
  select event.id into correction_withdrawal_event_id
  from public.ticket_refund_events event
  where event.refund_id = refund_row.id
    and event.event_type = 'booking_correction'
  order by event.created_at desc, event.id desc limit 1;
  if correction_result #>> '{attribution,primaryEmployeeId}' <> corrected_owner_id::text
    or (select owner_employee_id from public.ticket_refunds where id = refund_row.id)
      <> corrected_owner_id
    or (select confirmed_correct_at from public.ticket_refunds where id = refund_row.id)
      is not null
    or (select actual_company_result_gbp from public.ticket_refunds where id = refund_row.id)
      is not null
    or correction_withdrawal_event_id is null
    or (select event_data ->> 'previousConfirmedCompanyResultGbp'
        from public.ticket_refund_events where id = correction_withdrawal_event_id)
      <> '3.00'
    or not exists (
      select 1 from public.ticket_audit_events audit
      where audit.entity_id = refund_row.id
        and audit.action = 'refund_confirmation_withdrawn'
        and audit.after_state ->> 'refundEventId' = correction_withdrawal_event_id::text
    )
    or (
      exists (
        select 1 from pg_catalog.pg_trigger trigger_row
        where trigger_row.tgrelid = 'public.ticket_refund_events'::regclass
          and trigger_row.tgname = 'ticket_refund_events_commission_confirmed_2026090201'
          and not trigger_row.tgisinternal
      )
      and not exists (
        select 1 from public.commission_source_events source_event
        where source_event.source_module = 'ticketing'
          and source_event.source_record_id = refund_row.id
          and source_event.event_type = 'ticket_refund_confirmation_withdrawn'
          and source_event.variables ->> 'refund_lifecycle_event_id'
            = correction_withdrawal_event_id::text
          and source_event.owner_employee_id = corrected_owner_id
      )
    )
  then
    raise exception 'Correct Staff did not atomically transfer and withdraw the Refund';
  end if;

  result_value := public.ticketing_append_refund_event_2026090201(
    corrected_owner_id,
    refund_row.id,
    (select version from public.ticket_refunds where id = refund_row.id),
    'confirmed_correct', null, current_date, 'CORRECTED-OWNER-CONFIRM-1',
    'Corrected responsible agent reconfirmed supplier result', null,
    'refund-corrected-owner-confirm-1'
  );
  confirmation_event_id := (result_value ->> 'eventId')::uuid;

  -- Void is later financial lifecycle evidence. The BEFORE trigger must clear
  -- authoritative confirmation before the immutable event and any Commission
  -- AFTER trigger observe it.
  begin
    result_value := public.ticketing_append_refund_event_2026090201(
      admin_id,
      refund_row.id,
      (result_value ->> 'version')::bigint,
      'voided',
      null,
      current_date,
      'VOID-AFTER-CONFIRM-1',
      'Supplier voided the recovered Refund',
      'Voiding after final supplier evidence changed',
      'refund-void-after-confirm-1'
    );
    withdrawal_event_id := (result_value ->> 'eventId')::uuid;
    if result_value ->> 'status' <> 'voided'
    or result_value ->> 'confirmedCorrectAt' is not null
    or result_value ->> 'actualCompanyResultGbp' is not null
    or (select confirmed_correct_at from public.ticket_refunds where id = refund_row.id)
      is not null
    or (select actual_company_result_gbp from public.ticket_refunds where id = refund_row.id)
      is not null
    or (select event_data ->> 'confirmedCorrectAt'
        from public.ticket_refund_events where id = withdrawal_event_id) is not null
    or (select event_data ->> 'actualCompanyResultGbp'
        from public.ticket_refund_events where id = withdrawal_event_id) is not null
    or not exists (
      select 1 from public.ticket_audit_events audit
      where audit.entity_id = refund_row.id
        and audit.action = 'refund_confirmation_withdrawn'
        and audit.after_state ->> 'refundEventId' = withdrawal_event_id::text
        and audit.after_state ->> 'refundEventType' = 'voided'
    )
    then
      raise exception 'Void did not withdraw authoritative Refund confirmation before event insert: %',
        result_value;
    end if;

  -- Commission's workflow is deliberately not a dependency of the standalone
  -- Ticketing suite. If it is already installed, verify its actual source
  -- lineage consumes the confirmed event and the later withdrawal event.
    if to_regclass('public.commission_refund_decisions') is not null
    and exists (
      select 1 from pg_catalog.pg_trigger trigger_row
      where trigger_row.tgrelid = 'public.ticket_refund_events'::regclass
        and trigger_row.tgname = 'ticket_refund_events_commission_confirmed_2026090201'
        and not trigger_row.tgisinternal
    )
    and (
      not exists (
        select 1 from public.commission_source_events source_event
        where source_event.source_module = 'ticketing'
          and source_event.source_record_id = refund_row.id
          and source_event.event_type = 'ticket_refund_confirmed'
          and source_event.variables ->> 'refund_lifecycle_event_id'
            = confirmation_event_id::text
      )
      or not exists (
        select 1 from public.commission_source_events source_event
        where source_event.source_module = 'ticketing'
          and source_event.source_record_id = refund_row.id
          and source_event.event_type = 'ticket_refund_confirmation_withdrawn'
          and source_event.variables ->> 'refund_lifecycle_event_id'
            = withdrawal_event_id::text
      )
    )
    then
      raise exception 'Commission Refund source lineage did not preserve confirmation withdrawal';
    end if;

    -- Roll back only the destructive void fixture so the runner can replay
    -- this migration over a live confirmed refund and assert state invariance.
    raise exception 'rollback tested void' using errcode = 'P9001';
  exception when sqlstate 'P9001' then null;
  end;

  if not exists (
    select 1 from public.ticket_refund_events event
    where event.refund_id = refund_row.id and event.event_type = 'confirmed_correct'
  ) or not exists (
    select 1 from public.ticket_audit_events audit
    where audit.entity_id = refund_row.id and audit.action = 'refund_confirmed_correct'
  ) then
    raise exception 'Refund confirmation audit evidence is incomplete';
  end if;
end
$$;
