\set ON_ERROR_STOP on

do $$
declare
  v_first record;
  v_second record;
  v_third record;
  v_replaced integer;
begin
  select * into v_first
  from public.check_api_rate_limit('integration.basic', repeat('a', 64), 2, 60);
  select * into v_second
  from public.check_api_rate_limit('integration.basic', repeat('a', 64), 2, 60);
  select * into v_third
  from public.check_api_rate_limit('integration.basic', repeat('a', 64), 2, 60);

  if v_first.allowed is not true or v_first.remaining <> 1 then
    raise exception 'Unexpected first rate-limit decision: %', row_to_json(v_first);
  end if;
  if v_second.allowed is not true or v_second.remaining <> 0 then
    raise exception 'Unexpected second rate-limit decision: %', row_to_json(v_second);
  end if;
  if v_third.allowed is not false or v_third.retry_after_seconds < 1 then
    raise exception 'Expected third request to be rate limited: %', row_to_json(v_third);
  end if;

  insert into public.backup_codes (employee_id, code_hash)
  values ('00000000-0000-0000-0000-000000000001', repeat('o', 60));

  select public.replace_backup_codes(
    '00000000-0000-0000-0000-000000000001',
    jsonb_build_array(repeat('x', 60), repeat('y', 60))
  ) into v_replaced;
  if v_replaced <> 2 then
    raise exception 'Expected two replacement codes, received %', v_replaced;
  end if;
  if (select count(*) from public.backup_codes
      where employee_id = '00000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'Backup-code replacement did not preserve an exact set';
  end if;
end
$$;

-- Invalid replacement input must roll back internally and preserve the set.
do $$
begin
  perform public.replace_backup_codes(
    '00000000-0000-0000-0000-000000000001',
    '["short"]'::jsonb
  );
  raise exception 'Expected invalid replacement payload to fail';
exception
  when sqlstate '22023' then null;
end
$$;

do $$
begin
  if (select count(*) from public.backup_codes
      where employee_id = '00000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'Failed replacement erased valid backup codes';
  end if;
  if not exists (
    select 1 from public.portal_schema_versions
    where component = 'api-security' and version = 20260812
  ) then
    raise exception 'API security schema marker is missing';
  end if;
end
$$;
