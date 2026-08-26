#!/usr/bin/env bash
set -euo pipefail

database_url="${DATABASE_TEST_URL:-postgresql://postgres:postgres@127.0.0.1:54329/pt_portal_test}"
migration="scripts/migrations/20260812_security_rate_limits.sql"
assertions="tests/integration/security_rate_limits.sql"
exec_sql_hardening_migration="scripts/migrations/20260826_secure_exec_sql.sql"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$migration"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$assertions"

# Reproduce the unsafe legacy grant posture seen in a linked project, then
# prove the hardening migration is idempotent and retains only service access.
psql "$database_url" -v ON_ERROR_STOP=1 -c "
  do \$roles\$
  begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
      create role service_role nologin bypassrls;
    end if;
  end
  \$roles\$;

  create or replace function public.exec_sql(sql text)
  returns setof json
  language plpgsql
  security definer
  as \$function\$
  declare
    result json;
  begin
    for result in execute sql loop
      return next result;
    end loop;
    return;
  end
  \$function\$;

  grant execute on function public.exec_sql(text) to public, anon, authenticated, service_role;
" >/dev/null

psql "$database_url" -v ON_ERROR_STOP=1 -f "$exec_sql_hardening_migration"
exec_sql_first_acl="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select coalesce(proacl::text, '')
  from pg_proc
  where oid = 'public.exec_sql(text)'::regprocedure
")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$exec_sql_hardening_migration"

if [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select
    not has_function_privilege('public', 'public.exec_sql(text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.exec_sql(text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.exec_sql(text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.exec_sql(text)', 'EXECUTE')
")" != "t" ]] \
  || [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select coalesce(proacl::text, '') from pg_proc where oid = 'public.exec_sql(text)'::regprocedure")" != "$exec_sql_first_acl" ]]; then
  echo "Administrative exec_sql function grants are unsafe or non-idempotent"
  exit 1
fi

temporary_dir="$(mktemp -d)"
trap 'rm -rf "$temporary_dir"' EXIT

concurrent_sql="select allowed from public.check_api_rate_limit('integration.concurrent', repeat('b', 64), 1, 60);"
psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "$concurrent_sql" >"$temporary_dir/first" &
first_pid=$!
psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "$concurrent_sql" >"$temporary_dir/second" &
second_pid=$!
wait "$first_pid"
wait "$second_pid"

allowed_count="$(grep -hxc 't' "$temporary_dir/first" "$temporary_dir/second" | awk '{ total += $1 } END { print total + 0 }')"
blocked_count="$(grep -hxc 'f' "$temporary_dir/first" "$temporary_dir/second" | awk '{ total += $1 } END { print total + 0 }')"
if [[ "$allowed_count" != "1" || "$blocked_count" != "1" ]]; then
  echo "Concurrent limiter results were not atomic (allowed=$allowed_count blocked=$blocked_count)"
  exit 1
fi

bucket_count="$(psql "$database_url" -Atqc "select request_count from public.api_rate_limit_buckets where scope = 'integration.concurrent'")"
if [[ "$bucket_count" != "2" ]]; then
  echo "Concurrent limiter bucket count was $bucket_count; expected 2"
  exit 1
fi

echo "Shared security migration integration checks passed."
