#!/usr/bin/env bash
set -euo pipefail

database_url="${DATABASE_TEST_URL:-postgresql://postgres:postgres@127.0.0.1:54329/pt_portal_test}"
fixture="tests/integration/fixtures/ticketing_foundation_schema.sql"
migration="scripts/migrations/20260822_create_ticketing_commission_foundation.sql"
assertions="tests/integration/ticketing_foundation.sql"
quick_entry_migration="scripts/migrations/20260822_create_ticketing_quick_tk.sql"
quick_entry_assertions="tests/integration/ticketing_quick_entry.sql"
completion_migration="scripts/migrations/20260822_ticketing_tk_completion.sql"
completion_assertions="tests/integration/ticketing_completion.sql"
service_transaction_migration="scripts/migrations/20260823_ticketing_dc_rer_entry.sql"
service_transaction_assertions="tests/integration/ticketing_service_transactions.sql"
rer_chronology_migration="scripts/migrations/20260823_ticketing_rer_chronology_guard.sql"
service_response_dates_migration="scripts/migrations/20260823_ticketing_service_response_dates.sql"
immutable_replay_lineage_migration="scripts/migrations/20260823_ticketing_service_response_lineage_guard.sql"
low_fare_migration="scripts/migrations/20260824_ticketing_low_fare_adjustments.sql"
low_fare_assertions="tests/integration/ticketing_low_fare_adjustments.sql"
attribution_migration="scripts/migrations/20260824_ticketing_attribution_overrides.sql"
attribution_assertions="tests/integration/ticketing_attribution_overrides.sql"
admin_completion_pre_upgrade="tests/integration/ticketing_admin_completion_pre_upgrade.sql"
admin_completion_migration="scripts/migrations/20260824_ticketing_admin_completion.sql"
admin_completion_assertions="tests/integration/ticketing_admin_completion.sql"
pgcrypto_compat_migration="scripts/migrations/20260825_ticketing_pgcrypto_compat.sql"
runtime_readiness_migration="scripts/migrations/20260826_ticketing_runtime_readiness.sql"
itinerary_migration="scripts/migrations/20260826_ticketing_sector_itinerary.sql"
itinerary_assertions="tests/integration/ticketing_root_itinerary.sql"
schedule_change_migration="scripts/migrations/20260827_ticketing_schedule_changes.sql"
schedule_change_assertions="tests/integration/ticketing_schedule_changes.sql"
time_limit_migration="scripts/migrations/20260827_ticketing_time_limits.sql"
time_limit_assertions="tests/integration/ticketing_time_limits.sql"
service_passenger_allocation_migration="scripts/migrations/20260827_ticketing_service_passenger_allocation.sql"
service_passenger_allocation_assertions="tests/integration/ticketing_service_passenger_allocation.sql"
youth_assistance_archive_migration="scripts/migrations/20260828_ticketing_youth_assistance_archive.sql"
youth_assistance_archive_assertions="tests/integration/ticketing_youth_assistance_archive.sql"
admin_requests_suppliers_api_migration="scripts/migrations/20260828_ticketing_admin_requests_suppliers_api.sql"
admin_requests_suppliers_api_assertions="tests/integration/ticketing_admin_requests_suppliers_api.sql"
voucher_foundation_migration="scripts/migrations/20260829_ticketing_voucher_foundation.sql"
voucher_foundation_assertions="tests/integration/ticketing_voucher_foundation.sql"
package_pnr_reconciliation_migration="scripts/migrations/20260829_ticketing_package_pnr_reconciliation.sql"
package_pnr_reconciliation_assertions="tests/integration/ticketing_package_pnr_reconciliation.sql"
refund_voucher_lifecycle_migration="scripts/migrations/20260829_ticketing_refund_voucher_lifecycle.sql"
refund_voucher_lifecycle_assertions="tests/integration/ticketing_refund_voucher_lifecycle.sql"
fare_check_observations_migration="scripts/migrations/20260829_ticketing_fare_check_observations.sql"
fare_check_observations_assertions="tests/integration/ticketing_fare_check_observations.sql"
archive_tombstones_migration="scripts/migrations/20260830_ticketing_archive_commission_tombstones.sql"
archive_tombstones_assertions="tests/integration/ticketing_archive_commission_tombstones.sql"
unpriced_held_migration="scripts/migrations/20260831_ticketing_unpriced_held_quick_entry.sql"
unpriced_held_assertions="tests/integration/ticketing_unpriced_held_quick_entry.sql"
staff_family_migration="scripts/migrations/20260831_ticketing_waiver_staff_family_commercial_policy.sql"
staff_family_assertions="tests/integration/ticketing_staff_family_commercial_policy.sql"
corrections_refund_confirmation_migration="scripts/migrations/20260902_ticketing_corrections_refund_confirmation.sql"
corrections_refund_confirmation_assertions="tests/integration/ticketing_corrections_refund_confirmation.sql"
maintenance_admin_operations_migration="scripts/migrations/20260902_ticketing_maintenance_admin_operations.sql"
maintenance_admin_operations_assertions="tests/integration/ticketing_maintenance_admin_operations.sql"

assert_forward_migration_replay_blocked() {
  local replay_migration="$1"
  local replay_output

  if replay_output="$(psql "$database_url" -v ON_ERROR_STOP=1 -f "$replay_migration" 2>&1)"; then
    echo "Older Ticketing migration unexpectedly replayed over a later capability: $replay_migration"
    exit 1
  fi

  if [[ "$replay_output" != *"TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED"* ]]; then
    echo "Older Ticketing migration did not fail at its forward-version guard: $replay_migration"
    echo "$replay_output"
    exit 1
  fi
}

ticketing_schema_fingerprint() {
  psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    with state_parts(value) as (
      select concat(
        'schema-version|', component, '|', version, '|', applied_at, '|', details
      )
      from public.portal_schema_versions
      where component = 'ticketing'

      union all

      select concat(
        'routine|', procedure_row.prokind, '|',
        procedure_row.oid::regprocedure::text, '|',
        coalesce(procedure_row.proacl::text, ''), '|',
        pg_get_functiondef(procedure_row.oid)
      )
      from pg_proc procedure_row
      join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
      where namespace_row.nspname = 'public'
        and procedure_row.prokind in ('f', 'p')

      union all

      select concat(
        'relation|', class_row.relkind, '|', class_row.relname,
        '|', coalesce(class_row.relacl::text, ''), '|', class_row.relrowsecurity,
        '|', coalesce(class_row.reloptions::text, ''), '|',
        case
          when class_row.relkind in ('v', 'm')
            then pg_get_viewdef(class_row.oid, true)
          when class_row.relkind in ('i', 'I')
            then pg_get_indexdef(class_row.oid)
          else ''
        end
      )
      from pg_class class_row
      join pg_namespace namespace_row on namespace_row.oid = class_row.relnamespace
      where namespace_row.nspname = 'public'

      union all

      select concat(
        'constraint|', constraint_row.conname, '|',
        constraint_row.conrelid::regclass::text, '|',
        pg_get_constraintdef(constraint_row.oid, true)
      )
      from pg_constraint constraint_row
      join pg_namespace namespace_row
        on namespace_row.oid = constraint_row.connamespace
      where namespace_row.nspname = 'public'

      union all

      select concat(
        'trigger|', pg_get_triggerdef(trigger_row.oid, true)
      )
      from pg_trigger trigger_row
      where trigger_row.tgrelid in (
        select class_row.oid
        from pg_class class_row
        join pg_namespace namespace_row on namespace_row.oid = class_row.relnamespace
        where namespace_row.nspname = 'public'
      )
        and not trigger_row.tgisinternal

      union all

      select concat(
        'policy|', schemaname, '|', tablename, '|', policyname, '|', permissive,
        '|', roles::text, '|', cmd, '|', coalesce(qual, ''), '|', coalesce(with_check, '')
      )
      from pg_policies
      where schemaname = 'public'

      union all

      select concat(
        'schema-acl|', namespace_row.nspname, '|', coalesce(namespace_row.nspacl::text, '')
      )
      from pg_namespace namespace_row
      where namespace_row.nspname = 'public'
    )
    select md5(string_agg(value, E'\\n' order by value))
    from state_parts
  "
}

psql "$database_url" -v ON_ERROR_STOP=1 -f "$fixture"

# Supabase installs pgcrypto in the extensions schema while Ticketing's
# security-definer functions deliberately use a restricted search_path. Apply
# the compatibility shim before exercising any historical runtime capability,
# then prove it is least-privilege and idempotent.
psql "$database_url" -v ON_ERROR_STOP=1 -f "$pgcrypto_compat_migration"
pgcrypto_compat_first_definition="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select pg_get_functiondef('public.digest(text,text)'::regprocedure)
")"
pgcrypto_compat_first_acl="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select coalesce(proacl::text, '')
  from pg_proc
  where oid = 'public.digest(text,text)'::regprocedure
")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$pgcrypto_compat_migration"
if [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select
    public.digest('ticketing-pgcrypto-compat', 'sha256') =
      extensions.digest('ticketing-pgcrypto-compat', 'sha256')
    and not has_function_privilege('public', 'public.digest(text,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.digest(text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.digest(text,text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.digest(text,text)', 'EXECUTE')
")" != "t" ]] \
  || [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select pg_get_functiondef('public.digest(text,text)'::regprocedure)")" != "$pgcrypto_compat_first_definition" ]] \
  || [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select coalesce(proacl::text, '') from pg_proc where oid = 'public.digest(text,text)'::regprocedure")" != "$pgcrypto_compat_first_acl" ]]; then
  echo "Ticketing pgcrypto compatibility migration is incorrect or not idempotent"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$migration"
first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"

# The migration is intentionally idempotent because repository deployments may
# need to verify an already-ratcheted environment safely.
psql "$database_url" -v ON_ERROR_STOP=1 -f "$migration"
second_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
if [[ "$first_applied_at" != "$second_applied_at" ]]; then
  echo "Idempotent rerun changed the Ticketing capability application timestamp"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$assertions"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$quick_entry_migration"
quick_entry_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$quick_entry_migration"
quick_entry_second_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
if [[ "$quick_entry_first_applied_at" != "$quick_entry_second_applied_at" ]]; then
  echo "Idempotent quick-entry rerun changed the Ticketing capability application timestamp"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$quick_entry_assertions"

# Hold one real quick-entry transaction open in its audit trigger and prove a
# concurrent package-reservation writer cannot create a phantom match before
# the ticket, source event, and idempotency response commit.
psql "$database_url" -v ON_ERROR_STOP=1 -c "
  select public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000001',
    'package-evidence-race-lock',
    jsonb_build_object(
      'customerName', 'Package Race Lock',
      'pnr', 'RACE-LOCK-1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-22',
      'timeLimitAt', null,
      'issuedAt', '2026-08-22',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT',
          'quantity', 1,
          'unitSupplierCost', 100
        )
      )
    )
  )
" >/dev/null &
race_quick_entry_pid=$!

package_share_lock_seen=false
for _attempt in {1..50}; do
  package_share_lock_count="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    select count(*)
    from pg_locks
    where relation = 'public.travel_package_reservations'::regclass
      and mode = 'ShareLock'
      and granted
  ")"
  if [[ "$package_share_lock_count" -gt 0 ]]; then
    package_share_lock_seen=true
    break
  fi
  sleep 0.05
done

if [[ "$package_share_lock_seen" != true ]]; then
  wait "$race_quick_entry_pid" || true
  echo "Quick-entry package evidence lock was not observable in a concurrent session"
  exit 1
fi

if psql "$database_url" -v ON_ERROR_STOP=1 -c "
  set lock_timeout = '300ms';
  insert into public.travel_package_reservations (
    id,
    package_id,
    reservation_type,
    booking_reference,
    status
  ) values (
    '70000000-0000-0000-0000-000000000099',
    '60000000-0000-0000-0000-000000000010',
    'flight',
    'RACE-LOCK-1',
    'confirmed'
  )
