begin;

do $$
declare
  function_sql text;
  original_status_pattern constant text := $pattern$
    on transaction\.id = nullif\(p_entry #>> '\{original,transactionId\}', ''\)::uuid
    \s+and transaction\.booking_id = booking\.id
    \s+and transaction\.service_type = 'TK'
    \s+and transaction\.parent_transaction_id is null
    \s+and transaction\.operational_status = 'issued'
  $pattern$;
  original_status_replacement constant text := $replacement$
    on transaction.id = nullif(p_entry #>> '{original,transactionId}', '')::uuid
    and transaction.booking_id = booking.id
    and transaction.service_type = 'TK'
    and transaction.parent_transaction_id is null
    and transaction.operational_status in ('held', 'issued')
  $replacement$;
  match_count integer;
begin
  select pg_get_functiondef(
    'public.ticketing_create_replacement_case_2026092601(uuid,text,jsonb)'::regprocedure
  ) into function_sql;

  if position('transaction.operational_status in (''held'', ''issued'')' in function_sql) > 0 then
    return;
  end if;

  select count(*)
  into match_count
  from regexp_matches(function_sql, original_status_pattern, 'gs');
  if function_sql is null or match_count <> 1 then
    raise exception 'Replacement-case original status guard differs from the reviewed definition'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_DRIFT';
  end if;

  function_sql := regexp_replace(
    function_sql,
    original_status_pattern,
    original_status_replacement,
    'gs'
  );
  function_sql := replace(
    function_sql,
    'Original issued ticket was not found',
    'Original held or issued ticket was not found'
  );
  execute function_sql;
end
$$;

insert into public.portal_schema_versions (component, version, applied_at, details)
values (
  'ticketing',
  2026092701,
  clock_timestamp(),
  coalesce(
    (select details from public.portal_schema_versions where component = 'ticketing'),
    '{}'::jsonb
  ) || jsonb_build_object(
    'migration', '20260927090000_ticketing_replacement_cases_allow_unissued_original.sql',
    'capabilities', coalesce((
      select details -> 'capabilities'
      from public.portal_schema_versions
      where component = 'ticketing'
        and jsonb_typeof(details -> 'capabilities') = 'array'
    ), '[]'::jsonb) || jsonb_build_array(
      'replacement-case-original-held-ticket'
    )
  )
)
on conflict (component) do update
set version = excluded.version,
    applied_at = excluded.applied_at,
    details = excluded.details
where public.portal_schema_versions.version < excluded.version;

commit;
