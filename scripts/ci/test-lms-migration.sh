#!/usr/bin/env bash
set -euo pipefail

database_url="${DATABASE_TEST_URL:-postgresql://postgres:postgres@127.0.0.1:54329/pt_portal_test}"
lms_migration="scripts/migrations/20260812_secure_atomic_lms_operations.sql"
installment_migration="scripts/migrations/20260812_update_lms_installments_atomically.sql"
fixture="tests/integration/fixtures/lms_schema.sql"
assertions="tests/integration/lms_atomic_operations.sql"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$fixture"

# Prove that the migration can be rolled back cleanly before installing it.
psql "$database_url" -v ON_ERROR_STOP=1 <<SQL
begin;
\i $lms_migration
\i $installment_migration
select public.lms_schema_status();
rollback;
SQL

if [[ "$(psql "$database_url" -Atqc "select to_regprocedure('public.lms_schema_status()') is null")" != "t" ]]; then
  echo "Migration rollback left lms_schema_status installed"
  exit 1
fi

if [[ "$(psql "$database_url" -Atqc "select to_regprocedure('public.lms_update_installments(jsonb)') is null")" != "t" ]]; then
  echo "Migration rollback left lms_update_installments installed"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$lms_migration"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$installment_migration"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$assertions"

# Exercise simultaneous retries from separate database sessions. The advisory
# transaction lock and idempotency table must produce one ledger row.
concurrent_sql="select public.lms_record_payment((select id from public.loans limit 1), '00000000-0000-0000-0000-000000000001', 7, null, 'concurrent retry', '2026-08-12T12:00:00Z', 'integration-concurrent-1');"
psql "$database_url" -v ON_ERROR_STOP=1 -c "$concurrent_sql" >/dev/null &
first_pid=$!
psql "$database_url" -v ON_ERROR_STOP=1 -c "$concurrent_sql" >/dev/null &
second_pid=$!
wait "$first_pid"
wait "$second_pid"

concurrent_count="$(psql "$database_url" -Atqc "select count(*) from public.loan_transactions where remark = 'concurrent retry'")"
if [[ "$concurrent_count" != "1" ]]; then
  echo "Concurrent retry created $concurrent_count ledger rows; expected 1"
  exit 1
fi

echo "Atomic LMS migration integration checks passed."