" >/dev/null 2>&1; then
  wait "$race_quick_entry_pid" || true
  echo "Concurrent package reservation bypassed the quick-entry evidence lock"
  exit 1
fi

wait "$race_quick_entry_pid"
psql "$database_url" -v ON_ERROR_STOP=1 -c "
  drop trigger ticketing_test_pause_package_lock on public.ticket_audit_events;
  drop function public.ticketing_test_pause_package_lock()
" >/dev/null

psql "$database_url" -v ON_ERROR_STOP=1 -f "$completion_migration"
completion_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$completion_migration"
completion_second_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
if [[ "$completion_first_applied_at" != "$completion_second_applied_at" ]]; then
  echo "Idempotent completion rerun changed the Ticketing capability application timestamp"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$completion_assertions"

completion_race_facts="$(psql "$database_url" -Atq -F '|' -v ON_ERROR_STOP=1 -c "
  select booking.id, transaction.id, booking.version, transaction.version
  from public.ticket_bookings booking
  join public.ticket_transactions transaction on transaction.booking_id = booking.id
  where booking.normalized_pnr = 'COMP-C1'
    and transaction.service_type = 'TK'
    and transaction.parent_transaction_id is null
")"
IFS='|' read -r completion_race_booking_id completion_race_transaction_id \
  completion_race_booking_version completion_race_transaction_version \
  <<< "$completion_race_facts"

if [[ -z "$completion_race_booking_id" || -z "$completion_race_transaction_id" ]]; then
  echo "Completion optimistic-race fixture was not found"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  select public.ticketing_complete_tk_details(
    '40000000-0000-0000-0000-000000000001',
    '$completion_race_booking_id',
    'completion-race-winner',
    jsonb_build_object(
      'expectedBookingVersion', $completion_race_booking_version,
      'expectedTransactionVersion', $completion_race_transaction_version,
      'contactPhone', '+44 7000 333333',
      'departureDate', '2026-11-01',
      'returnDate', null,
      'paymentStatus', 'unpaid',
      'paidAt', null,
      'fareSales', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', null)
      ),
      'passengers', '[]'::jsonb
    )
  )
" >/dev/null &
completion_race_winner_pid=$!

completion_race_pause_seen=false
for _attempt in {1..100}; do
  completion_race_pause_count="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    select count(*)
    from pg_stat_activity
    where datname = current_database()
      and state = 'active'
      and wait_event = 'PgSleep'
      and query like '%completion-race-winner%'
  ")"
  if [[ "$completion_race_pause_count" -gt 0 ]]; then
    completion_race_pause_seen=true
    break
  fi
  sleep 0.05
done

if [[ "$completion_race_pause_seen" != true ]]; then
  wait "$completion_race_winner_pid" || true
  echo "Completion optimistic-race pause was not observable"
  exit 1
fi

completion_race_loser_output=""
if completion_race_loser_output="$(psql "$database_url" -v ON_ERROR_STOP=1 -c "
  select public.ticketing_complete_tk_details(
    '40000000-0000-0000-0000-000000000001',
    '$completion_race_booking_id',
    'completion-race-loser',
    jsonb_build_object(
      'expectedBookingVersion', $completion_race_booking_version,
      'expectedTransactionVersion', $completion_race_transaction_version,
      'contactPhone', '+44 7000 444444',
      'departureDate', '2026-11-01',
      'returnDate', null,
      'paymentStatus', 'unpaid',
      'paidAt', null,
      'fareSales', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', null)
      ),
      'passengers', '[]'::jsonb
    )
  )
" 2>&1)"; then
  wait "$completion_race_winner_pid" || true
  echo "Both same-version completion race contenders committed"
  exit 1
fi

if [[ "$completion_race_loser_output" != *"TICKETING_VERSION_CONFLICT"* ]]; then
  wait "$completion_race_winner_pid" || true
  echo "Completion race loser did not return the version-conflict hint"
  exit 1
fi

wait "$completion_race_winner_pid"

completion_race_result="$(psql "$database_url" -Atq -F '|' -v ON_ERROR_STOP=1 -c "
  select
    (select count(*) from public.ticket_audit_events audit
      where audit.transaction_id = '$completion_race_transaction_id'
        and audit.action = 'complete_tk_details'),
    booking.contact_phone,
    (select count(*) from public.ticket_idempotency_keys key_row
      where key_row.action_name = 'ticketing.complete_tk_details.v1'
        and key_row.idempotency_key = 'completion-race-winner'),
    (select count(*) from public.ticket_idempotency_keys key_row
      where key_row.action_name = 'ticketing.complete_tk_details.v1'
        and key_row.idempotency_key = 'completion-race-loser'),
    booking.version,
    transaction.version
  from public.ticket_bookings booking
  join public.ticket_transactions transaction on transaction.id = '$completion_race_transaction_id'
  where booking.id = '$completion_race_booking_id'
")"
completion_race_expected="1|+44 7000 333333|1|0|$((completion_race_booking_version + 1))|$((completion_race_transaction_version + 1))"
if [[ "$completion_race_result" != "$completion_race_expected" ]]; then
  echo "Completion optimistic race left incorrect operational/audit/retry state"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  drop trigger ticketing_test_pause_completion_race on public.ticket_audit_events;
  drop function public.ticketing_test_pause_completion_race()
" >/dev/null

psql "$database_url" -v ON_ERROR_STOP=1 -f "$service_transaction_migration"
service_transaction_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$service_transaction_migration"
service_transaction_second_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
if [[ "$service_transaction_first_applied_at" != "$service_transaction_second_applied_at" ]]; then
  echo "Idempotent DC/R-ER migration rerun changed the Ticketing capability application timestamp"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$rer_chronology_migration"
rer_chronology_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$rer_chronology_migration"
rer_chronology_second_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
if [[ "$rer_chronology_first_applied_at" != "$rer_chronology_second_applied_at" ]]; then
  echo "Idempotent R-ER chronology-guard rerun changed the Ticketing capability application timestamp"
  exit 1
fi

# Capability 2303 wraps the already-live service RPC bodies so exact branch
# business dates are present even on legacy idempotent replay responses.
psql "$database_url" -v ON_ERROR_STOP=1 -f "$service_response_dates_migration"
service_response_dates_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$service_response_dates_migration"
service_response_dates_second_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
if [[ "$service_response_dates_first_applied_at" != "$service_response_dates_second_applied_at" ]]; then
  echo "Idempotent service-response-date rerun changed the Ticketing capability application timestamp"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$immutable_replay_lineage_migration"
immutable_replay_lineage_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$immutable_replay_lineage_migration"
immutable_replay_lineage_second_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
if [[ "$immutable_replay_lineage_first_applied_at" != "$immutable_replay_lineage_second_applied_at" ]]; then
  echo "Idempotent immutable-replay/lineage rerun changed the Ticketing capability application timestamp"
  exit 1
fi

# Every historical migration has a read-only forward-version guard immediately
# after BEGIN. Prove each isolated replay fails before changing any public
# routine, trigger, policy, relation grant, or capability metadata. The 2304
# procedure tombstones remain a second line of defense for legacy copies.
post_2304_fingerprint="$(ticketing_schema_fingerprint)"
historical_ticketing_migrations=(
  "$migration"
  "$quick_entry_migration"
  "$completion_migration"
  "$service_transaction_migration"
  "$rer_chronology_migration"
  "$service_response_dates_migration"
)
for historical_migration in "${historical_ticketing_migrations[@]}"; do
  assert_forward_migration_replay_blocked "$historical_migration"
  post_historical_fingerprint="$(ticketing_schema_fingerprint)"
  if [[ "$post_historical_fingerprint" != "$post_2304_fingerprint" ]]; then
    echo "Blocked historical Ticketing replay changed schema state: $historical_migration"
    exit 1
  fi
done

post_guard_replay_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
post_guard_status="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select public.ticketing_schema_status() ->> 'requiredVersion'")"
post_guard_function="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select position('TICKETING_REISSUE_CHAIN_CONFLICT' in pg_get_functiondef('public.validate_ticket_service_transaction_lineage_2026082304()'::regprocedure))")"
post_guard_wrapper="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select position('ticketing_enrich_service_business_dates_2026082304' in pg_get_functiondef('public.ticketing_append_service_transaction(uuid,uuid,text,jsonb)'::regprocedure))")"
post_guard_helper="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select position('source_fact_key' in pg_get_functiondef('public.ticketing_enrich_service_business_dates_2026082304(uuid,jsonb)'::regprocedure))")"
post_guard_trigger="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select procedure_row.proname from pg_trigger trigger_row join pg_proc procedure_row on procedure_row.oid = trigger_row.tgfoid where trigger_row.tgrelid = 'public.ticket_transactions'::regclass and trigger_row.tgname = 'ticket_transactions_validate_service_lineage'")"
post_guard_tombstones="$(psql "$database_url" -Atq -F '|' -v ON_ERROR_STOP=1 -c "select lineage.prokind, adapter.prokind from pg_proc lineage cross join pg_proc adapter where lineage.oid = to_regprocedure('public.validate_ticket_service_transaction_lineage()') and adapter.oid = to_regprocedure('public.ticketing_enrich_service_business_dates_2026082303(uuid,jsonb)')")"
if [[ "$post_guard_replay_applied_at" != "$immutable_replay_lineage_first_applied_at" \
  || "$post_guard_status" != "2026082304" \
  || "$post_guard_function" -le 0 \
  || "$post_guard_wrapper" -le 0 \
  || "$post_guard_helper" -le 0 \
  || "$post_guard_trigger" != "validate_ticket_service_transaction_lineage_2026082304" \
  || "$post_guard_tombstones" != "p|p" ]]; then
  echo "Blocked historical Ticketing replay changed the installed 2304 guard or response contract"
  exit 1
fi

# Simulate a future migration replacing routines that 2304 also owns. The 2304
# guard must reject before its first CREATE OR REPLACE, preserving every future
# definition, grant, trigger attachment, and capability-row fact.
psql "$database_url" -v ON_ERROR_STOP=1 -c "
  begin;

  update public.portal_schema_versions
  set version = 2026082305
  where component = 'ticketing';

  create or replace function public.ticketing_schema_status()
  returns jsonb
  language sql
  stable
  security definer
  set search_path = pg_catalog, public, pg_temp
  as \$\$
    select jsonb_build_object(
      'futureSentinel', 'ticketing-status-2026082305'
    )
  \$\$;

  create or replace function public.ticketing_enrich_service_business_dates_2026082304(
    p_booking_id uuid,
    p_response jsonb
  )
  returns jsonb
  language sql
  security definer
  set search_path = pg_catalog, public, pg_temp
  set row_security = off
  as \$\$
    select p_response || jsonb_build_object(
      'futureSentinel', 'ticketing-adapter-2026082305'
    )
  \$\$;

  create or replace function public.validate_ticket_service_transaction_lineage_2026082304()
  returns trigger
  language plpgsql
  security definer
  set search_path = pg_catalog, public, pg_temp
  set row_security = off
  as \$\$
  begin
    perform 'ticketing-lineage-2026082305';
    return new;
  end
  \$\$;

  create or replace function public.ticketing_append_service_transaction(
    p_actor_employee_id uuid,
    p_booking_id uuid,
    p_idempotency_key text,
    p_entry jsonb
  )
  returns jsonb
  language sql
  security definer
  set search_path = pg_catalog, public, pg_temp
  set row_security = off
  as \$\$
    select jsonb_build_object(
      'futureSentinel', 'ticketing-append-2026082305'
    )
  \$\$;

  create or replace function public.ticketing_mark_service_transaction_paid(
    p_actor_employee_id uuid,
    p_booking_id uuid,
    p_transaction_id uuid,
    p_idempotency_key text,
    p_payment jsonb
  )
  returns jsonb
  language sql
  security definer
  set search_path = pg_catalog, public, pg_temp
  set row_security = off
  as \$\$
    select jsonb_build_object(
      'futureSentinel', 'ticketing-payment-2026082305'
    )
  \$\$;

  commit;
