# Database Schema Overview

Last verified against the repository: August 23, 2026.

## Sources of truth

PT-Portal uses Supabase PostgreSQL. Use these artifacts together:

1. `scripts/migrations/` is the ordered, executable history for repository-owned schema changes.
2. `types/supabase.generated.ts` is the last checked-in snapshot of the linked public schema; `types/supabase.ts` adds a narrow current overlay for committed migrations not yet present in that snapshot.
3. Runtime route/service code defines which columns, functions, grants, and version markers a deployed release actually requires.
4. `scripts/bootstrap/` and `scripts/manual/` contain feature bootstrap or repair utilities; they are not a substitute for applying the ordered migration history.

Do not create or mutate production schema from an HTTP request. Maintenance endpoints may report readiness or invoke an already-deployed function, but deployment owns DDL.

## Domain map

| Domain                        | Principal tables and relationships                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity and access           | Supabase Auth users/sessions/TOTP factors/native passkeys; `employees`, `roles`, `locations`, `departments`, `employee_departments`, `password_history`, `backup_codes`, `user_security_preferences`, `auth_security_events`; legacy preview-only `user_passkeys` and `user_passkey_challenges` remain temporarily for rollback/data review but have no runtime caller |
| Applications                  | `applicants`, `applications`, NADRA detail/pricing/history tables, `pakistani_passport_applications`, `pakistani_passport_drafts`, Pakistani-passport metadata/history, GB-passport applications/pricing/history, visa applications/metadata/history, `application_note_reads`                                                                                         |
| Accounting and LMS            | application accounting views derive from application sources; LMS persists `loan_customers`, `loans`, `loan_transactions`, `loan_installments`, methods/categories, notes, collection/audit records, and idempotency keys                                                                                                                                              |
| Bookings                      | `bookings`, branch/service schedule configuration, capacity reservations, waitlist, drafts/preferences, reminder/email/idempotency events, contact flags, and audit logs                                                                                                                                                                                               |
| Quotes and package operations | `travel_package_quotes`, converted `travel_packages`, versions, passengers, reservations/items/refunds, invoices/lines, payments/plans/installments, documents, tasks/deadlines/risk flags/communications/audit, transport vouchers, group/member/shared-service allocation, third-party shares/access, and legacy migration maps/runs                                 |
| Documents and receipts        | `documents`, `document_migration_runs`, `generated_receipts`; object bytes live in private object stores while PostgreSQL owns metadata and access scope                                                                                                                                                                                                               |
| Timeclock                     | `timeclock_devices`, signed events, QR/request nonces, physical-device manual codes and limit records, attendance records, and adjustment audit fields                                                                                                                                                                                                                 |
| Frappe/HR                     | identity maps, inbox/outbox, conflicts, sync state, handoff events, leave requests/types/balances, and retained payroll/employee-history tables                                                                                                                                                                                                                        |
| Training and dashboard        | courses, lessons, quiz questions, enrollments, attempts, certificates, dashboard module preferences, notice-board slides/reads, issue reports/events/artifacts                                                                                                                                                                                                         |
| Pricing and commercial data   | central service pricing, NADRA/passport/visa pricing, Umrah transport suppliers/vehicles/routes/plans/rates/settings, commissions, ticket ledger, loyalty, accounting categories, closeout and P&L data                                                                                                                                                                |
| Ticketing                     | normalized `ticket_bookings`, TK/DC/R-ER transactions, grouped passenger fares, passenger allocations, itinerary sectors, package links, audit/notification/idempotency records, and the Commission-owned source-event boundary; the legacy `ticket_ledger` remains frozen for review                                                                                  |

This is a domain map, not a column-level substitute for generated types or SQL. See [Travel Packages](../guides/TRAVEL_PACKAGES_GUIDE.md), [Bookings](../guides/BOOKINGS_GUIDE.md), and [Storage](STORAGE_SYSTEM.md) for lifecycle rules.

## Migration families

