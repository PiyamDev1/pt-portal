#!/usr/bin/env bash
set -euo pipefail

database_url="${DATABASE_TEST_URL:-postgresql://postgres:postgres@127.0.0.1:54329/pt_portal_test}"
fixture="tests/integration/fixtures/customer_portal_staff_foundation.sql"
gateway_migration="scripts/migrations/20260831_customer_portal_integration_foundation.sql"
loyalty_migration="scripts/migrations/20260831_customer_portal_loyalty_lifecycle.sql"
assertions="tests/integration/customer_portal_migrations.sql"

customer_portal_schema_fingerprint() {
  psql "$database_url" -Atq -v ON_ERROR_STOP=1 -c "
    with state_parts(value) as (
      select concat(
        'relation|', class_row.relkind, '|', class_row.relname, '|',
        coalesce(class_row.relacl::text, ''), '|', class_row.relrowsecurity, '|',
        coalesce(class_row.reloptions::text, ''), '|',
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
        and (
          class_row.relname like 'customer_%'
          or class_row.relname in (
            'bookings', 'booking_services', 'mobile_users',
            'loyalty_points_ledger'
          )
        )

      union all

      select concat(
        'column|', columns.table_name, '|', columns.ordinal_position, '|',
        columns.column_name, '|', columns.data_type, '|', columns.udt_name, '|',
        columns.is_nullable, '|', coalesce(columns.column_default, '')
      )
      from information_schema.columns
      where columns.table_schema = 'public'
        and (
          columns.table_name like 'customer_%'
          or columns.table_name in (
            'bookings', 'booking_services', 'mobile_users',
            'loyalty_points_ledger'
          )
        )

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
        and (
          procedure_row.proname like 'customer_%'
          or procedure_row.proname in (
            'generate_customer_appointment_reference',
            'bump_booking_customer_version',
            'prevent_customer_portal_audit_mutation'
          )
        )

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
        and (
          constraint_row.conrelid::regclass::text like 'customer_%'
          or constraint_row.conrelid in (
            'public.bookings'::regclass,
            'public.booking_services'::regclass,
            'public.mobile_users'::regclass,
            'public.loyalty_points_ledger'::regclass
          )
        )

      union all

      select concat('trigger|', pg_get_triggerdef(trigger_row.oid, true))
      from pg_trigger trigger_row
      where not trigger_row.tgisinternal
        and (
          trigger_row.tgname like 'customer_%'
          or trigger_row.tgname = 'bookings_bump_customer_version'
        )

      union all

      select concat(
        'policy|', policies.tablename, '|', policies.policyname, '|',
        policies.permissive, '|', policies.roles::text, '|', policies.cmd, '|',
        coalesce(policies.qual, ''), '|', coalesce(policies.with_check, '')
      )
      from pg_policies policies
      where policies.schemaname = 'public'
        and policies.policyname like 'customer_%'
    )
    select md5(string_agg(value, E'\\n' order by value))
    from state_parts
  "
}

psql "$database_url" -v ON_ERROR_STOP=1 -f "$fixture"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$gateway_migration"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$loyalty_migration"

first_fingerprint="$(customer_portal_schema_fingerprint)"

# Repository deployments may re-run an already-applied migration set. Reapply
# in chronological order and prove no schema/ACL capability drift occurred.
psql "$database_url" -v ON_ERROR_STOP=1 -f "$gateway_migration"
psql "$database_url" -v ON_ERROR_STOP=1 -f "$loyalty_migration"

second_fingerprint="$(customer_portal_schema_fingerprint)"
if [[ -z "$first_fingerprint" || "$first_fingerprint" != "$second_fingerprint" ]]; then
  echo "Customer portal migration rerun changed the schema or ACL fingerprint"
  echo "before=$first_fingerprint after=$second_fingerprint"
  exit 1
fi

psql "$database_url" -v ON_ERROR_STOP=1 -f "$assertions"

echo "Customer portal integration and loyalty migration checks passed."
