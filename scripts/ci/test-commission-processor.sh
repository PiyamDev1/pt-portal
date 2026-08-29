#!/usr/bin/env bash
set -euo pipefail

database_url="${DATABASE_TEST_URL:-postgresql://postgres:postgres@127.0.0.1:54331/postgres}"
fixture="tests/integration/fixtures/ticketing_foundation_schema.sql"
source_foundation="scripts/migrations/20260822_create_ticketing_commission_foundation.sql"
commission_foundation="scripts/migrations/20260829_commission_shadow_foundation.sql"
commission_processor="scripts/migrations/20260829_commission_shadow_processor.sql"
assertions="tests/integration/commission_shadow_processor.sql"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$fixture"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$source_foundation"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_foundation"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_processor"

first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_processor"
second_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
if [[ "$first_applied_at" != "$second_applied_at" ]]; then
  echo "Idempotent Commission processor rerun changed the capability timestamp"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$assertions"
echo "Commission shadow processor integration test passed"
