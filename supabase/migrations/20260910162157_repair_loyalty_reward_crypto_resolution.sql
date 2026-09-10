begin;
select pg_advisory_xact_lock(hashtextextended('loyalty:reward-crypto-resolution', 0));

-- pgcrypto is installed in Supabase's extensions schema. These functions use
-- an intentionally empty search_path, so every extension function must be
-- schema-qualified. Repair the already-deployed definitions without widening
-- their search path or changing their grants.
do $repair$
declare
  function_definition text;
  occurrence_count integer;
begin
  select pg_get_functiondef(
    'public.customer_loyalty_ensure_referral_code_v1(uuid)'::regprocedure
  ) into function_definition;
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

  select pg_get_functiondef(
    'public.customer_loyalty_issue_voucher_v1(uuid,integer,uuid)'::regprocedure
  ) into function_definition;
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
