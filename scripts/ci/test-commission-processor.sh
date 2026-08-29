#!/usr/bin/env bash
set -euo pipefail

database_url="${DATABASE_TEST_URL:-postgresql://postgres:postgres@127.0.0.1:54331/postgres}"
fixture="tests/integration/fixtures/ticketing_foundation_schema.sql"
source_foundation="scripts/migrations/20260822_create_ticketing_commission_foundation.sql"
commission_foundation="scripts/migrations/20260829_commission_shadow_foundation.sql"
commission_processor="scripts/migrations/20260829_commission_shadow_processor.sql"
commission_access="scripts/migrations/20260829_commission_hr_department_access.sql"
assertions="tests/integration/commission_shadow_processor.sql"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$fixture"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$source_foundation"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_foundation"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_processor"

processor_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_processor"
processor_second_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
if [[ "$processor_first_applied_at" != "$processor_second_applied_at" ]]; then
  echo "Idempotent Commission processor rerun changed the capability timestamp"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_access"
access_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_access"
access_second_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
if [[ "$access_first_applied_at" != "$access_second_applied_at" ]]; then
  echo "Idempotent Commission HR-access rerun changed the capability timestamp"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$assertions"
echo "Commission shadow processor integration test passed"
