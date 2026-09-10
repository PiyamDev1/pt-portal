begin;
select pg_advisory_xact_lock(hashtextextended('loyalty:reward-crypto-resolution', 0));

-- pgcrypto is installed in Supabase's extensions schema. These functions use
-- an intentionally empty search_path, so every extension function must be
-- schema-qualified. Repair the already-deployed definitions without widening
-- their search path or changing their grants.
do $repair$
declare
  function_count integer;
  function_oid oid;
  function_definition text;
  occurrence_count integer;
begin
  select count(*)
  into function_count
  from pg_proc procedure_row
  join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
  where namespace_row.nspname = 'public'
    and procedure_row.proname = 'customer_loyalty_ensure_referral_code_v1'
    and procedure_row.prokind = 'f';
  if function_count <> 1 then
    raise exception 'expected one customer loyalty referral function, found %', function_count
      using hint = 'Apply the loyalty referrals and vouchers migration to the PT-Portal database first.';
  end if;
  select procedure_row.oid
  into function_oid
  from pg_proc procedure_row
  join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
  where namespace_row.nspname = 'public'
    and procedure_row.proname = 'customer_loyalty_ensure_referral_code_v1'
    and procedure_row.prokind = 'f';
  select pg_get_functiondef(function_oid) into function_definition;
  if strpos(function_definition, 'extensions.gen_random_bytes(8)') = 0 then
    occurrence_count := (
      length(function_definition)
      - length(replace(function_definition, 'gen_random_bytes(8)', ''))
    ) / length('gen_random_bytes(8)');
    if occurrence_count <> 1 then
      raise exception 'unexpected loyalty referral function definition';
    end if;
    execute replace(
      function_definition,
      'gen_random_bytes(8)',
      'extensions.gen_random_bytes(8)'
    );
  end if;

  select count(*)
  into function_count
  from pg_proc procedure_row
  join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
  where namespace_row.nspname = 'public'
    and procedure_row.proname = 'customer_loyalty_issue_voucher_v1'
    and procedure_row.prokind = 'f';
  if function_count <> 1 then
    raise exception 'expected one customer loyalty voucher function, found %', function_count
      using hint = 'Apply the loyalty referrals and vouchers migration to the PT-Portal database first.';
  end if;
  select procedure_row.oid
  into function_oid
  from pg_proc procedure_row
  join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
  where namespace_row.nspname = 'public'
    and procedure_row.proname = 'customer_loyalty_issue_voucher_v1'
    and procedure_row.prokind = 'f';
  select pg_get_functiondef(function_oid) into function_definition;
  if strpos(function_definition, 'extensions.gen_random_bytes(10)') = 0 then
    occurrence_count := (
      length(function_definition)
      - length(replace(function_definition, 'gen_random_bytes(10)', ''))
    ) / length('gen_random_bytes(10)');
    if occurrence_count <> 1 then
      raise exception 'unexpected loyalty voucher function definition';
    end if;
    execute replace(
      function_definition,
      'gen_random_bytes(10)',
      'extensions.gen_random_bytes(10)'
    );
  end if;
end
$repair$;

-- Refresh PostgREST's function cache immediately after the replacement.
notify pgrst, 'reload schema';

commit;
