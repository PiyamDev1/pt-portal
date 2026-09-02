#!/usr/bin/env bash
set -euo pipefail

database_url="${DATABASE_TEST_URL:-postgresql://postgres:postgres@127.0.0.1:54329/pt_portal_test}"
workflow_migration="scripts/migrations/20260902_commission_compensation_accounting_workflow.sql"
workflow_assertions="tests/integration/commission_compensation_accounting_workflow.sql"

# Establish the exact Ticketing capability required by confirmed-refund capture.
DATABASE_TEST_URL="$database_url" bash scripts/ci/test-ticketing-migration.sh

prerequisites=(
  tests/integration/fixtures/commission_package_schema.sql
  tests/integration/fixtures/commission_application_schema.sql
  scripts/migrations/20260829_commission_shadow_foundation.sql
  scripts/migrations/20260829_commission_shadow_processor.sql
  scripts/migrations/20260829_commission_hr_department_access.sql
  scripts/migrations/20260829_commission_staff_profiles.sql
  scripts/migrations/20260829_commission_staff_profiles_assistance_scope.sql
  scripts/migrations/20260830_commission_compensation_and_tiers.sql
  scripts/migrations/20260830_commission_profile_effective_dates.sql
  scripts/migrations/20260830_commission_package_shadow_integration.sql
  scripts/migrations/20260830_commission_package_readiness.sql
  scripts/migrations/20260830_commission_application_shadow_integration.sql
  scripts/migrations/20260830_commission_urgent_applications_and_plan_mutations.sql
  scripts/migrations/20260830_commission_application_recipient_routing.sql
  scripts/migrations/20260831_commission_historical_profile_editing.sql
  scripts/migrations/20260831_commission_ticketing_waivers.sql
)

for migration in "${prerequisites[@]}"; do
  psql "$database_url" -v ON_ERROR_STOP=1 -q -f "$migration"
done

# Preserve a real exception code introduced by capability 2026083101. The
# forward workflow constraint must accept already-live missing-rate rows.
psql "$database_url" -v ON_ERROR_STOP=1 -q -c \
  "insert into public.commission_exceptions (exception_code, details)
   values ('missing_exchange_rate', '{\"fixture\":true}'::jsonb)"

commission_schema_fingerprint() {
  psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
    "with definitions as (
       select 'function:' || procedure.oid::regprocedure::text as object_name,
         pg_get_functiondef(procedure.oid) as definition
       from pg_proc procedure
       join pg_namespace namespace on namespace.oid = procedure.pronamespace
       where namespace.nspname = 'public'
         and procedure.proname like 'commission_%'
       union all
       select 'constraint:' || relation.relname || ':' || constraint_record.conname,
         pg_get_constraintdef(constraint_record.oid, true)
       from pg_constraint constraint_record
       join pg_class relation on relation.oid = constraint_record.conrelid
       join pg_namespace namespace on namespace.oid = relation.relnamespace
       where namespace.nspname = 'public'
         and relation.relname like 'commission_%'
       union all
       select 'index:' || index_relation.relname,
         pg_get_indexdef(index_record.indexrelid)
       from pg_index index_record
       join pg_class relation on relation.oid = index_record.indrelid
       join pg_class index_relation on index_relation.oid = index_record.indexrelid
       join pg_namespace namespace on namespace.oid = relation.relnamespace
       where namespace.nspname = 'public'
         and relation.relname like 'commission_%'
       union all
       select 'relation:' || relation.relname,
         concat_ws('|', relation.relkind::text, relation.relrowsecurity::text,
           coalesce(relation.relacl::text, ''))
       from pg_class relation
       join pg_namespace namespace on namespace.oid = relation.relnamespace
       where namespace.nspname = 'public'
         and relation.relname like 'commission_%'
       union all
       select 'policy:' || policy.tablename || ':' || policy.policyname,
         concat_ws('|', policy.cmd, policy.permissive::text, policy.roles::text,
           coalesce(policy.qual, ''), coalesce(policy.with_check, ''))
       from pg_policies policy
       where policy.schemaname = 'public'
         and policy.tablename like 'commission_%'
     )
     select md5(string_agg(object_name || '=' || definition, E'\\n'
       order by object_name, definition)) from definitions"
}

psql "$database_url" -v ON_ERROR_STOP=1 -q -f "$workflow_migration"
first_capability_state="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at::text || '|' || details::text
   from public.portal_schema_versions where component = 'commission'")"