| Migration range                                         | Capability                                                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260214`–`20260328`                                   | application notes/status/refunds, employee activation, document vault/migration tracking, timeclock adjustments, issue reporting                                                                                    |
| `20260414`–`20260418`                                   | employee/payroll foundation and Frappe bidirectional-integration foundation                                                                                                                                         |
| `20260602`–`20260702`                                   | booking operations/capacity/waitlist/drafts/preferences, security preferences and legacy passkey-preview storage/events, Frappe identity/handoff, notice board, training, manual overrides                          |
| `20260708`–`20260811`                                   | quote-to-package workflow, reservations/documents/invoices/groups/transport pricing, timeclock hardware security, Pakistani-passport drafts, third-party document shares, responsibility agents, refunds, discounts |
| `20260812_secure_atomic_lms_operations.sql`             | atomic LMS ledger/installment functions, idempotency, global account pagination, grants, and readiness marker                                                                                                       |
| `20260812_security_rate_limits.sql`                     | shared PostgreSQL rate-limit buckets/function, atomic backup-code replacement, grants, and readiness marker                                                                                                         |
| `20260812_update_lms_installments_atomically.sql`       | atomic, bounded batch updates for LMS installment due dates and amounts, with service-role-only execution                                                                                                           |
| `20260822_create_ticketing_commission_foundation.sql`   | Ticketing schema ratchet: normalized ledger core, PNR/package evidence, branch timezones, server-only finance access, legacy-ledger freeze, and immutable retry-safe Commission source variables                    |
| `20260822_create_ticketing_quick_tk.sql`                | atomic, idempotent TK quick entry for an agent's own ledger, duplicate-PNR confirmation, automatic package matching, transaction-owner alignment, starter airlines, and capability `2026082201`                     |
| `20260822_ticketing_tk_completion.sql`                  | atomic own-TK detail completion, stable passenger positions, optimistic versions, posted-sale/payment guards, redacted audit, variable-only source facts, and capability `2026082202`                               |
| `20260823_ticketing_dc_rer_entry.sql`                   | atomic own-ledger issued DC/R-ER service entries, affected-passenger ceilings, root/reissue lineage, independent Paid transition, target-safe source facts, and capability `2026082301`                             |
| `20260823_ticketing_rer_chronology_guard.sql`           | R-ER monotonic chronology, one issued successor per predecessor, booking-serialized lineage validation, Issued-root enforcement, and capability `2026082302`                                                        |
| `20260823_ticketing_service_response_dates.sql`         | live-safe service RPC wrappers with exact branch-local booking/issue/payment dates, inaccessible internal cores, strict grants, and capability `2026082303`                                                         |
| `20260823_ticketing_service_response_lineage_guard.sql` | immutable service replay dates, historical R-ER lineage after cancellation/refund, one historical successor, completed-response immutability, migration-ratchet tombstones, and capability `2026082304`             |

Apply unapplied files in filename order and track which migrations have already run. Every
Ticketing migration begins with a read-only forward-version guard: a fresh install and an exact
same-version rerun are allowed, while a script older than the installed capability fails before its
first schema, grant, policy, or readiness mutation with
`TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED`. Capability `2026082304` also retires two shared
routine signatures with revoked procedure tombstones as a second defense against isolated 2301–2303
replay. A feature deployment may require an earlier bootstrap noted by its active guide—for example
bookings, receipts, or timeclock—but do not re-run historical repair scripts blindly against
production.

## Required runtime capabilities

The two August 12 capability migrations share the service-role-only `portal_schema_versions` table. The LMS installment-batch migration extends that baseline without changing its version marker. Current runtime code expects:

- component `lms`, version `20260812`, plus `lms_schema_status()`, the main `lms_*` transactional functions, and `lms_update_installments(jsonb)` from the follow-up migration;
- component `api-security`, version `20260812`, plus `check_api_rate_limit(...)` and `replace_backup_codes(...)`.

The Ticketing foundation installs component `ticketing`, version `20260822`. The TK quick-entry
migration raises that component to `2026082201` and installs
`ticketing_create_quick_tk(uuid, text, jsonb)`. The TK completion migration raises it to
`2026082202` and installs `ticketing_complete_tk_details(uuid, uuid, text, jsonb)`. The DC/R-ER
migration raises it to `2026082301` and installs
`ticketing_append_service_transaction(uuid, uuid, text, jsonb)` plus
`ticketing_mark_service_transaction_paid(uuid, uuid, uuid, text, jsonb)`. The chronology follow-up
raises it to `2026082302` and prevents a backdated or concurrent reissue from branching the
replacement chain. The response-contract follow-up raises it to `2026082303` and keeps the two
public RPC signatures as service-role-only wrappers that reconcile exact branch-local booking,
issue, and payment dates from stored rows. Its renamed core functions and response helper are not
executable by any API role. The replay/lineage follow-up raises it to `2026082304`, preserves the
original response dates after later payment or terminal lifecycle changes, retains every issued
R-ER in its historical chain, and blocks a second historical successor. Active helpers and the
lineage trigger use versioned 2304 routine names; retired shared names are inaccessible ratchet
tombstones. Each route checks the minimum capability it needs and fails closed otherwise. All
mutation functions are executable only through the service-role boundary; the API derives the
employee actor from the verified staff session and never accepts that identity from the browser.

This capability supports TK Held/Issued quick entry, the authenticated agent's own ledger, partial
TK detail completion, and aggregate issued DC/R-ER financial service movements against an existing
root TK. Service children carry affected ADT/CHD/INF quantities and full supplier/customer unit
values, preserve immutable root facts, form an explicit R-ER supersession chain, and publish
variables-only service/payment facts that do not count as issued-TK target events. It does not yet
capture the new itinerary, exact affected passenger identities, or an airline-fee/fare-difference
component split. Low fares, vouchers, targets, team flight monitoring, refunds, and the
cancellation calculator remain outside this runtime capability.

The LMS readiness endpoint returns `503` when the expected migration/capability is absent; it does not execute DDL. Security-sensitive routes also fail closed when the shared limiter is unavailable or incorrectly configured.

Privileged tables/functions revoke access from `public`, `anon`, and `authenticated` and grant only the needed service-role operations. Preserve that posture in follow-up migrations.

## Access rules

- Validate the cookie-backed Supabase user before creating a service-role client.
- Resolve actor identity from the verified user, never from a client-provided employee ID.
- Enforce active employee, role, department, branch, ownership, and public-token scope as required by the route.
- Keep RLS enabled and use narrowly scoped policies where browser/authenticated clients query directly.
- Treat service-role access as an explicit bypass that requires an application-level authorization check.
- Put transactionally coupled writes in a PostgreSQL function, with an idempotency key where retrying could duplicate money or events.
- Store object metadata/access state in PostgreSQL; never authorize an object-store read from a raw object key alone.

## Change workflow

1. Add an idempotent migration in `scripts/migrations/` with explicit grants and RLS decisions.
2. Add/update a capability marker when runtime code depends on the change.
3. Apply the migration to the intended Supabase project before deploying dependent code.
4. Regenerate and review the linked schema types:

   ```bash
   npm run types:supabase
   ```

5. Update route contracts, domain types, tests, `.env.example`, and active documentation together.
6. Test rollback/upgrade semantics and concurrency on disposable PostgreSQL when the change is transactional or security-sensitive.

The type generator preserves the existing checked-in file if Supabase CLI generation fails. A migration that is not yet applied to the linked project will not appear in generated types. Use only a narrow, reviewed pending-migration overlay in `types/supabase.ts`, then remove it after deployment and regeneration; do not hand-edit generated output to simulate deployment.

## Database integration checks

`.github/workflows/database-integration.yml` starts PostgreSQL 16 and runs:

```bash
npm run test:db:ticketing
npm run test:db:lms
npm run test:db:security
```

The suites validate migration installation and rollback behavior, grants, readiness markers,
Ticketing quick-entry idempotency/duplicate/package/ownership rules, TK completion
version/idempotency/immutability/passenger/payment/source-fact rules, DC/R-ER root and supersession
lineage, affected-quantity ceilings, response-date reconciliation, payment/event rollback, replay,
terminal-lifecycle history, every isolated historical migration rejection, simulated future-routine
preservation, and concurrency rules, LMS ledger/installment/idempotency semantics, all-or-nothing
installment-batch updates, limiter windows, atomic backup-code replacement, and concurrent requests.
Locally, set `DATABASE_TEST_URL` to a disposable database. Never point these fixtures at production
or any database containing data that must be preserved.
