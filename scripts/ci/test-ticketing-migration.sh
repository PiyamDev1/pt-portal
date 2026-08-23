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
        '|', coalesce(class_row.relacl::text, ''), '|', class_row.relrowsecurity
      )
      from pg_class class_row
      join pg_namespace namespace_row on namespace_row.oid = class_row.relnamespace
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

echo "Ticketing foundation, quick-entry, completion, and DC/R-ER migration integration checks passed."
