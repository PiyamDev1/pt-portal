-- The sale-correction RPC creates a short-lived, transaction-scoped context,
-- but the posted-fare trigger did not consult it. As a result, the trigger
-- rejected the very update that the administrator-only correction RPC was
-- designed to perform. Permit only the four sale snapshot columns to change
-- while that verified context matches the fare line's transaction.
do $ticketing_authorized_price_corrections$
declare
  function_definition text;
  rejection_pattern constant text :=
    'raise\s+exception\s+''Posted passenger fare lines are immutable; create a correction transaction''\s+using\s+errcode\s*=\s*''55000'';';
  rejection_count integer;
  authorized_guard constant text := $guard$
    if tg_op = 'UPDATE'
      and public.ticketing_initial_pricing_context_matches_2026082801(old.transaction_id)
      and row(
        new.id,
        new.transaction_id,
        new.passenger_type,
        new.quantity,
        new.currency,
        new.unit_supplier_cost_source,
        new.unit_supplier_cost_gbp,
        new.unit_discount_source,
        new.unit_discount_gbp,
        new.created_at
      ) is not distinct from row(
        old.id,
        old.transaction_id,
        old.passenger_type,
        old.quantity,
        old.currency,
        old.unit_supplier_cost_source,
        old.unit_supplier_cost_gbp,
        old.unit_discount_source,
        old.unit_discount_gbp,
        old.created_at
      )
    then
      return new;
    end if;

    raise exception 'Posted passenger fare lines are immutable; create a correction transaction'
      using errcode = '55000';
$guard$;
begin
  if to_regprocedure(
    'public.ticketing_initial_pricing_context_matches_2026082801(uuid)'
  ) is null then
    raise exception 'Ticketing initial-pricing context helper is missing'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_DRIFT';
  end if;

  select pg_get_functiondef('public.protect_posted_ticket_fare_lines()'::regprocedure)
  into function_definition;

  if position(
    'ticketing_initial_pricing_context_matches_2026082801'
    in function_definition
  ) > 0 then
    return;
  end if;

  select count(*) into rejection_count
  from regexp_matches(function_definition, rejection_pattern, 'gs');

  if function_definition is null or rejection_count <> 1 then
    raise exception 'Posted fare protection differs from the reviewed rejection guard'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_DRIFT';
  end if;

  execute regexp_replace(
    function_definition,
    rejection_pattern,
    authorized_guard,
    'gs'
  );
end
$ticketing_authorized_price_corrections$;