" >/dev/null
future_2305_fingerprint="$(ticketing_schema_fingerprint)"
future_sentinel_count="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select count(*)
  from unnest(array[
    'public.ticketing_schema_status()'::regprocedure,
    'public.ticketing_enrich_service_business_dates_2026082304(uuid,jsonb)'::regprocedure,
    'public.validate_ticket_service_transaction_lineage_2026082304()'::regprocedure,
    'public.ticketing_append_service_transaction(uuid,uuid,text,jsonb)'::regprocedure,
    'public.ticketing_mark_service_transaction_paid(uuid,uuid,uuid,text,jsonb)'::regprocedure
  ]) as routines(routine_oid)
  where position('2026082305' in pg_get_functiondef(routine_oid)) > 0
")"
if [[ "$future_sentinel_count" != "5" ]]; then
  echo "Future Ticketing sentinel routine definitions were not installed"
  exit 1
fi

assert_forward_migration_replay_blocked "$immutable_replay_lineage_migration"
post_future_2304_fingerprint="$(ticketing_schema_fingerprint)"
if [[ "$post_future_2304_fingerprint" != "$future_2305_fingerprint" ]]; then
  echo "Blocked 2304 replay changed future Ticketing schema state"
  exit 1
fi

# Restore the disposable database to the actual 2304 definitions before the
# service behavior and concurrency assertions run.
psql "$database_url" -v ON_ERROR_STOP=1 -c "
  update public.portal_schema_versions
  set version = 2026082304
  where component = 'ticketing'
" >/dev/null
psql "$database_url" -v ON_ERROR_STOP=1 -f "$immutable_replay_lineage_migration"
restored_2304_fingerprint="$(ticketing_schema_fingerprint)"
if [[ "$restored_2304_fingerprint" != "$post_2304_fingerprint" ]]; then
  echo "Restoring 2304 after the future-version guard test changed semantic schema state"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$service_transaction_assertions"

service_race_facts="$(psql "$database_url" -Atq -F '|' -v ON_ERROR_STOP=1 -c "
  select booking.id, root.id, booking.version, root.version
  from public.ticket_bookings booking
  join public.ticket_transactions root
    on root.booking_id = booking.id
    and root.service_type = 'TK'
    and root.parent_transaction_id is null
  where booking.normalized_pnr = 'SVC-C1'
")"
IFS='|' read -r service_race_booking_id service_race_root_transaction_id \
  service_race_booking_version service_race_root_version \
  <<< "$service_race_facts"

if [[ -z "$service_race_booking_id" || -z "$service_race_root_transaction_id" ]]; then
  echo "DC/R-ER optimistic-race fixture was not found"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  select public.ticketing_append_service_transaction(
    '40000000-0000-0000-0000-000000000001',
    '$service_race_booking_id',
    'service-race-winner',
    jsonb_build_object(
      'expectedBookingVersion', $service_race_booking_version,
      'expectedRootTransactionVersion', $service_race_root_version,
      'serviceType', 'DC',
      'bookingDate', '2026-08-24',
      'issuedAt', '2026-08-24',
      'paymentStatus', 'unpaid',
      'paidAt', null,
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT',
          'quantity', 1,
          'unitSupplierCost', 5,
          'unitSalePrice', 15
        )
      )
    )
  )
" >/dev/null &
service_race_winner_pid=$!

service_race_pause_seen=false
for _attempt in {1..100}; do
  service_race_pause_count="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    select count(*)
    from pg_stat_activity
    where datname = current_database()
      and state = 'active'
      and wait_event = 'PgSleep'
      and query like '%service-race-winner%'
  ")"
  if [[ "$service_race_pause_count" -gt 0 ]]; then
    service_race_pause_seen=true
    break
  fi
  sleep 0.05
done

if [[ "$service_race_pause_seen" != true ]]; then
  wait "$service_race_winner_pid" || true
  echo "DC/R-ER optimistic-race pause was not observable"
  exit 1
fi

service_race_loser_output=""
if service_race_loser_output="$(psql "$database_url" -v ON_ERROR_STOP=1 -c "
  select public.ticketing_append_service_transaction(
    '40000000-0000-0000-0000-000000000001',
    '$service_race_booking_id',
    'service-race-loser',
    jsonb_build_object(
      'expectedBookingVersion', $service_race_booking_version,
      'expectedRootTransactionVersion', $service_race_root_version,
      'serviceType', 'DC',
      'bookingDate', '2026-08-25',
      'issuedAt', '2026-08-25',
      'paymentStatus', 'unpaid',
      'paidAt', null,
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT',
          'quantity', 1,
          'unitSupplierCost', 6,
          'unitSalePrice', 16
        )
      )
    )
  )
" 2>&1)"; then
  wait "$service_race_winner_pid" || true
  echo "Both same-version DC/R-ER race contenders committed"
  exit 1
fi

if [[ "$service_race_loser_output" != *"TICKETING_VERSION_CONFLICT"* ]]; then
  wait "$service_race_winner_pid" || true
  echo "DC/R-ER race loser did not return the version-conflict hint"
  exit 1
fi

wait "$service_race_winner_pid"

service_race_result="$(psql "$database_url" -Atq -F '|' -v ON_ERROR_STOP=1 -c "
  select
    booking.version,
    root.version,
    (select count(*)
      from public.ticket_transactions child
      where child.booking_id = booking.id
        and child.parent_transaction_id = root.id),
    (select count(*)
      from public.ticket_audit_events audit
      where audit.booking_id = booking.id
        and audit.action = 'append_service_transaction'),
    (select count(*)
      from public.ticket_idempotency_keys key_row
      where key_row.action_name = 'ticketing.append_service_transaction.v1'
        and key_row.idempotency_key = 'service-race-winner'),
    (select count(*)
      from public.ticket_idempotency_keys key_row
      where key_row.action_name = 'ticketing.append_service_transaction.v1'
        and key_row.idempotency_key = 'service-race-loser'),
    (select count(*)
      from public.commission_source_events source_event
      join public.ticket_transactions child
        on child.id = source_event.source_record_id
      where child.booking_id = booking.id
        and source_event.event_type = 'ticket_date_changed')
  from public.ticket_bookings booking
  join public.ticket_transactions root on root.id = '$service_race_root_transaction_id'
  where booking.id = '$service_race_booking_id'
")"
service_race_expected="$((service_race_booking_version + 1))|$service_race_root_version|1|1|1|0|1"
if [[ "$service_race_result" != "$service_race_expected" ]]; then
  echo "DC/R-ER optimistic race left incorrect root/child/event/retry state"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  drop trigger ticketing_test_pause_service_race on public.ticket_audit_events;
  drop function public.ticketing_test_pause_service_race()
" >/dev/null

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  update public.ticket_transactions
  set operational_status = 'issued',
      issued_at = '2026-08-24T00:00:00Z'
  where id = '8d000000-0000-0000-0000-000000000001'
" >/dev/null &
direct_lineage_winner_pid=$!

direct_lineage_pause_seen=false
for _attempt in {1..100}; do
  direct_lineage_pause_count="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    select count(*)
    from pg_stat_activity
    where datname = current_database()
      and state = 'active'
      and wait_event = 'PgSleep'
      and query like '%8d000000-0000-0000-0000-000000000001%'
  ")"
  if [[ "$direct_lineage_pause_count" -gt 0 ]]; then
    direct_lineage_pause_seen=true
    break
  fi
  sleep 0.05
done

if [[ "$direct_lineage_pause_seen" != true ]]; then
  wait "$direct_lineage_winner_pid" || true
  echo "Direct R-ER lineage-race pause was not observable"
  exit 1
fi

if psql "$database_url" -v ON_ERROR_STOP=1 -c "
  update public.ticket_transactions
  set operational_status = 'issued',
      issued_at = '2026-08-24T00:00:00Z'
  where id = '8d000000-0000-0000-0000-000000000002'
" >/dev/null 2>&1; then
  wait "$direct_lineage_winner_pid" || true
  echo "Concurrent direct writes created two issued R-ER successors"
  exit 1
fi

wait "$direct_lineage_winner_pid"

direct_lineage_result="$(psql "$database_url" -Atq -F '|' -v ON_ERROR_STOP=1 -c "
  select
    (select operational_status
      from public.ticket_transactions
      where id = '8d000000-0000-0000-0000-000000000001'),
    (select operational_status
      from public.ticket_transactions
      where id = '8d000000-0000-0000-0000-000000000002'),
    (select count(*)
      from public.ticket_transactions
      where service_type = 'R-ER'
        and operational_status = 'issued'
        and supersedes_transaction_id = (
          select parent_transaction_id
          from public.ticket_transactions
          where id = '8d000000-0000-0000-0000-000000000001'
        ))
")"
if [[ "$direct_lineage_result" != "issued|draft|1" ]]; then
  echo "Direct R-ER lineage race did not preserve one issued successor"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  drop trigger ticketing_test_pause_direct_lineage_race on public.ticket_transactions;
  drop function public.ticketing_test_pause_direct_lineage_race()
" >/dev/null

# Attribution depends on the Low Fare capability immediately before it. A
# skipped-predecessor attempt must fail before changing any schema object or
# capability metadata.
pre_2401_attribution_fingerprint="$(ticketing_schema_fingerprint)"
skipped_predecessor_output=""
if skipped_predecessor_output="$(
  psql "$database_url" -v ON_ERROR_STOP=1 -f "$attribution_migration" 2>&1
)"; then
  echo "Ticket attribution migration skipped its required Low Fare predecessor"
  exit 1
fi
if [[ "$skipped_predecessor_output" != *"TICKETING_SCHEMA_NOT_READY"* ]]; then
  echo "Skipped Ticket attribution predecessor returned the wrong error"
  echo "$skipped_predecessor_output"
  exit 1
fi
if [[ "$(ticketing_schema_fingerprint)" != "$pre_2401_attribution_fingerprint" ]]; then
  echo "Rejected pre-2401 Ticket attribution migration changed schema state"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$low_fare_migration"
low_fare_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
low_fare_first_fingerprint="$(ticketing_schema_fingerprint)"

# Same-version reruns are semantic no-ops and preserve capability chronology.
psql "$database_url" -v ON_ERROR_STOP=1 -f "$low_fare_migration"
low_fare_second_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
low_fare_second_fingerprint="$(ticketing_schema_fingerprint)"
if [[ "$low_fare_first_applied_at" != "$low_fare_second_applied_at" ]]; then
  echo "Idempotent Low Fare rerun changed the Ticketing capability application timestamp"
  exit 1
fi
if [[ "$low_fare_first_fingerprint" != "$low_fare_second_fingerprint" ]]; then
  echo "Idempotent Low Fare rerun changed semantic Ticketing schema state"
  exit 1
fi

post_2401_fingerprint="$low_fare_second_fingerprint"

# Authorised completion depends on Ticket attribution capability 2402. Applying
# 2403 directly on top of 2401 must reject before changing schema or capability
# metadata, otherwise the omitted attribution migration could be skipped and
# permanently blocked by the forward ratchet.
pre_2402_admin_completion_fingerprint="$(ticketing_schema_fingerprint)"
skipped_admin_completion_predecessor_output=""
if skipped_admin_completion_predecessor_output="$(
  psql "$database_url" -v ON_ERROR_STOP=1 -f "$admin_completion_migration" 2>&1
)"; then
  echo "Authorised completion migration skipped its required Ticket attribution predecessor"
  exit 1
fi
if [[ "$skipped_admin_completion_predecessor_output" != *"Ticketing capability 2026082402 is required before authorised completion capability 2026082403"* ]] \
  || [[ "$skipped_admin_completion_predecessor_output" != *"TICKETING_SCHEMA_NOT_READY"* ]]; then
  echo "Skipped authorised completion predecessor returned the wrong error"
  echo "$skipped_admin_completion_predecessor_output"
  exit 1
