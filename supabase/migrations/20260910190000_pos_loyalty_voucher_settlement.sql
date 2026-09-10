begin;

select pg_advisory_xact_lock(hashtextextended('pos:loyalty-voucher-settlement:v1', 0));

alter table public.customer_loyalty_vouchers
  drop constraint if exists customer_loyalty_vouchers_redeemed_transaction_id_fkey;
alter table public.customer_loyalty_vouchers
  add constraint customer_loyalty_vouchers_redeemed_transaction_id_fkey
  foreign key (redeemed_transaction_id) references public.pos_transactions(id) on delete restrict;

-- OTHER remains a server-reserved tender. Browser contracts do not accept it;
-- v5 creates it only after locking and validating a real loyalty voucher.
update public.pos_catalogue_items
set allowed_payment_methods = array_append(allowed_payment_methods, 'OTHER'),
    updated_at = clock_timestamp()
where not ('OTHER' = any(allowed_payment_methods));

create or replace function public.pos_post_transaction_v5(
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  action_name_value constant text := 'pos.post_transaction.v5';
  request_value jsonb := coalesce(p_request, '{}'::jsonb);
  delegated_request jsonb;
  existing_request jsonb;
  existing_response jsonb;
  response_value jsonb;
  voucher_code_value text := nullif(upper(btrim(p_request ->> 'voucherCode')), '');
  loyalty_code_value text := nullif(upper(btrim(p_request ->> 'loyaltyCode')), '');
  voucher_row public.customer_loyalty_vouchers%rowtype;
  member_row public.mobile_users%rowtype;
  transaction_row public.pos_transactions%rowtype;
  total_pence_value bigint;
  applied_pence_value integer;
  applied_amount_value numeric(14,2);
  transaction_id_value uuid;
begin
  if jsonb_typeof(coalesce(p_request, 'null'::jsonb)) <> 'object' then
    raise exception 'Valid POS transaction request required' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 200 then
    raise exception 'Valid idempotency key required' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_request -> 'tenders', '[]'::jsonb)) entry(value)
    where upper(coalesce(entry.value ->> 'method', '')) = 'OTHER'
  ) then
    raise exception 'Other tenders are reserved for validated loyalty vouchers'
      using errcode = '22023', hint = 'POS_VOUCHER_TENDER_FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_actor_employee_id::text || ':' || p_idempotency_key, 0)
  );
  select request_payload, response_payload into existing_request, existing_response
  from public.pos_idempotency_keys
  where action_name = action_name_value
    and actor_employee_id = p_actor_employee_id
    and idempotency_key = p_idempotency_key;
  if found then
    if existing_request is distinct from request_value then
      raise exception 'Idempotency key was already used for another request'
        using errcode = '23505', hint = 'POS_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_response || jsonb_build_object('idempotentReplay', true);
  end if;

  delegated_request := request_value - 'voucherCode';
  if voucher_code_value is not null then
    if voucher_code_value !~ '^PYV-[A-F0-9]{20}$' then
      raise exception 'Valid loyalty voucher code required'
        using errcode = '22023', hint = 'POS_VOUCHER_CODE_INVALID';
    end if;
    if upper(coalesce(p_request ->> 'direction', '')) <> 'IN'
      or upper(coalesce(p_request ->> 'entryMode', 'CUSTOMER_PAYMENT')) <> 'CUSTOMER_PAYMENT' then
      raise exception 'Loyalty vouchers can only settle customer sales'
        using errcode = '22023', hint = 'POS_VOUCHER_NOT_ELIGIBLE';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('loyalty:voucher-code:' || voucher_code_value, 0));
    select * into voucher_row
    from public.customer_loyalty_vouchers
    where voucher_code = voucher_code_value
    for update;
    if not found then
      raise exception 'Loyalty voucher not found'
        using errcode = 'P0002', hint = 'POS_VOUCHER_NOT_FOUND';
    end if;
    if voucher_row.status = 'issued' and voucher_row.expires_at <= clock_timestamp() then
      update public.customer_loyalty_vouchers
      set status = 'expired'
      where id = voucher_row.id;
      raise exception 'Loyalty voucher has expired'
        using errcode = '22023', hint = 'POS_VOUCHER_EXPIRED';
    end if;
    if voucher_row.status <> 'issued' then
      raise exception 'Loyalty voucher is no longer available'
        using errcode = '23505', hint = 'POS_VOUCHER_ALREADY_USED';
    end if;

    select * into member_row
    from public.mobile_users
    where id = voucher_row.mobile_user_id and customer_lifecycle_status = 'active'
    for update;
    if not found then
      raise exception 'Voucher loyalty account is inactive'
        using errcode = '22023', hint = 'POS_VOUCHER_ACCOUNT_INACTIVE';
    end if;
    if loyalty_code_value is not null and loyalty_code_value is distinct from member_row.customer_code then
      raise exception 'Voucher and loyalty card belong to different accounts'
        using errcode = '22023', hint = 'POS_VOUCHER_MEMBER_MISMATCH';
    end if;

    total_pence_value := round((p_request ->> 'totalAmount')::numeric * 100)::bigint;
    if total_pence_value <= 0 then
      raise exception 'Voucher requires a positive transaction total'
        using errcode = '22023', hint = 'POS_VOUCHER_NOT_ELIGIBLE';
    end if;
    applied_pence_value := least(voucher_row.value_pence, total_pence_value)::integer;
    applied_amount_value := applied_pence_value::numeric / 100;
    delegated_request := jsonb_set(
      delegated_request,
      '{tenders}',
      coalesce(delegated_request -> 'tenders', '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'method', 'OTHER',
          'amount', applied_amount_value,
          'externalReference', voucher_row.voucher_code,
          'reconciliationStatus', 'COMPLETED'
        )
      )
    );
  end if;

  response_value := public.pos_post_transaction_v4(
    p_actor_employee_id,
    p_idempotency_key,
    delegated_request
  );
  transaction_id_value := nullif(response_value ->> 'transactionId', '')::uuid;

  if voucher_code_value is not null then
    select * into transaction_row from public.pos_transactions
    where id = transaction_id_value for update;
    update public.customer_loyalty_vouchers
    set status = 'redeemed', redeemed_at = clock_timestamp(),
        redeemed_transaction_id = transaction_id_value
    where id = voucher_row.id and status = 'issued';
    if not found then
      raise exception 'Loyalty voucher was redeemed by another transaction'
        using errcode = '23505', hint = 'POS_VOUCHER_ALREADY_USED';
    end if;
    update public.pos_transactions
    set loyalty_mobile_user_id = coalesce(loyalty_mobile_user_id, member_row.id),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'loyaltyVoucherId', voucher_row.id,
          'loyaltyVoucherCode', voucher_row.voucher_code,
          'loyaltyVoucherFaceValuePence', voucher_row.value_pence,
          'loyaltyVoucherAppliedPence', applied_pence_value,
          'loyaltyVoucherForfeitedPence', voucher_row.value_pence - applied_pence_value
        )
    where id = transaction_id_value;
    insert into public.pos_audit_events (
      location_id, actor_employee_id, event_type, entity_type, entity_id,
      event_summary, metadata
    ) values (
      transaction_row.location_id, p_actor_employee_id, 'loyalty.voucher_redeemed',
      'TRANSACTION', transaction_id_value, 'Loyalty voucher redeemed at settlement',
      jsonb_build_object(
        'voucherId', voucher_row.id, 'appliedPence', applied_pence_value,
        'forfeitedPence', voucher_row.value_pence - applied_pence_value
      )
    );
    response_value := response_value || jsonb_build_object(
      'voucherCode', voucher_row.voucher_code,
      'voucherAppliedPence', applied_pence_value,
      'voucherForfeitedPence', voucher_row.value_pence - applied_pence_value
    );
  end if;

  insert into public.pos_idempotency_keys (
    action_name, actor_employee_id, idempotency_key, request_payload, response_payload
  ) values (action_name_value, p_actor_employee_id, p_idempotency_key, request_value, response_value);
  return response_value;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid POS voucher details' using errcode = '22023';
