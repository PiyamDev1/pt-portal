#!/usr/bin/env bash
set -euo pipefail

database_url="${DATABASE_TEST_URL:-postgresql://postgres:postgres@127.0.0.1:54331/postgres}"
fixture="tests/integration/fixtures/ticketing_foundation_schema.sql"
source_foundation="scripts/migrations/20260822_create_ticketing_commission_foundation.sql"
commission_foundation="scripts/migrations/20260829_commission_shadow_foundation.sql"
commission_processor="scripts/migrations/20260829_commission_shadow_processor.sql"
commission_access="scripts/migrations/20260829_commission_hr_department_access.sql"
commission_profiles="scripts/migrations/20260829_commission_staff_profiles.sql"
commission_assistance_scope="scripts/migrations/20260829_commission_staff_profiles_assistance_scope.sql"
commission_compensation="scripts/migrations/20260830_commission_compensation_and_tiers.sql"
assertions="tests/integration/commission_staff_profiles.sql"
assistance_assertions="tests/integration/commission_assistance_scope.sql"
compensation_legacy_fixture="tests/integration/commission_compensation_legacy_fixture.sql"
compensation_assertions="tests/integration/commission_compensation_and_tiers.sql"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$fixture"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$source_foundation"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_foundation"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_processor"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_access"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_profiles"

first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_profiles"
second_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
if [[ "$first_applied_at" != "$second_applied_at" ]]; then
  echo "Idempotent Commission staff-profile rerun changed the capability timestamp"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$assertions"

first_assistance_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_assistance_scope"
second_assistance_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
if [[ "$first_assistance_applied_at" == "$second_assistance_applied_at" ]]; then
  echo "Commission assistance-scope migration did not advance the capability timestamp"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_assistance_scope"
third_assistance_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
if [[ "$second_assistance_applied_at" != "$third_assistance_applied_at" ]]; then
  echo "Idempotent Commission assistance-scope rerun changed the capability timestamp"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$assistance_assertions"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$compensation_legacy_fixture"

first_compensation_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_compensation"
second_compensation_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
if [[ "$first_compensation_applied_at" == "$second_compensation_applied_at" ]]; then
  echo "Commission compensation migration did not advance the capability timestamp"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_compensation"
third_compensation_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
if [[ "$second_compensation_applied_at" != "$third_compensation_applied_at" ]]; then
  echo "Idempotent Commission compensation rerun changed the capability timestamp"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$compensation_assertions"

future_marker='future-commission-profile-sentinel'
psql "$database_url" -v ON_ERROR_STOP=1 -c "
  update public.portal_schema_versions
  set version = 2026083002,
      details = jsonb_build_object('migration', '$future_marker')
  where component = 'commission';
" >/dev/null
future_state_before="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select version::text || '|' || (details ->> 'migration')
   from public.portal_schema_versions where component = 'commission'")"
future_replay_output="$(mktemp)"
trap 'rm -f "$future_replay_output"' EXIT
for historical_migration in "$commission_profiles" "$commission_assistance_scope" "$commission_compensation"; do
  if psql "$database_url" -v ON_ERROR_STOP=1 -f "$historical_migration" \
    >"$future_replay_output" 2>&1; then
    echo "Historical Commission profile migration ran over a future capability"
    exit 1
  fi
  if ! grep -q 'COMMISSION_FORWARD_MIGRATION_REPLAY_BLOCKED' "$future_replay_output"; then
    cat "$future_replay_output"
    echo "Historical Commission profile migration failed without the forward-replay guard"
    exit 1
  fi
done
future_state_after="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select version::text || '|' || (details ->> 'migration')
   from public.portal_schema_versions where component = 'commission'")"
if [[ "$future_state_before" != "2026083002|$future_marker" \
  || "$future_state_after" != "$future_state_before" ]]; then
  echo "Blocked historical Commission replay changed future schema state"
  exit 1
fi

echo "Commission staff-profile integration test passed"