fi
if [[ "$(ticketing_schema_fingerprint)" != "$pre_2402_admin_completion_fingerprint" ]]; then
  echo "Rejected pre-2402 authorised completion migration changed schema state"
  exit 1
fi

# Once 2401 is installed, every older Ticketing migration must stop at its
# immediate forward guard without changing relations, routines, policies,
# grants, triggers, views, or capability metadata.
post_2401_historical_migrations=(
  "$migration"
  "$quick_entry_migration"
  "$completion_migration"
  "$service_transaction_migration"
  "$rer_chronology_migration"
  "$service_response_dates_migration"
  "$immutable_replay_lineage_migration"
)
for historical_migration in "${post_2401_historical_migrations[@]}"; do
  assert_forward_migration_replay_blocked "$historical_migration"
  post_historical_fingerprint="$(ticketing_schema_fingerprint)"
  if [[ "$post_historical_fingerprint" != "$post_2401_fingerprint" ]]; then
    echo "Blocked historical Ticketing replay changed capability 2401 schema state: $historical_migration"
    exit 1
  fi
done

# Simulate a later capability replacing every callable identity owned by 2401.
# Replaying 2401 must reject before the first CREATE/ALTER and preserve the
# future definitions, active trigger attachment, grants, and version fact.
psql "$database_url" -v ON_ERROR_STOP=1 -c "
  begin;

  update public.portal_schema_versions
  set version = 2026082402
  where component = 'ticketing';

  create or replace function public.ticketing_schema_status()
  returns jsonb
  language sql
  stable
  security definer
  set search_path = pg_catalog, public, pg_temp
  as \$\$
    select jsonb_build_object('futureSentinel', 'ticketing-status-2026082402')
  \$\$;

  create or replace function public.ticketing_append_fare_adjustment(
    p_actor_employee_id uuid,
    p_booking_id uuid,
    p_idempotency_key text,
    p_entry jsonb
  )
  returns jsonb
  language sql
  security definer
  set search_path = pg_catalog, public, pg_temp
  set row_security = off
  as \$\$
    select jsonb_build_object('futureSentinel', 'ticketing-low-fare-2026082402')
  \$\$;

  create or replace function public.validate_ticket_fare_adjustment_lineage_2026082401()
  returns trigger
  language plpgsql
  security definer
  set search_path = pg_catalog, public, pg_temp
  set row_security = off
  as \$\$
  begin
    perform 'ticketing-low-fare-lineage-2026082402';
    return new;
  end
  \$\$;

  create or replace function public.serialize_ticket_package_scope_2026082401()
  returns trigger
  language plpgsql
  security definer
  set search_path = pg_catalog, public, pg_temp
  set row_security = off
  as \$\$
  begin
    perform 'ticketing-package-scope-2026082402';
    return case when tg_op = 'DELETE' then old else new end;
  end
  \$\$;

  alter view public.ticket_fare_adjustment_current
    set (security_invoker = false);
  grant select on public.ticket_fare_adjustment_current to authenticated;

  commit;
" >/dev/null

future_2402_fingerprint="$(ticketing_schema_fingerprint)"
future_2402_sentinel_count="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select count(*)
  from unnest(array[
    'public.ticketing_schema_status()'::regprocedure,
    'public.ticketing_append_fare_adjustment(uuid,uuid,text,jsonb)'::regprocedure,
    'public.validate_ticket_fare_adjustment_lineage_2026082401()'::regprocedure,
    'public.serialize_ticket_package_scope_2026082401()'::regprocedure
  ]) as routines(routine_oid)
  where position('2026082402' in pg_get_functiondef(routine_oid)) > 0
")"
if [[ "$future_2402_sentinel_count" != "4" ]]; then
  echo "Future Low Fare sentinel routine definitions were not installed"
  exit 1
fi
future_2402_view_state="$(psql "$database_url" -Atq -F '|' -v ON_ERROR_STOP=1 -c "
  select
    coalesce(class_row.reloptions::text, ''),
    has_table_privilege(
      'authenticated', 'public.ticket_fare_adjustment_current', 'SELECT'
    )
  from pg_class class_row
  where class_row.oid = 'public.ticket_fare_adjustment_current'::regclass
")"
if [[ "$future_2402_view_state" != "{security_invoker=false}|t" ]]; then
  echo "Future Low Fare view sentinel state was not installed"
  exit 1
fi

assert_forward_migration_replay_blocked "$low_fare_migration"
post_future_2401_fingerprint="$(ticketing_schema_fingerprint)"
if [[ "$post_future_2401_fingerprint" != "$future_2402_fingerprint" ]]; then
  echo "Blocked Low Fare replay changed future Ticketing schema state"
  exit 1
fi

# Restore the disposable database to the actual 2401 definitions before its
# behavior, rollback, lower-write, and concurrency assertions run.
psql "$database_url" -v ON_ERROR_STOP=1 -c "
  update public.portal_schema_versions
  set version = 2026082401
  where component = 'ticketing'
" >/dev/null
psql "$database_url" -v ON_ERROR_STOP=1 -f "$low_fare_migration"
restored_2401_fingerprint="$(ticketing_schema_fingerprint)"
if [[ "$restored_2401_fingerprint" != "$post_2401_fingerprint" ]]; then
  echo "Restoring Low Fare 2401 after the future guard test changed semantic schema state"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$low_fare_assertions"

low_fare_race_facts="$(psql "$database_url" -Atq -F '|' -v ON_ERROR_STOP=1 -c "
  select booking.id, root.id, booking.version, root.version
  from public.ticket_bookings booking
  join public.ticket_transactions root
    on root.booking_id = booking.id
    and root.service_type = 'TK'
    and root.parent_transaction_id is null
  where booking.normalized_pnr = 'LOW-C1'
")"
IFS='|' read -r low_fare_race_booking_id low_fare_race_root_id \
  low_fare_race_booking_version low_fare_race_root_version \
  <<< "$low_fare_race_facts"

if [[ -z "$low_fare_race_booking_id" || -z "$low_fare_race_root_id" ]]; then
  echo "Low Fare optimistic-race fixture was not found"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  select public.ticketing_append_fare_adjustment(
    '40000000-0000-0000-0000-000000000003',
    '$low_fare_race_booking_id',
    'low-fare-race-winner',
    jsonb_build_object(
      'expectedBookingVersion', $low_fare_race_booking_version,
      'expectedRootTransactionVersion', $low_fare_race_root_version,
      'expectedPreviousAdjustmentId', null,
      'newFareGbp', 90,
      'effectiveOn', '2026-08-25',
      'currency', 'GBP',
      'notes', null
    )
  )
" >/dev/null &
low_fare_race_winner_pid=$!

low_fare_race_pause_seen=false
for _attempt in {1..100}; do
  low_fare_race_pause_count="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    select count(*)
    from pg_stat_activity
    where datname = current_database()
      and state = 'active'
      and wait_event = 'PgSleep'
      and query like '%low-fare-race-winner%'
  ")"
  if [[ "$low_fare_race_pause_count" -gt 0 ]]; then
    low_fare_race_pause_seen=true
    break
  fi
  sleep 0.05
done

if [[ "$low_fare_race_pause_seen" != true ]]; then
  wait "$low_fare_race_winner_pid" || true
  echo "Low Fare optimistic-race pause was not observable"
  exit 1
fi

package_phantom_output=""
if package_phantom_output="$(psql "$database_url" -v ON_ERROR_STOP=1 -c "
  set lock_timeout = '300ms';
  insert into public.ticket_package_links (
    booking_id,
    package_id,
    reservation_id,
    match_status,
    resolution_method,
    matched_pnr
  ) values (
    '$low_fare_race_booking_id',
    '60000000-0000-0000-0000-000000000031',
    '70000000-0000-0000-0000-000000000031',
    'matched',
    'automatic',
    'LOW-C1'
  )
" 2>&1)"; then
  wait "$low_fare_race_winner_pid" || true
  echo "Concurrent package-link insert bypassed the Low Fare booking-scope lock"
  exit 1
fi

if [[ "$package_phantom_output" != *"lock timeout"* ]]; then
  wait "$low_fare_race_winner_pid" || true
  echo "Concurrent package-link insert failed for a reason other than booking-scope serialization"
  echo "$package_phantom_output"
  exit 1
fi

low_fare_race_loser_output=""
if low_fare_race_loser_output="$(psql "$database_url" -v ON_ERROR_STOP=1 -c "
  select public.ticketing_append_fare_adjustment(
    '40000000-0000-0000-0000-000000000001',
    '$low_fare_race_booking_id',
    'low-fare-race-loser',
    jsonb_build_object(
      'expectedBookingVersion', $low_fare_race_booking_version,
      'expectedRootTransactionVersion', $low_fare_race_root_version,
      'expectedPreviousAdjustmentId', null,
      'newFareGbp', 80,
      'effectiveOn', '2026-08-25',
      'currency', 'GBP',
      'notes', null
    )
  )
" 2>&1)"; then
  wait "$low_fare_race_winner_pid" || true
  echo "Both same-version Low Fare race contenders committed"
  exit 1
fi

if [[ "$low_fare_race_loser_output" != *"TICKETING_VERSION_CONFLICT"* ]]; then
  wait "$low_fare_race_winner_pid" || true
  echo "Low Fare race loser did not return the version-conflict hint"
  exit 1
fi

wait "$low_fare_race_winner_pid"

low_fare_race_result="$(psql "$database_url" -Atq -F '|' -v ON_ERROR_STOP=1 -c "
  select
    booking.version,
    root.version,
    (select count(*)
      from public.ticket_fare_adjustments adjustment
      where adjustment.booking_id = booking.id),
    (select count(*)
      from public.ticket_audit_events audit
      where audit.booking_id = booking.id
        and audit.action = 'append_fare_adjustment'),
    (select count(*)
      from public.ticket_idempotency_keys key_row
      where key_row.action_name = 'ticketing.append_fare_adjustment.v1'
        and key_row.idempotency_key = 'low-fare-race-winner'),
    (select count(*)
      from public.ticket_idempotency_keys key_row
      where key_row.action_name = 'ticketing.append_fare_adjustment.v1'
        and key_row.idempotency_key = 'low-fare-race-loser'),
    (select count(*)
      from public.commission_source_events source_event
      join public.ticket_fare_adjustments adjustment
        on adjustment.id = source_event.source_record_id
      where adjustment.booking_id = booking.id
        and source_event.event_type = 'ticket_low_fare_adjusted'),
    (select count(*)
      from public.ticket_package_links link
      where link.booking_id = booking.id)
  from public.ticket_bookings booking
  join public.ticket_transactions root on root.id = '$low_fare_race_root_id'
  where booking.id = '$low_fare_race_booking_id'
")"
low_fare_race_expected="$((low_fare_race_booking_version + 1))|$low_fare_race_root_version|1|1|1|0|1|0"
if [[ "$low_fare_race_result" != "$low_fare_race_expected" ]]; then
  echo "Low Fare race left incorrect lineage/event/retry/package state"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  drop trigger ticketing_test_pause_low_fare_race on public.ticket_audit_events;
  drop function public.ticketing_test_pause_low_fare_race()
" >/dev/null

# Historical ownership remains valid even when the employee was deactivated
# after doing the work. The migration must preserve that attribution while all
# new-write RPCs continue to require active recipients.
inactive_backfill_booking_id="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select booking.id
  from public.ticket_bookings booking
  where booking.owner_employee_id = '40000000-0000-0000-0000-000000000001'
  order by booking.created_at, booking.id
  limit 1
")"
if [[ -z "$inactive_backfill_booking_id" ]]; then
  echo "Ticket attribution inactive-owner backfill fixture was not found"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -c "
  update public.employees
  set is_active = false
  where id = '40000000-0000-0000-0000-000000000001'
" >/dev/null

