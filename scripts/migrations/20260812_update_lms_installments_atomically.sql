-- Apply after 20260812_secure_atomic_lms_operations.sql.
-- Batch installment edits must commit together so a later-row failure cannot
-- leave the payment plan partially rescheduled.

create or replace function public.lms_update_installments(p_installments jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_due_date date;
  v_amount numeric;
  v_updated_ids jsonb := '[]'::jsonb;
begin
  if p_installments is null
    or jsonb_typeof(p_installments) <> 'array'
    or jsonb_array_length(p_installments) not between 1 and 240 then
    raise exception 'installments must contain between 1 and 240 entries'
      using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_installments)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Each installment must be an object'
        using errcode = '22023';
    end if;

    begin
      v_id := nullif(btrim(v_item ->> 'id'), '')::uuid;
      v_due_date := (v_item ->> 'due_date')::date;
      v_amount := (v_item ->> 'amount')::numeric;
    exception when others then
      raise exception 'Each installment requires a valid id, due_date, and amount'
        using errcode = '22023';
    end;

    if v_id is null or v_due_date is null or v_amount is null then
      raise exception 'Each installment requires a valid id, due_date, and amount'
        using errcode = '22023';
    end if;

    if not isfinite(v_due_date) then
      raise exception 'Installment due_date must be a finite date'
        using errcode = '22023';
    end if;

    if v_amount <= 0 or v_amount > 10000000 then
      raise exception 'Installment amount must be greater than 0 and no greater than 10000000'
        using errcode = '22023';
    end if;

    update public.loan_installments
    set due_date = v_due_date,
        amount = v_amount
    where id = v_id;

    if not found then
      raise exception 'Installment not found: %', v_id using errcode = 'P0002';
    end if;

    v_updated_ids := v_updated_ids || jsonb_build_array(v_id);
  end loop;

  return jsonb_build_object(
    'updatedInstallmentIds', v_updated_ids,
    'updatedCount', jsonb_array_length(v_updated_ids)
  );
end
$$;

revoke all on function public.lms_update_installments(jsonb)
  from public, anon, authenticated;
grant execute on function public.lms_update_installments(jsonb) to service_role;

comment on function public.lms_update_installments(jsonb)
  is 'Atomically updates a bounded batch of LMS installment due dates and amounts.';
