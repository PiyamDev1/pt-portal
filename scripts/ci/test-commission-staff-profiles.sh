#!/usr/bin/env bash
set -euo pipefail

database_url="${DATABASE_TEST_URL:-postgresql://postgres:postgres@127.0.0.1:54331/postgres}"
fixture="tests/integration/fixtures/ticketing_foundation_schema.sql"
package_fixture="tests/integration/fixtures/commission_package_schema.sql"
application_fixture="tests/integration/fixtures/commission_application_schema.sql"
application_legacy_fixture="tests/integration/fixtures/commission_application_legacy_fixture.sql"
application_function_drift_fixture="tests/integration/fixtures/commission_application_function_drift_fixture.sql"
source_foundation="scripts/migrations/20260822_create_ticketing_commission_foundation.sql"
commission_foundation="scripts/migrations/20260829_commission_shadow_foundation.sql"
commission_processor="scripts/migrations/20260829_commission_shadow_processor.sql"
commission_access="scripts/migrations/20260829_commission_hr_department_access.sql"
commission_profiles="scripts/migrations/20260829_commission_staff_profiles.sql"
commission_assistance_scope="scripts/migrations/20260829_commission_staff_profiles_assistance_scope.sql"
commission_compensation="scripts/migrations/20260830_commission_compensation_and_tiers.sql"
commission_profile_dates="scripts/migrations/20260830_commission_profile_effective_dates.sql"
commission_packages="scripts/migrations/20260830_commission_package_shadow_integration.sql"
commission_package_readiness="scripts/migrations/20260830_commission_package_readiness.sql"
commission_applications="scripts/migrations/20260830_commission_application_shadow_integration.sql"
commission_urgent_applications="scripts/migrations/20260830_commission_urgent_applications_and_plan_mutations.sql"
commission_application_routing="scripts/migrations/20260830_commission_application_recipient_routing.sql"
assertions="tests/integration/commission_staff_profiles.sql"
assistance_assertions="tests/integration/commission_assistance_scope.sql"
compensation_legacy_fixture="tests/integration/commission_compensation_legacy_fixture.sql"
compensation_assertions="tests/integration/commission_compensation_and_tiers.sql"
profile_date_assertions="tests/integration/commission_profile_effective_dates.sql"
package_assertions="tests/integration/commission_package_shadow_integration.sql"
application_assertions="tests/integration/commission_application_shadow_integration.sql"
urgent_application_assertions="tests/integration/commission_urgent_applications_and_plan_mutations.sql"
application_routing_assertions="tests/integration/commission_application_recipient_routing.sql"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$fixture"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$package_fixture"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$application_fixture"
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

first_profile_dates_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_profile_dates"
second_profile_dates_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
if [[ "$first_profile_dates_applied_at" == "$second_profile_dates_applied_at" ]]; then
  echo "Commission profile effective-date migration did not advance the capability timestamp"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_profile_dates"
third_profile_dates_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
if [[ "$second_profile_dates_applied_at" != "$third_profile_dates_applied_at" ]]; then
  echo "Idempotent Commission profile effective-date rerun changed the capability timestamp"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$profile_date_assertions"

first_packages_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_packages"
second_packages_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
if [[ "$first_packages_applied_at" == "$second_packages_applied_at" ]]; then
  echo "Commission package integration migration did not advance the capability timestamp"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_packages"
third_packages_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
if [[ "$second_packages_applied_at" != "$third_packages_applied_at" ]]; then
  echo "Idempotent Commission package integration rerun changed the capability timestamp"
  exit 1
fi

first_readiness_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_package_readiness"
second_readiness_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
if [[ "$first_readiness_applied_at" == "$second_readiness_applied_at" ]]; then
  echo "Commission package readiness migration did not advance the capability timestamp"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_package_readiness"
third_readiness_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
if [[ "$second_readiness_applied_at" != "$third_readiness_applied_at" ]]; then
  echo "Idempotent Commission package readiness rerun changed the capability timestamp"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$package_assertions"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$application_legacy_fixture"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$application_function_drift_fixture"

first_applications_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_applications"
second_applications_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
if [[ "$first_applications_applied_at" == "$second_applications_applied_at" ]]; then
  echo "Commission Application integration migration did not advance the capability timestamp"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_applications"
third_applications_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
if [[ "$second_applications_applied_at" != "$third_applications_applied_at" ]]; then
  echo "Idempotent Commission Application integration rerun changed the capability timestamp"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$application_assertions"

first_urgent_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_urgent_applications"
second_urgent_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
if [[ "$first_urgent_applied_at" == "$second_urgent_applied_at" ]]; then
  echo "Commission urgent Application migration did not advance the capability timestamp"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_urgent_applications"
third_urgent_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
if [[ "$second_urgent_applied_at" != "$third_urgent_applied_at" ]]; then
  echo "Idempotent Commission urgent Application rerun changed the capability timestamp"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$urgent_application_assertions"

first_routing_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_application_routing"
second_routing_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
if [[ "$first_routing_applied_at" == "$second_routing_applied_at" ]]; then
  echo "Commission Application routing migration did not advance the capability timestamp"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$commission_application_routing"
third_routing_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at from public.portal_schema_versions where component = 'commission'")"
if [[ "$second_routing_applied_at" != "$third_routing_applied_at" ]]; then
  echo "Idempotent Commission Application routing rerun changed the capability timestamp"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$application_routing_assertions"

future_marker='future-commission-profile-sentinel'
psql "$database_url" -v ON_ERROR_STOP=1 -c "
  update public.portal_schema_versions
  set version = 2026083008,
      details = jsonb_build_object('migration', '$future_marker')
  where component = 'commission';
" >/dev/null
future_state_before="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select version::text || '|' || (details ->> 'migration')
   from public.portal_schema_versions where component = 'commission'")"
future_replay_output="$(mktemp)"
trap 'rm -f "$future_replay_output"' EXIT
for historical_migration in "$commission_profiles" "$commission_assistance_scope" "$commission_compensation" "$commission_profile_dates" "$commission_packages" "$commission_package_readiness" "$commission_applications" "$commission_urgent_applications" "$commission_application_routing"; do
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
if [[ "$future_state_before" != "2026083008|$future_marker" \
  || "$future_state_after" != "$future_state_before" ]]; then
  echo "Blocked historical Commission replay changed future schema state"
  exit 1
fi

echo "Commission staff-profile integration test passed"
