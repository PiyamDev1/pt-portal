-- The direct-payment rollout replaced the transaction-history trigger and
-- unintentionally dropped the existing owner, initial-pricing, and date
-- correction contexts. Rebuild the trigger with all four narrowly-scoped
-- contexts so each authorised RPC can update only its own fields.
do $ticketing_correction_context_dependencies$
begin
  if to_regprocedure(
    'public.ticketing_owner_correction_context_matches_2026082402(uuid,uuid,uuid)'
  ) is null
    or to_regprocedure(
      'public.ticketing_initial_pricing_context_matches_2026082801(uuid)'
    ) is null
    or to_regprocedure(
      'public.ticketing_date_correction_context_matches_2026090203(public.ticket_transactions,public.ticket_transactions)'
    ) is null
  then
    raise exception 'Ticketing transaction correction context helpers are incomplete'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_DRIFT';
  end if;
end
$ticketing_correction_context_dependencies$;

create or replace function public.protect_ticket_transaction_history()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  direct_payment_update boolean :=
    current_setting('ticketing.direct_payment_status_update', true) = 'enabled';
  valid_owner_correction boolean := false;
  valid_initial_pricing boolean := false;
  valid_date_correction boolean := false;
begin
  if tg_op = 'DELETE' then
    raise exception 'Ticket transactions cannot be deleted; archive or append a correction'
      using errcode = '55000';
  end if;

  if old.operational_status in ('issued', 'cancelled', 'part_refunded', 'refunded') then
    if (
      old.operational_status = 'issued'
      and new.operational_status not in ('issued', 'cancelled', 'part_refunded', 'refunded')
    ) or (
      old.operational_status = 'cancelled'
      and new.operational_status <> 'cancelled'
    ) or (
      old.operational_status = 'part_refunded'
      and new.operational_status not in ('part_refunded', 'refunded')
    ) or (
      old.operational_status = 'refunded'
      and new.operational_status <> 'refunded'
    ) then
      raise exception 'Posted ticket lifecycle cannot move backwards'
        using errcode = '55000';
    end if;
  end if;

  if (
    (old.payment_status = 'part_paid' and new.payment_status = 'unpaid')
    or (old.payment_status = 'paid' and new.payment_status <> 'paid')
  ) and not direct_payment_update then
    raise exception 'Ticket payment status cannot move backwards'
      using errcode = '55000';
  end if;

  valid_owner_correction :=
    new.owner_employee_id is distinct from old.owner_employee_id
    and public.ticketing_owner_correction_context_matches_2026082402(
      old.booking_id,
      old.owner_employee_id,
      new.owner_employee_id
    )
    and row(
      new.booking_id,
      new.parent_transaction_id,
      new.supersedes_transaction_id,
      new.service_type,
      new.acting_employee_id,
      new.booking_date,
      new.time_limit_at,
      new.time_limit_timezone,
      new.issued_at,
      new.passenger_ticket_count,
      new.currency,
      new.supplier_cost_source,
      new.supplier_cost_gbp,
      new.sale_price_source,
      new.sale_price_gbp,
      new.idempotency_key
    ) is not distinct from row(
      old.booking_id,
      old.parent_transaction_id,
      old.supersedes_transaction_id,
      old.service_type,
      old.acting_employee_id,
      old.booking_date,
      old.time_limit_at,
      old.time_limit_timezone,
      old.issued_at,
      old.passenger_ticket_count,
      old.currency,
      old.supplier_cost_source,
      old.supplier_cost_gbp,
      old.sale_price_source,
      old.sale_price_gbp,
      old.idempotency_key
    );

  valid_initial_pricing :=
    public.ticketing_initial_pricing_context_matches_2026082801(old.id)
    and row(
      new.id,
      new.booking_id,
      new.parent_transaction_id,
      new.supersedes_transaction_id,
      new.service_type,
      new.owner_employee_id,
      new.acting_employee_id,
      new.operational_status,
      new.payment_status,
      new.booking_date,
      new.time_limit_at,
      new.time_limit_timezone,
      new.issued_at,
      new.paid_at,
      new.cancelled_at,
      new.refunded_at,
      new.passenger_ticket_count,
      new.currency,
      new.supplier_cost_source,
      new.supplier_cost_gbp,
      new.notes,
      new.correction_reason,
      new.idempotency_key,
      new.created_at
    ) is not distinct from row(
      old.id,
      old.booking_id,
      old.parent_transaction_id,
      old.supersedes_transaction_id,
      old.service_type,
      old.owner_employee_id,
      old.acting_employee_id,
      old.operational_status,
      old.payment_status,
      old.booking_date,
      old.time_limit_at,
      old.time_limit_timezone,
      old.issued_at,
      old.paid_at,
      old.cancelled_at,
      old.refunded_at,
      old.passenger_ticket_count,
      old.currency,
      old.supplier_cost_source,
      old.supplier_cost_gbp,
      old.notes,
      old.correction_reason,
      old.idempotency_key,
      old.created_at
    );

  valid_date_correction :=
    public.ticketing_date_correction_context_matches_2026090203(old, new);

  if old.operational_status in ('issued', 'cancelled', 'part_refunded', 'refunded')
    and row(
      new.booking_id,
      new.parent_transaction_id,
      new.supersedes_transaction_id,
      new.service_type,
      new.owner_employee_id,
      new.acting_employee_id,
      new.booking_date,
      new.time_limit_at,
      new.time_limit_timezone,
      new.issued_at,
      new.passenger_ticket_count,
      new.currency,
      new.supplier_cost_source,
      new.supplier_cost_gbp,
      new.sale_price_source,
      new.sale_price_gbp,
      new.idempotency_key
    ) is distinct from row(
      old.booking_id,
      old.parent_transaction_id,
      old.supersedes_transaction_id,
      old.service_type,
      old.owner_employee_id,
      old.acting_employee_id,
      old.booking_date,
      old.time_limit_at,
      old.time_limit_timezone,
      old.issued_at,
      old.passenger_ticket_count,
      old.currency,
      old.supplier_cost_source,
      old.supplier_cost_gbp,
      old.sale_price_source,
      old.sale_price_gbp,
      old.idempotency_key
    )
    and not valid_owner_correction
    and not valid_initial_pricing
    and not valid_date_correction
  then
    raise exception 'Posted ticket identity and financial facts are immutable; append a correction'
      using errcode = '55000';
  end if;

  if (
    (old.paid_at is not null and new.paid_at is distinct from old.paid_at)
    or (old.cancelled_at is not null and new.cancelled_at is distinct from old.cancelled_at)
    or (old.refunded_at is not null and new.refunded_at is distinct from old.refunded_at)
  ) and not direct_payment_update then
    raise exception 'Posted ticket lifecycle timestamps are immutable; append a correction'
      using errcode = '55000';
  end if;

  return new;
end
$$;

comment on function public.protect_ticket_transaction_history() is
  'Protects posted Ticketing history while permitting only verified owner, pricing, date, and direct-payment correction contexts.';
