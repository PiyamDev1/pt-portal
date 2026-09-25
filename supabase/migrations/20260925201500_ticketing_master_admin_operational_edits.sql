-- Master Admin is the portal's top operational role. The normal HTTP route
-- already sends an actual posted sale-price change through the dedicated
-- correction RPC. These guards must therefore not reject the subsequent
-- completion save (or a harmless representation difference) for Master Admin.
-- Structural checks for attribution, passenger allocation, idempotency, and
-- booking/transaction integrity remain unchanged.
do $master_admin_operational_edits$
declare
  function_definition text;
  paid_guard_pattern constant text :=
    'if\s+payment_status_value\s*<>\s*''paid''\s+or\s+\(transaction_row\.paid_at\s+at\s+time\s+zone\s+booking_timezone\)::date\s*<>\s*paid_date_value\s+then\s+raise\s+exception\s+''Posted payment details require an audited correction''\s+using\s+errcode\s*=\s*''55000'',\s+hint\s*=\s*''TICKETING_CORRECTION_REQUIRED'';\s+end\s+if;';
  paid_guard_replacement constant text := $paid_guard$
    if (
      payment_status_value <> 'paid'
      or (transaction_row.paid_at at time zone booking_timezone)::date <> paid_date_value
    ) and actor_role_name not in ('master admin', 'super admin') then
      raise exception 'Posted payment details require an audited correction'
        using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
    end if;
$paid_guard$;
  sale_guard_pattern constant text :=
    'if\s+transaction_row\.operational_status\s*=\s*''issued''\s+and\s+fare_row\.unit_sale_price_source\s+is\s+not\s+null\s+and\s+fare_row\.unit_sale_price_source\s+is\s+distinct\s+from\s+\(fare_value\s*->>\s*''unitSalePrice''\)::numeric\(14,2\)\s+then\s+raise\s+exception\s+''Posted sale values require an audited correction''\s+using\s+errcode\s*=\s*''55000'',\s+hint\s*=\s*''TICKETING_CORRECTION_REQUIRED'';\s+end\s+if;';
  sale_guard_replacement constant text := $sale_guard$
    if transaction_row.operational_status = 'issued'
      and fare_row.unit_sale_price_source is not null
      and fare_row.unit_sale_price_source
        is distinct from (fare_value ->> 'unitSalePrice')::numeric(14,2)
      and actor_role_name not in ('master admin', 'super admin')
    then
      raise exception 'Posted sale values require an audited correction'
        using errcode = '55000', hint = 'TICKETING_CORRECTION_REQUIRED';
    end if;
$sale_guard$;
  paid_guard_count integer;
  sale_guard_count integer;
begin
  select pg_get_functiondef(
    'public.ticketing_complete_tk_details_authorized(uuid,uuid,text,jsonb)'::regprocedure
  ) into function_definition;

  select count(*) into paid_guard_count
  from regexp_matches(function_definition, paid_guard_pattern, 'gs');
  select count(*) into sale_guard_count
  from regexp_matches(function_definition, sale_guard_pattern, 'gs');

  if function_definition is null or paid_guard_count <> 1 or sale_guard_count <> 1 then
    raise exception 'Ticketing completion function differs from the reviewed operational guards'
      using errcode = '55000', hint = 'TICKETING_COMPLETION_SCHEMA_DRIFT';
  end if;

  function_definition := regexp_replace(
    function_definition,
    paid_guard_pattern,
    paid_guard_replacement,
    'gs'
  );
  function_definition := regexp_replace(
    function_definition,
    sale_guard_pattern,
    sale_guard_replacement,
    'gs'
  );
  execute function_definition;
end
$master_admin_operational_edits$;