# Hold a supported legacy Quick TK write open after it has inserted its booking,
# transaction, and issued source event. The migration must wait at its early
# write lock, then include the committed row in both history and source backfill.
psql "$database_url" -v ON_ERROR_STOP=1 -c "
  begin;
  select public.ticketing_create_quick_tk(
    '40000000-0000-0000-0000-000000000002',
    'attribution-migration-race-create',
    jsonb_build_object(
      'customerName', 'Attribution Migration Race',
      'pnr', 'ATTR-RACE1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-24',
      'timeLimitAt', null,
      'issuedAt', '2026-08-24',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT',
          'quantity', 1,
          'unitSupplierCost', 100
        )
      )
    )
  );
  select pg_sleep(2);
  commit;
" >/dev/null &
attribution_race_writer_pid=$!

attribution_race_sleep_seen=false
for _attempt in {1..100}; do
  attribution_race_sleep_count="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    select count(*)
    from pg_stat_activity
    where datname = current_database()
      and state = 'active'
      and wait_event = 'PgSleep'
      and query like '%attribution-migration-race-create%'
  ")"
  if [[ "$attribution_race_sleep_count" -gt 0 ]]; then
    attribution_race_sleep_seen=true
    break
  fi
  sleep 0.05
done
if [[ "$attribution_race_sleep_seen" != true ]]; then
  wait "$attribution_race_writer_pid" || true
  echo "Ticket attribution migration race writer pause was not observable"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$attribution_migration" >/dev/null &
attribution_race_migration_pid=$!

attribution_write_lock_seen=false
for _attempt in {1..100}; do
  attribution_write_lock_count="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    select count(*)
    from pg_stat_activity
    where datname = current_database()
      and wait_event_type = 'Lock'
      and query like '%public.ticket_bookings%'
      and query like '%share row exclusive mode%'
  ")"
  if [[ "$attribution_write_lock_count" -gt 0 ]]; then
    attribution_write_lock_seen=true
    break
  fi
  sleep 0.05
done
if [[ "$attribution_write_lock_seen" != true ]]; then
  wait "$attribution_race_writer_pid" || true
  wait "$attribution_race_migration_pid" || true
  echo "Ticket attribution migration did not wait for the in-flight writer"
  exit 1
fi

wait "$attribution_race_writer_pid"
wait "$attribution_race_migration_pid"

attribution_race_result="$(psql "$database_url" -Atq -F '|' -v ON_ERROR_STOP=1 -c "
  select
    attribution.attribution_version,
    attribution.primary_employee_id,
    source_event.employee_id,
    source_event.variables ->> 'primary_responsible_employee_id',
    source_event.variables ->> 'issued_ticket_target_units',
    source_event.variables ->> 'assistant_target_units'
  from public.ticket_bookings booking
  join public.ticket_booking_current_attribution attribution
    on attribution.booking_id = booking.id
  join public.ticket_transactions root
    on root.id = attribution.root_transaction_id
  join lateral (
    select source_event.*
    from public.commission_source_events source_event
    where source_event.source_record_id = root.id
      and source_event.source_fact_key =
        'transaction:' || root.id::text || ':issued'
    order by source_event.event_version desc
    limit 1
  ) source_event on true
  where booking.normalized_pnr = 'ATTR-RACE1'
")"
if [[ "$attribution_race_result" != "1|40000000-0000-0000-0000-000000000002|40000000-0000-0000-0000-000000000002|40000000-0000-0000-0000-000000000002|1|0" ]]; then
  echo "In-flight Quick TK escaped attribution migration backfill"
  exit 1
fi

attribution_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
attribution_first_fingerprint="$(ticketing_schema_fingerprint)"

inactive_backfill_result="$(psql "$database_url" -Atq -F '|' -v ON_ERROR_STOP=1 -c "
  select
    attribution.attribution_version,
    attribution.primary_employee_id,
    attribution.entered_by_employee_id,
    attribution.change_kind
  from public.ticket_booking_attribution_versions attribution
  where attribution.booking_id = '$inactive_backfill_booking_id'
")"
if [[ "$inactive_backfill_result" != "1|40000000-0000-0000-0000-000000000001|40000000-0000-0000-0000-000000000001|migration" ]]; then
  echo "Ticket attribution did not preserve the inactive historical owner"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  update public.employees
  set is_active = true
  where id = '40000000-0000-0000-0000-000000000001'
" >/dev/null

# Same-version reruns append no duplicate history/source facts and preserve the
# capability application timestamp and semantic schema fingerprint.
attribution_history_count_before="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select count(*) from public.ticket_booking_attribution_versions")"
attribution_source_count_before="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select count(*) from public.commission_source_events")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$attribution_migration"
attribution_second_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
attribution_second_fingerprint="$(ticketing_schema_fingerprint)"
if [[ "$attribution_first_applied_at" != "$attribution_second_applied_at" ]]; then
  echo "Idempotent Ticket attribution rerun changed the capability timestamp"
  exit 1
fi
if [[ "$attribution_first_fingerprint" != "$attribution_second_fingerprint" ]]; then
  echo "Idempotent Ticket attribution rerun changed semantic schema state"
  exit 1
fi
if [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select count(*) from public.ticket_booking_attribution_versions")" != "$attribution_history_count_before" ]] \
  || [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select count(*) from public.commission_source_events")" != "$attribution_source_count_before" ]]; then
  echo "Idempotent Ticket attribution rerun duplicated history or source events"
  exit 1
fi

post_2402_fingerprint="$attribution_second_fingerprint"
post_2402_historical_migrations=(
  "$migration"
  "$quick_entry_migration"
  "$completion_migration"
  "$service_transaction_migration"
  "$rer_chronology_migration"
  "$service_response_dates_migration"
  "$immutable_replay_lineage_migration"
  "$low_fare_migration"
)
for historical_migration in "${post_2402_historical_migrations[@]}"; do
  assert_forward_migration_replay_blocked "$historical_migration"
  if [[ "$(ticketing_schema_fingerprint)" != "$post_2402_fingerprint" ]]; then
    echo "Blocked historical replay changed capability 2402 schema state: $historical_migration"
    exit 1
  fi
done

# A future version must block 2402 before any CREATE/ALTER statement.
psql "$database_url" -v ON_ERROR_STOP=1 -c "
  update public.portal_schema_versions
  set version = 2026082403
  where component = 'ticketing'
" >/dev/null
future_2403_fingerprint="$(ticketing_schema_fingerprint)"
assert_forward_migration_replay_blocked "$attribution_migration"
if [[ "$(ticketing_schema_fingerprint)" != "$future_2403_fingerprint" ]]; then
  echo "Blocked Ticket attribution replay changed future schema state"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  update public.portal_schema_versions
  set version = 2026082402
  where component = 'ticketing'
" >/dev/null
psql "$database_url" -v ON_ERROR_STOP=1 -f "$attribution_migration"
if [[ "$(ticketing_schema_fingerprint)" != "$post_2402_fingerprint" ]]; then
  echo "Restoring Ticket attribution 2402 changed semantic schema state"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$attribution_assertions"

# Both attribution RPCs must retain SHARE locks on the actor and selected
# recipients until commit. Pause after those locks are acquired, then prove a
# recipient deactivation and an administrator demotion wait rather than racing
# a validated write.
psql "$database_url" -v ON_ERROR_STOP=1 -c "
  create or replace function public.ticketing_test_pause_attribution_employee_lock_race()
  returns trigger
  language plpgsql
  as \$\$
  begin
    if new.reason in (
      'Quick employee lock race',
      'Correction employee role lock race'
    ) then
      perform pg_sleep(2);
    end if;
    return new;
  end
  \$\$;

  create trigger ticketing_test_pause_attribution_employee_lock_race
  before insert on public.ticket_booking_attribution_versions
  for each row execute function public.ticketing_test_pause_attribution_employee_lock_race()
" >/dev/null

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  select public.ticketing_create_quick_tk_attributed(
    '4a000000-0000-0000-0000-000000000001',
    'attribution-employee-lock-quick',
    jsonb_build_object(
      'customerName', 'Attribution Employee Lock Race',
      'pnr', 'ATTR-LKQ',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-24',
      'timeLimitAt', null,
      'issuedAt', '2026-08-24',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT',
          'quantity', 1,
          'unitSupplierCost', 100
        )
      ),
      'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000002',
      'assistantEmployeeIds', jsonb_build_array(
        '4a000000-0000-0000-0000-000000000003'
      ),
      'attributionReason', 'Quick employee lock race'
    )
  )
" >/dev/null &
attribution_quick_employee_lock_pid=$!

attribution_quick_pause_seen=false
for _attempt in {1..100}; do
  attribution_quick_pause_count="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    select count(*)
    from pg_stat_activity
    where datname = current_database()
      and state = 'active'
      and wait_event = 'PgSleep'
      and query like '%attribution-employee-lock-quick%'
  ")"
  if [[ "$attribution_quick_pause_count" -gt 0 ]]; then
    attribution_quick_pause_seen=true
    break
  fi
  sleep 0.05
done
if [[ "$attribution_quick_pause_seen" != true ]]; then
  wait "$attribution_quick_employee_lock_pid" || true
  echo "Attributed Quick employee-lock race pause was not observable"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  /* attribution-quick-recipient-deactivation */
  update public.employees
  set is_active = false
  where id = '4a000000-0000-0000-0000-000000000003'
" >/dev/null &
attribution_quick_deactivation_pid=$!

attribution_quick_deactivation_wait_seen=false
for _attempt in {1..100}; do
  attribution_quick_deactivation_wait_count="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    select count(*)
    from pg_stat_activity
    where datname = current_database()
      and wait_event_type = 'Lock'
      and query like '%attribution-quick-recipient-deactivation%'
  ")"
  if [[ "$attribution_quick_deactivation_wait_count" -gt 0 ]]; then
    attribution_quick_deactivation_wait_seen=true
    break
  fi
  sleep 0.05
done
if [[ "$attribution_quick_deactivation_wait_seen" != true ]]; then
  wait "$attribution_quick_employee_lock_pid" || true
  wait "$attribution_quick_deactivation_pid" || true
  echo "Attributed Quick did not retain the selected-recipient SHARE lock"
  exit 1
fi

wait "$attribution_quick_employee_lock_pid"
wait "$attribution_quick_deactivation_pid"

attribution_quick_employee_lock_result="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select count(*)
  from public.ticket_bookings booking
  join public.ticket_booking_current_attribution attribution
    on attribution.booking_id = booking.id
  where booking.normalized_pnr = 'ATTR-LKQ'
    and attribution.attribution_version = 1
    and attribution.primary_employee_id =
      '4a000000-0000-0000-0000-000000000002'
    and attribution.entered_by_employee_id =
      '4a000000-0000-0000-0000-000000000001'
    and attribution.assistant_employee_ids = array[
      '4a000000-0000-0000-0000-000000000003'::uuid
    ]
    and not (
      select employee.is_active
      from public.employees employee
      where employee.id = '4a000000-0000-0000-0000-000000000003'
    )
")"
if [[ "$attribution_quick_employee_lock_result" != "1" ]]; then
  echo "Attributed Quick employee-lock race committed incorrect state"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  update public.employees
  set is_active = true
  where id = '4a000000-0000-0000-0000-000000000003'
" >/dev/null

IFS='|' read -r attribution_lock_booking_id attribution_lock_booking_version \
  <<< "$(psql "$database_url" -Atq -F '|' -v ON_ERROR_STOP=1 -c "
    select booking.id, booking.version
    from public.ticket_bookings booking
    where booking.normalized_pnr = 'ATTR-LKQ'
  ")"

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  select public.ticketing_correct_booking_attribution(
    '4a000000-0000-0000-0000-000000000001',
    '$attribution_lock_booking_id',
    $attribution_lock_booking_version,
    'attribution-employee-role-lock-correction',
    jsonb_build_object(
      'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000004',
      'assistantEmployeeIds', jsonb_build_array(
        '4a000000-0000-0000-0000-000000000005'
      ),
      'reason', 'Correction employee role lock race'
    )
  )
" >/dev/null &
attribution_correction_employee_lock_pid=$!

