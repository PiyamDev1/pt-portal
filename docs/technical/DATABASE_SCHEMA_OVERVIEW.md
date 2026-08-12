# Database Schema Overview

Last updated: August 12, 2026

## Purpose and source of truth

This document maps the main PT-Portal database domains and the schema verification workflow. Executable SQL migrations are authoritative:

- `scripts/migrations/`
- root-level SQL utilities in `scripts/`
- `scripts/bootstrap/create-bookings-schema.sql` for booking bootstrap

Do not create or mutate schema from an API request. Runtime “setup” endpoints may report readiness, but deployment migrations own DDL.

## Core domains

### Authentication and employees

- Supabase Auth identities and factors
- `employees`, `roles`, locations, and `employee_departments`
- bcrypt-hashed one-time `backup_codes`
- security-event and login-guard records
- `api_rate_limit_buckets` for shared abuse-control counters

### Applications

- NADRA applications and applicants
- Visa applications
- Submitted Pakistani/GB passport applications
- Pre-tracking Pakistani-passport drafts
- Status, complaint, note, assignment, and receipt history

### LMS

- Customers and loan accounts
- Service, fee, and payment ledger entries
- Installment plans and payment methods
- Audit logs, operational notes, and idempotency keys

The ledger is the source of truth for derived balances. LMS mutations use service-role-only PostgreSQL functions so the ledger write, installment synchronization, and account recalculation occur in one transaction.

### Bookings

- Branch-aware schedules and services
- Appointment records and slot rules
- Reminder events, no-show flags, and booking audit records

### Documents

- Private-vault metadata tied to an applicant, application, or draft scope
- Storage provider/bucket, object key, MIME type, size, and ETag
- Logical deletion and listing metadata

The object store is not the authorization source. Routes first resolve a live database record before preview, download, or delete operations.

### Timeclock

- Device registry
- Signed scan events
- Team views, manual codes, and adjustment workflows

## Versioned security and LMS migrations

`portal_schema_versions` records deployed component capabilities. It is RLS-enabled and readable only by the service role.

| Migration                                   | Marker                      | Main capabilities                                                                                                              |
| ------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `20260812_secure_atomic_lms_operations.sql` | `lms` / `20260812`          | Atomic ledger functions, idempotent retries, installment synchronization, global account pagination, and `lms_schema_status()` |
| `20260812_security_rate_limits.sql`         | `api-security` / `20260812` | Shared fixed-window rate limiting and atomic backup-code replacement                                                           |

`POST /api/admin/create-installments-table` is retained as a maintenance readiness check. It calls `lms_schema_status()` and returns `503` when the required migration/version is absent; it does not execute DDL.

The security migration installs:

- `api_rate_limit_buckets`, with hashed identities and no grants to `anon` or `authenticated`;
- `check_api_rate_limit`, an atomic service-role-only fixed-window increment/decision function; and
- `replace_backup_codes`, a service-role-only transaction that preserves the previous code set if replacement fails.

## Data-access rules

- Authenticate the request with the cookie-backed Supabase user before creating a service-role client.
- Resolve actor identity from the verified session, never from body/query employee IDs.
- Apply route-specific role or department checks before privileged reads and writes.
- Validate and bound mutation payloads before database calls.
- Prefer generated Supabase types and typed shared accessors for new code.
- Keep transactionally related writes inside a PostgreSQL function instead of coordinating partial writes from a route.

## Real-PostgreSQL integration checks

`.github/workflows/database-integration.yml` starts PostgreSQL 16 for migration tests. It runs:

```bash
npm run test:db:lms
npm run test:db:security
```

The LMS check applies a minimal production-shaped fixture, proves the migration can roll back cleanly, installs it, exercises ledger/installment/fee/update behavior, validates idempotent replay and pagination, and runs simultaneous retries from separate sessions.

The security check applies the security migration, verifies rate-limit window decisions and backup-code replacement behavior, and runs concurrent limiter calls to prove that exactly one request passes a limit of one.

Set `DATABASE_TEST_URL` to a disposable database. Never run these integration fixtures against production or a database containing data that must be preserved.

## Schema-change checklist

1. Add an idempotent migration in `scripts/migrations/`.
2. Revoke public/anon/authenticated access to privileged tables and functions; grant the minimum service-role capability.
3. Add or update a `portal_schema_versions` marker when runtime code depends on the migration.
4. Update routes, generated types, and contract documentation together.
5. Add unit tests and a real-PostgreSQL integration assertion for concurrency or transaction behavior.
6. Run lint, typecheck, unit tests, build, and both applicable database integration scripts before merge.