first_schema_fingerprint="$(commission_schema_fingerprint)"

psql "$database_url" -v ON_ERROR_STOP=1 -q -f "$workflow_migration"
second_capability_state="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select applied_at::text || '|' || details::text
   from public.portal_schema_versions where component = 'commission'")"
second_schema_fingerprint="$(commission_schema_fingerprint)"
if [[ "$first_capability_state" != "$second_capability_state" ]]; then
  echo "Idempotent Commission workflow replay changed the capability state"
  exit 1
fi
if [[ "$first_schema_fingerprint" != "$second_schema_fingerprint" ]]; then
  echo "Idempotent Commission workflow replay changed schema semantics"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$workflow_assertions"

# A busy result must remain unaudited and retryable. Hold the same global lock
# used by the workflow long enough to prove the non-blocking path.
concurrency_dir="$(mktemp -d)"
cleanup_concurrency() {
  rm -rf -- "$concurrency_dir"
}
trap cleanup_concurrency EXIT

psql "$database_url" -v ON_ERROR_STOP=1 -q -c \
  "begin;
   select pg_advisory_xact_lock(hashtextextended('commission:shadow-worker', 0));
   select pg_sleep(4) /* commission-workflow-lock-holder */;
   commit;" >"$concurrency_dir/lock-holder.out" 2>"$concurrency_dir/lock-holder.err" &
lock_holder_pid=$!

lock_ready=false
for _ in {1..40}; do
  if [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
    "select count(*) from pg_locks held
     where held.locktype = 'advisory'
       and held.granted
       and held.classid = ((hashtextextended('commission:shadow-worker', 0) >> 32)
         & 4294967295)::oid
       and held.objid = (hashtextextended('commission:shadow-worker', 0)
         & 4294967295)::oid
       and held.objsubid = 1")" != "0" ]]; then
    lock_ready=true
    break
  fi
  sleep 0.1
done
if [[ "$lock_ready" != true ]]; then
  echo "Commission workflow concurrency lock holder did not become ready"
  wait "$lock_holder_pid" || true
  exit 1
fi

busy_result="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select public.commission_process_shadow_2026082902(
     null, 17, 'commission-concurrency-busy'
   )::text")"
if [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select coalesce(('$busy_result'::jsonb ->> 'busy')::boolean, false)")" != "t" ]]; then
  echo "Commission workflow did not return busy while its global lock was held"
  wait "$lock_holder_pid" || true
  exit 1
fi
if [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select count(*) from public.commission_audit_events
   where actor_employee_id is null
     and action = 'shadow.workflow.processed'
     and request_key = 'commission-concurrency-busy'")" != "0" ]]; then
  echo "Commission workflow audited a transient busy result"
  wait "$lock_holder_pid" || true
  exit 1
fi
wait "$lock_holder_pid"
psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select public.commission_process_shadow_2026082902(
     null, 17, 'commission-concurrency-busy'
   )::text" >"$concurrency_dir/busy-retry.out"

# Two NULL-system callers using whitespace variants of one key must serialize
# onto one canonical audit row, with exactly one call reported as a replay.
psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select public.commission_process_shadow_2026082902(
     null, 19, ' commission-concurrency-race '
   )::text" >"$concurrency_dir/race-one.out" 2>"$concurrency_dir/race-one.err" &
race_one_pid=$!
psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select public.commission_process_shadow_2026082902(
     null, 19, 'commission-concurrency-race'
   )::text" >"$concurrency_dir/race-two.out" 2>"$concurrency_dir/race-two.err" &
race_two_pid=$!
wait "$race_one_pid"
wait "$race_two_pid"

race_one_replay="$(jq -r '.idempotentReplay' "$concurrency_dir/race-one.out")"
race_two_replay="$(jq -r '.idempotentReplay' "$concurrency_dir/race-two.out")"
if [[ "$race_one_replay,$race_two_replay" != "true,false" \
  && "$race_one_replay,$race_two_replay" != "false,true" ]]; then
  echo "Concurrent Commission calls did not produce exactly one replay"
  exit 1
fi
if [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c \
  "select count(*) from public.commission_audit_events
   where actor_employee_id is null
     and action = 'shadow.workflow.processed'
     and request_key = 'commission-concurrency-race'")" != "1" ]]; then
  echo "Concurrent Commission calls produced a non-canonical audit count"
  exit 1
fi

echo "Commission compensation and Accounting workflow integration test passed"