attribution_correction_pause_seen=false
for _attempt in {1..100}; do
  attribution_correction_pause_count="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    select count(*)
    from pg_stat_activity
    where datname = current_database()
      and state = 'active'
      and wait_event = 'PgSleep'
      and query like '%attribution-employee-role-lock-correction%'
  ")"
  if [[ "$attribution_correction_pause_count" -gt 0 ]]; then
    attribution_correction_pause_seen=true
    break
  fi
  sleep 0.05
done
if [[ "$attribution_correction_pause_seen" != true ]]; then
  wait "$attribution_correction_employee_lock_pid" || true
  echo "Attribution correction employee-lock race pause was not observable"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  /* attribution-correction-actor-demotion */
  update public.employees
  set role_id = (
    select role.id
    from public.roles role
    where lower(btrim(role.name)) = 'manager'
    limit 1
  )
  where id = '4a000000-0000-0000-0000-000000000001'
" >/dev/null &
attribution_correction_demotion_pid=$!

attribution_correction_demotion_wait_seen=false
for _attempt in {1..100}; do
  attribution_correction_demotion_wait_count="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    select count(*)
    from pg_stat_activity
    where datname = current_database()
      and wait_event_type = 'Lock'
      and query like '%attribution-correction-actor-demotion%'
  ")"
  if [[ "$attribution_correction_demotion_wait_count" -gt 0 ]]; then
    attribution_correction_demotion_wait_seen=true
    break
  fi
  sleep 0.05
done
if [[ "$attribution_correction_demotion_wait_seen" != true ]]; then
  wait "$attribution_correction_employee_lock_pid" || true
  wait "$attribution_correction_demotion_pid" || true
  echo "Attribution correction did not retain the administrator-role SHARE lock"
  exit 1
fi

wait "$attribution_correction_employee_lock_pid"
wait "$attribution_correction_demotion_pid"

attribution_correction_employee_lock_result="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select count(*)
  from public.ticket_bookings booking
  join public.ticket_booking_current_attribution attribution
    on attribution.booking_id = booking.id
  join public.employees actor
    on actor.id = '4a000000-0000-0000-0000-000000000001'
  join public.roles role on role.id = actor.role_id
  where booking.id = '$attribution_lock_booking_id'
    and booking.version = $((attribution_lock_booking_version + 1))
    and attribution.attribution_version = 2
    and attribution.primary_employee_id =
      '4a000000-0000-0000-0000-000000000004'
    and attribution.changed_by_employee_id = actor.id
    and attribution.assistant_employee_ids = array[
      '4a000000-0000-0000-0000-000000000005'::uuid
    ]
    and lower(btrim(role.name)) = 'manager'
")"
if [[ "$attribution_correction_employee_lock_result" != "1" ]]; then
  echo "Attribution correction employee-lock race committed incorrect state"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  update public.employees
  set role_id = (
    select role.id
    from public.roles role
    where lower(btrim(role.name)) = 'admin'
    limit 1
  )
  where id = '4a000000-0000-0000-0000-000000000001';

  drop trigger ticketing_test_pause_attribution_employee_lock_race
    on public.ticket_booking_attribution_versions;
  drop function public.ticketing_test_pause_attribution_employee_lock_race();
" >/dev/null

# Prove a future marker committed while 2403 waits for its table lock is caught
# by the post-lock guard before any routine or trigger can be replaced.
psql "$database_url" -v ON_ERROR_STOP=1 -c "
  begin;
  lock table public.ticket_bookings in access exclusive mode;
  /* admin-completion-post-lock-guard-blocker */
  select pg_sleep(2);
  update public.portal_schema_versions
  set version = 2026082404
  where component = 'ticketing';
  commit;
" >/dev/null &
admin_completion_guard_blocker_pid=$!

admin_completion_guard_sleep_seen=false
for _attempt in {1..100}; do
  admin_completion_guard_sleep_count="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    select count(*)
    from pg_stat_activity
    where datname = current_database()
      and state = 'active'
      and wait_event = 'PgSleep'
      and query like '%admin-completion-post-lock-guard-blocker%'
  ")"
  if [[ "$admin_completion_guard_sleep_count" -gt 0 ]]; then
    admin_completion_guard_sleep_seen=true
    break
  fi
  sleep 0.05
done
if [[ "$admin_completion_guard_sleep_seen" != true ]]; then
  wait "$admin_completion_guard_blocker_pid" || true
  echo "Authorised completion post-lock guard blocker was not observable"
  exit 1
fi

admin_completion_guard_output=""
if admin_completion_guard_output="$(psql "$database_url" -v ON_ERROR_STOP=1 \
  -f "$admin_completion_migration" 2>&1)"; then
  wait "$admin_completion_guard_blocker_pid" || true
  echo "Authorised completion migration crossed a concurrently committed future marker"
  exit 1
fi
wait "$admin_completion_guard_blocker_pid"
if [[ "$admin_completion_guard_output" != *"TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED"* ]] \
  || [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select version from public.portal_schema_versions where component = 'ticketing'")" != "2026082404" ]] \
  || [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select pg_catalog.to_regprocedure('public.ticketing_complete_tk_details_authorized(uuid,uuid,text,jsonb)') is null")" != "t" ]]; then
  echo "Authorised completion post-lock guard race left incorrect schema state"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  update public.portal_schema_versions
  set version = 2026082402
  where component = 'ticketing'
" >/dev/null

pre_2403_capabilities="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select details -> 'capabilities'
  from public.portal_schema_versions
  where component = 'ticketing'
")"
pre_2403_capability_count="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select jsonb_array_length(details -> 'capabilities')
  from public.portal_schema_versions
  where component = 'ticketing'
")"

pre_2403_runtime_fingerprint="$(ticketing_schema_fingerprint)"
skipped_runtime_predecessor_output=""
if skipped_runtime_predecessor_output="$(
  psql "$database_url" -v ON_ERROR_STOP=1 -f "$runtime_readiness_migration" 2>&1
)"; then
  echo "Ticketing runtime readiness skipped its required authorised-completion predecessor"
  exit 1
fi
if [[ "$skipped_runtime_predecessor_output" != *"TICKETING_SCHEMA_NOT_READY"* ]] \
  || [[ "$(ticketing_schema_fingerprint)" != "$pre_2403_runtime_fingerprint" ]]; then
  echo "Rejected pre-2403 runtime readiness migration returned the wrong error or changed schema"
  exit 1
fi

# AC-UPG1 is deliberately completed and paid through the legacy owner RPC
# before 2403 so migration-time v2 sale/payment enrichment is exercised.
psql "$database_url" -v ON_ERROR_STOP=1 -f "$admin_completion_pre_upgrade"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$admin_completion_migration"
admin_completion_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
admin_completion_first_fingerprint="$(ticketing_schema_fingerprint)"
admin_completion_source_count_before_rerun="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select count(*) from public.commission_source_events")"

post_2403_predecessor_capabilities="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select coalesce(jsonb_agg(capability.value order by capability.ordinality), '[]'::jsonb)
  from public.portal_schema_versions schema_version
  cross join lateral jsonb_array_elements(schema_version.details -> 'capabilities')
    with ordinality as capability(value, ordinality)
  where schema_version.component = 'ticketing'
    and capability.value not in (
      to_jsonb('admin-on-behalf-tk-completion'::text),
      to_jsonb('reasoned-on-behalf-audit'::text),
      to_jsonb('root-completion-source-attribution'::text)
    )
")"
post_2403_capability_state="$(psql "$database_url" -Atq -F '|' -v ON_ERROR_STOP=1 -c "
  select
    jsonb_array_length(details -> 'capabilities'),
    (
      select count(*)
      from jsonb_array_elements_text(details -> 'capabilities') capability(value)
      where capability.value in (
        'admin-on-behalf-tk-completion',
        'reasoned-on-behalf-audit',
        'root-completion-source-attribution'
      )
    ),
    (
      select count(distinct capability.value)
      from jsonb_array_elements_text(details -> 'capabilities') capability(value)
      where capability.value in (
        'admin-on-behalf-tk-completion',
        'reasoned-on-behalf-audit',
        'root-completion-source-attribution'
      )
    )
  from public.portal_schema_versions
  where component = 'ticketing'
")"
if [[ "$post_2403_predecessor_capabilities" != "$pre_2403_capabilities" ]] \
  || [[ "$post_2403_capability_state" != "$((pre_2403_capability_count + 3))|3|3" ]]; then
  echo "Authorised completion capability marker dropped or invented predecessor capabilities"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$admin_completion_migration"
if [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")" != "$admin_completion_first_applied_at" ]] \
  || [[ "$(ticketing_schema_fingerprint)" != "$admin_completion_first_fingerprint" ]] \
  || [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select count(*) from public.commission_source_events")" != "$admin_completion_source_count_before_rerun" ]]; then
  echo "Idempotent authorised completion rerun changed schema or source history"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$admin_completion_assertions"

# Two admin-on-behalf calls with the same optimistic versions serialize on the
# booking; only the winner commits an audit/idempotency fact.
IFS='|' read -r admin_completion_race_booking_id admin_completion_race_booking_version \
  admin_completion_race_transaction_version \
  <<< "$(psql "$database_url" -Atq -F '|' -v ON_ERROR_STOP=1 -c "
    select booking.id, booking.version, root.version
    from public.ticket_bookings booking
    join public.ticket_transactions root
      on root.booking_id = booking.id
      and root.service_type = 'TK'
      and root.parent_transaction_id is null
    where booking.normalized_pnr = 'AC-RACE1'
  ")"

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  create or replace function public.ticketing_test_pause_admin_completion_race()
  returns trigger language plpgsql as \$\$
  begin
    if new.action = 'complete_tk_details_on_behalf'
      and new.reason = 'Admin completion optimistic race'
    then perform pg_sleep(2); end if;
    return new;
  end \$\$;
  create trigger ticketing_test_pause_admin_completion_race
  before insert on public.ticket_audit_events
  for each row execute function public.ticketing_test_pause_admin_completion_race();
" >/dev/null

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  select public.ticketing_complete_tk_details_authorized(
    '4a000000-0000-0000-0000-000000000001',
    '$admin_completion_race_booking_id',
    'admin-completion-race-winner',
    jsonb_build_object(
      'expectedBookingVersion', $admin_completion_race_booking_version,
      'expectedTransactionVersion', $admin_completion_race_transaction_version,
      'contactPhone', '+44 7000 240307', 'departureDate', '2026-12-02',
      'returnDate', null, 'paymentStatus', 'unpaid', 'paidAt', null,
      'fareSales', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', null)
      ),
      'passengers', '[]'::jsonb,
      'onBehalfReason', 'Admin completion optimistic race'
    )
  )
" >/dev/null &
admin_completion_race_winner_pid=$!

admin_completion_race_pause_seen=false
for _attempt in {1..100}; do
  if [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    select count(*) from pg_stat_activity
    where datname = current_database() and state = 'active'
      and wait_event = 'PgSleep'
      and query like '%admin-completion-race-winner%'
  ")" -gt 0 ]]; then
    admin_completion_race_pause_seen=true
    break
  fi
  sleep 0.05
done
if [[ "$admin_completion_race_pause_seen" != true ]]; then
  wait "$admin_completion_race_winner_pid" || true
  echo "Authorised completion optimistic race pause was not observable"
  exit 1
fi

admin_completion_race_loser_output=""
if admin_completion_race_loser_output="$(psql "$database_url" -v ON_ERROR_STOP=1 -c "
  select public.ticketing_complete_tk_details_authorized(
    '4a000000-0000-0000-0000-000000000001',
    '$admin_completion_race_booking_id',
    'admin-completion-race-loser',
    jsonb_build_object(
      'expectedBookingVersion', $admin_completion_race_booking_version,
      'expectedTransactionVersion', $admin_completion_race_transaction_version,
      'contactPhone', '+44 7000 240308', 'departureDate', '2026-12-02',
      'returnDate', null, 'paymentStatus', 'unpaid', 'paidAt', null,
      'fareSales', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', null)
      ),
      'passengers', '[]'::jsonb,
      'onBehalfReason', 'Admin completion optimistic race'
    )
  )
