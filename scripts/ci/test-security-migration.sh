#!/usr/bin/env bash
set -euo pipefail

database_url="${DATABASE_TEST_URL:-postgresql://postgres:postgres@127.0.0.1:54329/pt_portal_test}"
migration="scripts/migrations/20260812_security_rate_limits.sql"
assertions="tests/integration/security_rate_limits.sql"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$migration"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$assertions"

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