end;
$$;

create or replace function public.pos_record_refund_v2(
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  original_id_value uuid;
  refundable_cash_value numeric(14,2);
  refunded_value numeric(14,2);
  requested_value numeric(14,2);
begin
  if upper(coalesce(p_request ->> 'refundKind', 'LINKED')) = 'LINKED' then
    original_id_value := nullif(p_request ->> 'originalTransactionId', '')::uuid;
    requested_value := (p_request ->> 'amount')::numeric;
    select coalesce(sum(tender.amount), 0) into refundable_cash_value
    from public.pos_transaction_tenders tender
    where tender.transaction_id = original_id_value
      and not (
        tender.payment_method = 'OTHER'
        and tender.external_reference ~ '^PYV-[A-F0-9]{20}$'
      );
    select coalesce(sum(refund.amount), 0) into refunded_value
    from public.pos_refunds refund
    where refund.original_transaction_id = original_id_value and refund.status <> 'FAILED';
    if requested_value > refundable_cash_value - refunded_value then
      raise exception 'Refund exceeds the non-voucher amount paid'
        using errcode = '23514', hint = 'POS_REFUND_EXCEEDS_REMAINING';
    end if;
  end if;
  return public.pos_record_refund_v1(p_actor_employee_id, p_idempotency_key, p_request);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid POS refund details' using errcode = '22023';
end;
$$;

revoke all on function public.pos_post_transaction_v4(uuid,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.pos_post_transaction_v5(uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.pos_post_transaction_v5(uuid,text,jsonb) to service_role;
revoke all on function public.pos_record_refund_v1(uuid,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.pos_record_refund_v2(uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.pos_record_refund_v2(uuid,text,jsonb) to service_role;

insert into public.portal_schema_versions(component, version, applied_at)
values ('pos', 2026091005, clock_timestamp())
on conflict(component) do update set version = excluded.version, applied_at = excluded.applied_at;

notify pgrst, 'reload schema';
commit;