" 2>&1)"; then
  wait "$admin_completion_race_winner_pid" || true
  echo "Both authorised completion optimistic race contenders committed"
  exit 1
fi
if [[ "$admin_completion_race_loser_output" != *"TICKETING_VERSION_CONFLICT"* ]]; then
  wait "$admin_completion_race_winner_pid" || true
  echo "Authorised completion race loser omitted the version-conflict hint"
  exit 1
fi
wait "$admin_completion_race_winner_pid"

if [[ "$(psql "$database_url" -Atq -F '|' -v ON_ERROR_STOP=1 -c "
  select
    booking.contact_phone,
    booking.version,
    root.version,
    (select count(*) from public.ticket_audit_events audit
      where audit.booking_id = booking.id
        and audit.action = 'complete_tk_details_on_behalf'),
    (select count(*) from public.ticket_idempotency_keys key_row
      where key_row.action_name = 'ticketing.complete_tk_details_authorized.v1'
        and key_row.idempotency_key = 'admin-completion-race-winner'),
    (select count(*) from public.ticket_idempotency_keys key_row
      where key_row.action_name = 'ticketing.complete_tk_details_authorized.v1'
        and key_row.idempotency_key = 'admin-completion-race-loser')
  from public.ticket_bookings booking
  join public.ticket_transactions root
    on root.booking_id = booking.id and root.parent_transaction_id is null
  where booking.id = '$admin_completion_race_booking_id'
")" != "+44 7000 240307|$((admin_completion_race_booking_version + 1))|$((admin_completion_race_transaction_version + 1))|1|1|0" ]]; then
  echo "Authorised completion race left incorrect operational/audit/retry state"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -c "
  drop trigger ticketing_test_pause_admin_completion_race on public.ticket_audit_events;
  drop function public.ticketing_test_pause_admin_completion_race();
" >/dev/null

# Self-completion authority is derived from locked Ticketing membership. Pause
# after the operational write and prove a concurrent membership removal waits
# until the authorised transaction commits.
IFS='|' read -r admin_membership_booking_id admin_membership_booking_version \
  admin_membership_transaction_version \
  <<< "$(psql "$database_url" -Atq -F '|' -v ON_ERROR_STOP=1 -c "
    select booking.id, booking.version, root.version
    from public.ticket_bookings booking
    join public.ticket_transactions root
      on root.booking_id = booking.id
      and root.service_type = 'TK'
      and root.parent_transaction_id is null
    where booking.normalized_pnr = 'AC-MEM1'
  ")"

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  create or replace function public.ticketing_test_pause_admin_membership_race()
  returns trigger
  language plpgsql
  as \$\$
  begin
    if new.action = 'complete_tk_details' and exists (
      select 1 from public.ticket_bookings booking
      where booking.id = new.booking_id and booking.normalized_pnr = 'AC-MEM1'
    ) then
      perform pg_sleep(2);
    end if;
    return new;
  end
  \$\$;
  create trigger ticketing_test_pause_admin_membership_race
  before insert on public.ticket_audit_events
  for each row execute function public.ticketing_test_pause_admin_membership_race();
" >/dev/null

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  select public.ticketing_complete_tk_details_authorized(
    '4a000000-0000-0000-0000-000000000002',
    '$admin_membership_booking_id',
    'admin-completion-membership-race',
    jsonb_build_object(
      'expectedBookingVersion', $admin_membership_booking_version,
      'expectedTransactionVersion', $admin_membership_transaction_version,
      'contactPhone', '+44 7000 240306',
      'departureDate', '2026-12-01',
      'returnDate', null,
      'paymentStatus', 'unpaid',
      'paidAt', null,
      'fareSales', jsonb_build_array(
        jsonb_build_object('passengerType', 'ADT', 'unitSalePrice', null)
      ),
      'passengers', '[]'::jsonb,
      'onBehalfReason', null
    )
  )
" >/dev/null &
admin_membership_completion_pid=$!

admin_membership_pause_seen=false
for _attempt in {1..100}; do
  if [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    select count(*) from pg_stat_activity
    where datname = current_database()
      and state = 'active'
      and wait_event = 'PgSleep'
      and query like '%admin-completion-membership-race%'
  ")" -gt 0 ]]; then
    admin_membership_pause_seen=true
    break
  fi
  sleep 0.05
done
if [[ "$admin_membership_pause_seen" != true ]]; then
  wait "$admin_membership_completion_pid" || true
  echo "Authorised self-completion membership race pause was not observable"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  /* admin-completion-membership-removal */
  delete from public.employee_departments membership
  where membership.employee_id = '4a000000-0000-0000-0000-000000000002'
    and membership.department_id = '20000000-0000-0000-0000-000000000001'
" >/dev/null &
admin_membership_removal_pid=$!

admin_membership_removal_wait_seen=false
for _attempt in {1..100}; do
  if [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    select count(*) from pg_stat_activity
    where datname = current_database()
      and wait_event_type = 'Lock'
      and query like '%admin-completion-membership-removal%'
  ")" -gt 0 ]]; then
    admin_membership_removal_wait_seen=true
    break
  fi
  sleep 0.05
done
if [[ "$admin_membership_removal_wait_seen" != true ]]; then
  wait "$admin_membership_completion_pid" || true
  wait "$admin_membership_removal_pid" || true
  echo "Authorised self-completion did not retain the Ticketing membership lock"
  exit 1
fi

wait "$admin_membership_completion_pid"
wait "$admin_membership_removal_pid"
if [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select count(*)
  from public.ticket_bookings booking
  where booking.id = '$admin_membership_booking_id'
    and booking.contact_phone = '+44 7000 240306'
    and not exists (
      select 1 from public.employee_departments membership
      where membership.employee_id = '4a000000-0000-0000-0000-000000000002'
        and membership.department_id = '20000000-0000-0000-0000-000000000001'
    )
")" != "1" ]]; then
  echo "Authorised membership race left incorrect completion or authority state"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -c "
  insert into public.employee_departments (employee_id, department_id)
  values (
    '4a000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001'
  ) on conflict do nothing;
  drop trigger ticketing_test_pause_admin_membership_race
    on public.ticket_audit_events;
  drop function public.ticketing_test_pause_admin_membership_race();
" >/dev/null

post_2403_fingerprint="$(ticketing_schema_fingerprint)"
assert_forward_migration_replay_blocked "$attribution_migration"
if [[ "$(ticketing_schema_fingerprint)" != "$post_2403_fingerprint" ]]; then
  echo "Blocked attribution replay changed capability 2403 schema state"
  exit 1
fi

if itinerary_prerequisite_output="$(
  psql "$database_url" -v ON_ERROR_STOP=1 -f "$itinerary_migration" 2>&1
)"; then
  echo "Ticketing itinerary migration installed without runtime readiness capability 2026082601"
  exit 1
fi
if [[ "$itinerary_prerequisite_output" != *"TICKETING_SCHEMA_NOT_READY"* ]] \
  || [[ "$(ticketing_schema_fingerprint)" != "$post_2403_fingerprint" ]]; then
  echo "Ticketing itinerary prerequisite guard failed or changed predecessor state"
  echo "$itinerary_prerequisite_output"
  exit 1
fi

pre_runtime_capabilities="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select details -> 'capabilities'
  from public.portal_schema_versions
  where component = 'ticketing'
")"
pre_runtime_capability_count="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select jsonb_array_length(details -> 'capabilities')
  from public.portal_schema_versions
  where component = 'ticketing'
")"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$runtime_readiness_migration"
runtime_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
runtime_first_fingerprint="$(ticketing_schema_fingerprint)"

post_runtime_predecessor_capabilities="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select coalesce(jsonb_agg(capability.value order by capability.ordinality), '[]'::jsonb)
  from public.portal_schema_versions schema_version
  cross join lateral jsonb_array_elements(schema_version.details -> 'capabilities')
    with ordinality as capability(value, ordinality)
  where schema_version.component = 'ticketing'
    and capability.value not in (
      to_jsonb('supabase-pgcrypto-digest-compatibility'::text),
      to_jsonb('verified-ticketing-runtime-readiness'::text)
    )
")"
runtime_state="$(psql "$database_url" -Atq -F '|' -v ON_ERROR_STOP=1 -c "
  select
    schema_version.version,
    public.ticketing_schema_status() ->> 'ready',
    jsonb_array_length(schema_version.details -> 'capabilities'),
    (
      select count(distinct capability.value)
      from jsonb_array_elements_text(schema_version.details -> 'capabilities') capability(value)
      where capability.value in (
        'supabase-pgcrypto-digest-compatibility',
        'verified-ticketing-runtime-readiness'
      )
    ),
    position('extensions.digest' in pg_get_functiondef('public.digest(text,text)'::regprocedure)) > 0,
    position('pg_proc' in pg_get_functiondef('public.digest(text,text)'::regprocedure)) = 0,
    (select prosecdef from pg_proc where oid = 'public.digest(text,text)'::regprocedure),
    not has_function_privilege('anon', 'public.digest(text,text)', 'EXECUTE'),
    not has_function_privilege('authenticated', 'public.digest(text,text)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.digest(text,text)', 'EXECUTE')
  from public.portal_schema_versions schema_version
  where schema_version.component = 'ticketing'
")"
if [[ "$post_runtime_predecessor_capabilities" != "$pre_runtime_capabilities" ]] \
  || [[ "$runtime_state" != "2026082601|true|$((pre_runtime_capability_count + 2))|2|t|t|t|t|t|t" ]]; then
  echo "Ticketing runtime readiness capability, pgcrypto bridge, or grants are incorrect"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$runtime_readiness_migration"
if [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")" != "$runtime_first_applied_at" ]] \
  || [[ "$(ticketing_schema_fingerprint)" != "$runtime_first_fingerprint" ]]; then
  echo "Idempotent Ticketing runtime readiness rerun changed semantic schema state"
  exit 1
fi

assert_forward_migration_replay_blocked "$admin_completion_migration"
if [[ "$(ticketing_schema_fingerprint)" != "$runtime_first_fingerprint" ]]; then
  echo "Blocked authorised-completion replay changed runtime-ready Ticketing schema state"
  exit 1
fi

pre_itinerary_details="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select details
  from public.portal_schema_versions
  where component = 'ticketing'
")"
pre_itinerary_capabilities="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select details -> 'capabilities'
  from public.portal_schema_versions
  where component = 'ticketing'
")"
pre_itinerary_capability_count="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select jsonb_array_length(details -> 'capabilities')
  from public.portal_schema_versions
  where component = 'ticketing'
")"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$itinerary_migration"
itinerary_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
itinerary_first_fingerprint="$(ticketing_schema_fingerprint)"

post_itinerary_predecessor_capabilities="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select coalesce(jsonb_agg(capability.value order by capability.ordinality), '[]'::jsonb)
  from public.portal_schema_versions schema_version
  cross join lateral jsonb_array_elements(schema_version.details -> 'capabilities')
    with ordinality as capability(value, ordinality)
  where schema_version.component = 'ticketing'
    and capability.value not in (
      to_jsonb('server-owned-airport-directory'::text),
      to_jsonb('server-derived-itinerary-timezones'::text),
      to_jsonb('versioned-root-tk-itinerary-replacement'::text),
      to_jsonb('reasoned-itinerary-on-behalf-audit'::text)
    )
")"
itinerary_state="$(psql "$database_url" -Atq -F '|' -v ON_ERROR_STOP=1 -c "
  select
    schema_version.version,
    public.ticketing_schema_status() ->> 'ready',
    jsonb_array_length(schema_version.details -> 'capabilities'),
    (
      select count(distinct capability.value)
      from jsonb_array_elements_text(schema_version.details -> 'capabilities') capability(value)
      where capability.value in (
        'server-owned-airport-directory',
        'server-derived-itinerary-timezones',
        'versioned-root-tk-itinerary-replacement',
        'reasoned-itinerary-on-behalf-audit'
      )
    ),
    schema_version.details -> 'runtimeDependencies' =
      ('$pre_itinerary_details'::jsonb -> 'runtimeDependencies'),
    to_regclass('public.ticket_airports') is not null,
    to_regprocedure(
      'public.ticketing_replace_root_tk_itinerary(uuid,uuid,bigint,text,jsonb,text)'
    ) is not null
  from public.portal_schema_versions schema_version
  where schema_version.component = 'ticketing'
