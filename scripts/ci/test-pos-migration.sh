#!/usr/bin/env bash
set -euo pipefail

database_url="${DATABASE_TEST_URL:-postgresql://postgres:postgres@127.0.0.1:54329/pt_portal_test}"
customer_fixture="tests/integration/fixtures/customer_portal_staff_foundation.sql"
customer_foundation="scripts/migrations/20260831_customer_portal_integration_foundation.sql"
loyalty_lifecycle="scripts/migrations/20260831_customer_portal_loyalty_lifecycle.sql"
pos_fixture="tests/integration/fixtures/pos_prerequisites.sql"
pos_migration="supabase/migrations/20260908214024_pos_module_complete.sql"
catalogue_migration="supabase/migrations/20260909102606_pos_catalogue_configuration.sql"
assertions="tests/integration/pos_module.sql"
rollback_migration="$(mktemp)"
rollback_catalogue_migration="$(mktemp)"
trap 'rm -f "$rollback_migration" "$rollback_catalogue_migration"' EXIT

psql "$database_url" -v ON_ERROR_STOP=1 -f "$customer_fixture"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$customer_foundation"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$loyalty_lifecycle"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$pos_fixture"

# Strip only the migration's top-level transaction so the complete migration can
# be parsed and executed inside this disposable rollback.
sed '/^begin;$/d;/^commit;$/d' "$pos_migration" > "$rollback_migration"
sed '/^begin;$/d;/^commit;$/d' "$catalogue_migration" > "$rollback_catalogue_migration"
psql "$database_url" -v ON_ERROR_STOP=1 <<SQL
begin;
\i $rollback_migration
\i $rollback_catalogue_migration
rollback;
SQL

if [[ "$(psql "$database_url" -Atqc "select to_regprocedure('public.pos_schema_status()') is null")" != "t" ]]; then
  echo "POS migration rollback left schema objects installed"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$pos_migration"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$catalogue_migration"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$assertions"

echo "POS module migration integration checks passed."
