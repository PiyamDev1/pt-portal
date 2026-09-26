begin;

do $$
declare
  function_sql text;
  original_anchor constant text := 'p_entry #>> ''{original,transactionId}''';
  original_status_guard constant text := 'transaction.operational_status = ''issued''';
  original_status_replacement constant text :=
    'transaction.operational_status in (''held'', ''issued'')';
  anchor_position integer;
  status_position integer;
begin
  select pg_get_functiondef(
    'public.ticketing_create_replacement_case_2026092601(uuid,text,jsonb)'::regprocedure
  ) into function_sql;

  if position('transaction.operational_status in (''held'', ''issued'')' in function_sql) > 0 then
    return;
  end if;

  anchor_position := strpos(function_sql, original_anchor);
  if function_sql is null or anchor_position = 0 then
    raise exception 'Replacement-case original status guard differs from the reviewed definition'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_DRIFT';
  end if;

  status_position := strpos(
    substr(function_sql, anchor_position),
    original_status_guard
  );
  if status_position = 0 then
    raise exception 'Replacement-case original status guard differs from the reviewed definition'
      using errcode = '55000', hint = 'TICKETING_SCHEMA_DRIFT';
  end if;
  status_position := anchor_position + status_position - 1;
  function_sql := overlay(
    function_sql placing original_status_replacement
    from status_position for length(original_status_guard)
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