")"
if [[ "$post_itinerary_predecessor_capabilities" != "$pre_itinerary_capabilities" ]] \
  || [[ "$itinerary_state" != "2026082602|true|$((pre_itinerary_capability_count + 4))|4|t|t|t" ]]; then
  echo "Ticketing itinerary capability, predecessor details, or readiness state is incorrect"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$itinerary_migration"
if [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")" != "$itinerary_first_applied_at" ]] \
  || [[ "$(ticketing_schema_fingerprint)" != "$itinerary_first_fingerprint" ]]; then
  echo "Idempotent Ticketing itinerary rerun changed semantic schema state"
  exit 1
fi

# Capability 2602 must preserve 2601's actual pgcrypto-extension-member
# readiness predicate, not merely the itinerary objects. Temporarily detach the
# real digest member from pgcrypto, prove readiness fails closed, then restore it.
psql "$database_url" -v ON_ERROR_STOP=1 -c \
  "alter extension pgcrypto drop function extensions.digest(text,text)" >/dev/null
if [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select public.ticketing_schema_status() ->> 'ready'")" != "false" ]]; then
  psql "$database_url" -v ON_ERROR_STOP=1 -c \
    "alter extension pgcrypto add function extensions.digest(text,text)" >/dev/null
  echo "Ticketing itinerary status ignored a broken pgcrypto runtime dependency"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -c \
  "alter extension pgcrypto add function extensions.digest(text,text)" >/dev/null
if [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select public.ticketing_schema_status() ->> 'ready'")" != "true" ]]; then
  echo "Ticketing itinerary status did not recover after restoring pgcrypto membership"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$itinerary_assertions"

post_itinerary_fingerprint="$(ticketing_schema_fingerprint)"
assert_forward_migration_replay_blocked "$runtime_readiness_migration"
if [[ "$(ticketing_schema_fingerprint)" != "$post_itinerary_fingerprint" ]]; then
  echo "Blocked runtime-readiness replay changed capability 2602 schema state"
  exit 1
fi

pre_schedule_capabilities="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select details -> 'capabilities'
  from public.portal_schema_versions
  where component = 'ticketing'
")"
pre_schedule_capability_count="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select jsonb_array_length(details -> 'capabilities')
  from public.portal_schema_versions
  where component = 'ticketing'
")"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$schedule_change_migration"
schedule_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
schedule_first_fingerprint="$(ticketing_schema_fingerprint)"

post_schedule_predecessor_capabilities="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
  select coalesce(jsonb_agg(capability.value order by capability.ordinality), '[]'::jsonb)
  from public.portal_schema_versions schema_version
  cross join lateral jsonb_array_elements(schema_version.details -> 'capabilities')
    with ordinality as capability(value, ordinality)
  where schema_version.component = 'ticketing'
    and capability.value not in (
      to_jsonb('manual-flight-schedule-change-cases'::text),
      to_jsonb('owner-admin-schedule-finalisation'::text),
      to_jsonb('schedule-finalisation-itinerary-revision'::text)
    )
")"
schedule_state="$(psql "$database_url" -Atq -F '|' -v ON_ERROR_STOP=1 -c "
  select
    schema_version.version,
    public.ticketing_schema_status() ->> 'ready',
    jsonb_array_length(schema_version.details -> 'capabilities'),
    (
      select count(distinct capability.value)
      from jsonb_array_elements_text(schema_version.details -> 'capabilities') capability(value)
      where capability.value in (
        'manual-flight-schedule-change-cases',
        'owner-admin-schedule-finalisation',
        'schedule-finalisation-itinerary-revision'
      )
    ),
    to_regclass('public.ticket_schedule_write_contexts') is not null,
    to_regprocedure(
      'public.ticketing_transition_schedule_change(uuid,uuid,bigint,text,text,uuid,jsonb,text)'
    ) is not null
  from public.portal_schema_versions schema_version
  where schema_version.component = 'ticketing'
")"
if [[ "$post_schedule_predecessor_capabilities" != "$pre_schedule_capabilities" ]] \
  || [[ "$schedule_state" != "2026082701|true|$((pre_schedule_capability_count + 3))|3|t|t" ]]; then
  echo "Ticketing schedule-change capability, predecessor details, or readiness state is incorrect"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$schedule_change_migration"
if [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")" != "$schedule_first_applied_at" ]] \
  || [[ "$(ticketing_schema_fingerprint)" != "$schedule_first_fingerprint" ]]; then
  echo "Idempotent Ticketing schedule-change rerun changed semantic schema state"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$schedule_change_assertions"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$time_limit_migration"
first_time_limit_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$time_limit_migration"
second_time_limit_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
if [[ "$first_time_limit_applied_at" != "$second_time_limit_applied_at" ]]; then
  echo "Idempotent rerun changed the Ticketing time-limit capability application timestamp"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$time_limit_assertions"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$service_passenger_allocation_migration"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$service_passenger_allocation_assertions"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$youth_assistance_archive_migration"
youth_assistance_archive_first_fingerprint="$(ticketing_schema_fingerprint)"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$youth_assistance_archive_migration"
if [[ "$(ticketing_schema_fingerprint)" != "$youth_assistance_archive_first_fingerprint" ]]; then
  echo "Idempotent YTH, assistance, and archive migration changed semantic schema state"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$youth_assistance_archive_assertions"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$admin_requests_suppliers_api_migration"
admin_requests_first_fingerprint="$(ticketing_schema_fingerprint)"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$admin_requests_suppliers_api_migration"
if [[ "$(ticketing_schema_fingerprint)" != "$admin_requests_first_fingerprint" ]]; then
  echo "Idempotent admin requests, suppliers, and flight API migration changed semantic schema state"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$admin_requests_suppliers_api_assertions"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$voucher_foundation_migration"
voucher_foundation_first_fingerprint="$(ticketing_schema_fingerprint)"
voucher_foundation_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$voucher_foundation_migration"
if [[ "$(ticketing_schema_fingerprint)" != "$voucher_foundation_first_fingerprint" ]] \
  || [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")" != "$voucher_foundation_first_applied_at" ]]; then
  echo "Idempotent voucher-foundation migration changed semantic schema state"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$voucher_foundation_assertions"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$package_pnr_reconciliation_migration"
package_pnr_first_fingerprint="$(ticketing_schema_fingerprint)"
package_pnr_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$package_pnr_reconciliation_migration"
if [[ "$(ticketing_schema_fingerprint)" != "$package_pnr_first_fingerprint" ]] \
  || [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")" != "$package_pnr_first_applied_at" ]]; then
  echo "Idempotent package-PNR reconciliation migration changed semantic schema state"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$package_pnr_reconciliation_assertions"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$refund_voucher_lifecycle_migration"
refund_voucher_lifecycle_first_fingerprint="$(ticketing_schema_fingerprint)"
refund_voucher_lifecycle_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$refund_voucher_lifecycle_migration"
if [[ "$(ticketing_schema_fingerprint)" != "$refund_voucher_lifecycle_first_fingerprint" ]] \
  || [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")" != "$refund_voucher_lifecycle_first_applied_at" ]]; then
  echo "Idempotent refund/voucher lifecycle migration changed semantic schema state"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$refund_voucher_lifecycle_assertions"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$fare_check_observations_migration"
fare_check_first_fingerprint="$(ticketing_schema_fingerprint)"
fare_check_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$fare_check_observations_migration"
if [[ "$(ticketing_schema_fingerprint)" != "$fare_check_first_fingerprint" ]] \
  || [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")" != "$fare_check_first_applied_at" ]]; then
  echo "Idempotent fare-check observation migration changed semantic schema state"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$fare_check_observations_assertions"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$archive_tombstones_migration"
archive_tombstones_first_fingerprint="$(ticketing_schema_fingerprint)"
archive_tombstones_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$archive_tombstones_migration"
if [[ "$(ticketing_schema_fingerprint)" != "$archive_tombstones_first_fingerprint" ]] \
  || [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")" != "$archive_tombstones_first_applied_at" ]]; then
  echo "Idempotent archive-tombstone migration changed semantic schema state"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$archive_tombstones_assertions"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$unpriced_held_migration"
unpriced_held_first_fingerprint="$(ticketing_schema_fingerprint)"
unpriced_held_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$unpriced_held_migration"
if [[ "$(ticketing_schema_fingerprint)" != "$unpriced_held_first_fingerprint" ]] \
  || [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")" != "$unpriced_held_first_applied_at" ]]; then
  echo "Idempotent unpriced-Held migration changed semantic schema state"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$unpriced_held_assertions"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$staff_family_migration"
staff_family_first_fingerprint="$(ticketing_schema_fingerprint)"
staff_family_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$staff_family_migration"
if [[ "$(ticketing_schema_fingerprint)" != "$staff_family_first_fingerprint" ]] \
  || [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")" != "$staff_family_first_applied_at" ]]; then
  echo "Idempotent staff/family commercial-policy migration changed semantic schema state"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$staff_family_assertions"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$corrections_refund_confirmation_migration"
corrections_refund_confirmation_first_fingerprint="$(ticketing_schema_fingerprint)"
corrections_refund_confirmation_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$corrections_refund_confirmation_migration"
if [[ "$(ticketing_schema_fingerprint)" != "$corrections_refund_confirmation_first_fingerprint" ]] \
  || [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")" != "$corrections_refund_confirmation_first_applied_at" ]]; then
  echo "Idempotent staff/commercial correction and Refund confirmation migration changed semantic schema state"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$corrections_refund_confirmation_assertions"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$maintenance_admin_operations_migration"
maintenance_admin_operations_first_fingerprint="$(ticketing_schema_fingerprint)"
maintenance_admin_operations_first_applied_at="$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$maintenance_admin_operations_migration"
if [[ "$(ticketing_schema_fingerprint)" != "$maintenance_admin_operations_first_fingerprint" ]] \
  || [[ "$(psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "select applied_at from public.portal_schema_versions where component = 'ticketing'")" != "$maintenance_admin_operations_first_applied_at" ]]; then
  echo "Idempotent Maintenance Admin Ticketing operations migration changed semantic schema state"
  exit 1
fi
psql "$database_url" -v ON_ERROR_STOP=1 -f "$maintenance_admin_operations_assertions"

post_schedule_fingerprint="$(ticketing_schema_fingerprint)"
assert_forward_migration_replay_blocked "$itinerary_migration"
if [[ "$(ticketing_schema_fingerprint)" != "$post_schedule_fingerprint" ]]; then
  echo "Blocked itinerary replay changed capability 2026082701 schema state"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -c \
  "set role authenticated; select count(*) from public.airlines; reset role" >/dev/null

if psql "$database_url" -v ON_ERROR_STOP=1 -c \
  "set role authenticated; select count(*) from public.ticket_bookings" >/dev/null 2>&1; then
  echo "Authenticated role bypassed the Ticketing server-only table boundary"
  exit 1
fi

if psql "$database_url" -v ON_ERROR_STOP=1 -c \
  "set role service_role; update public.commission_source_events set variables = '{}'::jsonb" >/dev/null 2>&1; then
  echo "Service role mutated an append-only Commission source event"
  exit 1
fi

echo "Ticketing foundation, quick-entry, completion, DC/R-ER, Low Fare, attribution, authorised admin completion, runtime-readiness, root-itinerary, schedule-change, voucher, package-PNR reconciliation, refund/voucher lifecycle, staff/commercial correction, explicit Refund confirmation, and no-change fare-check migration integration checks passed."
