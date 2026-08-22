#!/usr/bin/env bash
set -euo pipefail

database_url="${DATABASE_TEST_URL:-postgresql://postgres:postgres@127.0.0.1:54329/pt_portal_test}"
fixture="tests/integration/fixtures/ticketing_foundation_schema.sql"
migration="scripts/migrations/20260822_create_ticketing_commission_foundation.sql"
assertions="tests/integration/ticketing_foundation.sql"
quick_entry_migration="scripts/migrations/20260822_create_ticketing_quick_tk.sql"
quick_entry_assertions="tests/integration/ticketing_quick_entry.sql"

psql "$database_url" -v ON_ERROR_STOP=1 -f "$fixture"
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

echo "Ticketing foundation and quick-entry migration integration checks passed."
