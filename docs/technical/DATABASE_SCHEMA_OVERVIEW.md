# Database Schema Overview

Last verified against the repository and linked Ticketing capability: August 27, 2026.

## Sources of truth

PT-Portal uses Supabase PostgreSQL. Use these artifacts together:

1. `scripts/migrations/` is the ordered, executable history for repository-owned schema changes.
2. `types/supabase.generated.ts` is the last checked-in snapshot of the linked public schema; `types/supabase.ts` adds a narrow current overlay for committed migrations not yet present in that snapshot.
3. Runtime route/service code defines which columns, functions, grants, and version markers a deployed release actually requires.
4. `scripts/bootstrap/` and `scripts/manual/` contain feature bootstrap or repair utilities; they are not a substitute for applying the ordered migration history.

Do not create or mutate production schema from an HTTP request. Maintenance endpoints may report readiness or invoke an already-deployed function, but deployment owns DDL.

## Domain map

| Domain                        | Principal tables and relationships                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity and access           | Supabase Auth users/sessions/TOTP factors/native passkeys; `employees`, `roles`, `locations`, `departments`, `employee_departments`, `password_history`, `backup_codes`, `user_security_preferences`, `auth_security_events`; legacy preview-only `user_passkeys` and `user_passkey_challenges` remain temporarily for rollback/data review but have no runtime caller                 |
| Applications                  | `applicants`, `applications`, NADRA detail/pricing/history tables, `pakistani_passport_applications`, `pakistani_passport_drafts`, Pakistani-passport metadata/history, GB-passport applications/pricing/history, visa applications/metadata/history, `application_note_reads`                                                                                                         |
| Accounting and LMS            | application accounting views derive from application sources; LMS persists `loan_customers`, `loans`, `loan_transactions`, `loan_installments`, methods/categories, notes, collection/audit records, and idempotency keys                                                                                                                                                              |
| Bookings                      | `bookings`, branch/service schedule configuration, capacity reservations, waitlist, drafts/preferences, reminder/email/idempotency events, contact flags, and audit logs                                                                                                                                                                                                               |
| Quotes and package operations | `travel_package_quotes`, converted `travel_packages`, versions, passengers, reservations/items/refunds, invoices/lines, payments/plans/installments, documents, tasks/deadlines/risk flags/communications/audit, transport vouchers, group/member/shared-service allocation, third-party shares/access, and legacy migration maps/runs                                                 |
| Documents and receipts        | `documents`, `document_migration_runs`, `generated_receipts`; object bytes live in private object stores while PostgreSQL owns metadata and access scope                                                                                                                                                                                                                               |
| Timeclock                     | `timeclock_devices`, signed events, QR/request nonces, physical-device manual codes and limit records, attendance records, and adjustment audit fields                                                                                                                                                                                                                                 |
| Frappe/HR                     | identity maps, inbox/outbox, conflicts, sync state, handoff events, leave requests/types/balances, and retained payroll/employee-history tables                                                                                                                                                                                                                                        |
| Training and dashboard        | courses, lessons, quiz questions, enrollments, attempts, certificates, dashboard module preferences, notice-board slides/reads, issue reports/events/artifacts                                                                                                                                                                                                                         |
| Pricing and commercial data   | central service pricing, NADRA/passport/visa pricing, Umrah transport suppliers/vehicles/routes/plans/rates/settings, commissions, ticket ledger, loyalty, accounting categories, closeout and P&L data                                                                                                                                                                                |
| Ticketing                     | normalized `ticket_bookings`, TK/DC/R-ER transactions, immutable primary/assistant attribution versions, grouped passenger fares, passenger allocations, itinerary sectors, package links, immutable whole-PNR supplier-fare adjustments, audit/notification/idempotency records, and the Commission-owned source-event boundary; the legacy `ticket_ledger` remains frozen for review |

This is a domain map, not a column-level substitute for generated types or SQL. See [Travel Packages](../guides/TRAVEL_PACKAGES_GUIDE.md), [Bookings](../guides/BOOKINGS_GUIDE.md), and [Storage](STORAGE_SYSTEM.md) for lifecycle rules.

## Migration families

| Migration range                                         | Capability                                                                                                                                                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260214`–`20260328`                                   | application notes/status/refunds, employee activation, document vault/migration tracking, timeclock adjustments, issue reporting                                                                                        |
| `20260414`–`20260418`                                   | employee/payroll foundation and Frappe bidirectional-integration foundation                                                                                                                                             |
| `20260602`–`20260702`                                   | booking operations/capacity/waitlist/drafts/preferences, security preferences and legacy passkey-preview storage/events, Frappe identity/handoff, notice board, training, manual overrides                              |
| `20260708`–`20260811`                                   | quote-to-package workflow, reservations/documents/invoices/groups/transport pricing, timeclock hardware security, Pakistani-passport drafts, third-party document shares, responsibility agents, refunds, discounts     |
| `20260812_secure_atomic_lms_operations.sql`             | atomic LMS ledger/installment functions, idempotency, global account pagination, grants, and readiness marker                                                                                                           |
| `20260812_security_rate_limits.sql`                     | shared PostgreSQL rate-limit buckets/function, atomic backup-code replacement, grants, and readiness marker                                                                                                             |
| `20260812_update_lms_installments_atomically.sql`       | atomic, bounded batch updates for LMS installment due dates and amounts, with service-role-only execution                                                                                                               |
| `20260822_create_ticketing_commission_foundation.sql`   | Ticketing schema ratchet: normalized ledger core, PNR/package evidence, branch timezones, server-only finance access, legacy-ledger freeze, and immutable retry-safe Commission source variables                        |
| `20260822_create_ticketing_quick_tk.sql`                | atomic, idempotent TK quick entry for an agent's own ledger, duplicate-PNR confirmation, automatic package matching, transaction-owner alignment, starter airlines, and capability `2026082201`                         |
| `20260822_ticketing_tk_completion.sql`                  | atomic own-TK detail completion, stable passenger positions, optimistic versions, posted-sale/payment guards, redacted audit, variable-only source facts, and capability `2026082202`                                   |
| `20260823_ticketing_dc_rer_entry.sql`                   | atomic own-ledger issued DC/R-ER service entries, affected-passenger ceilings, root/reissue lineage, independent Paid transition, target-safe source facts, and capability `2026082301`                                 |
| `20260823_ticketing_rer_chronology_guard.sql`           | R-ER monotonic chronology, one issued successor per predecessor, booking-serialized lineage validation, Issued-root enforcement, and capability `2026082302`                                                            |
| `20260823_ticketing_service_response_dates.sql`         | live-safe service RPC wrappers with exact branch-local booking/issue/payment dates, inaccessible internal cores, strict grants, and capability `2026082303`                                                             |
| `20260823_ticketing_service_response_lineage_guard.sql` | immutable service replay dates, historical R-ER lineage after cancellation/refund, one historical successor, completed-response immutability, migration-ratchet tombstones, and capability `2026082304`                 |
| `20260824_ticketing_low_fare_adjustments.sql`           | shared whole-PNR GBP supplier-fare queue/lineage, server-derived original fare and package scope, acting-agent source attribution, immutable target-safe adjustment events, and capability `2026082401`                 |
| `20260824_ticketing_attribution_overrides.sql`          | immutable entered-by/primary/assistant attribution, admin-only optimistic correction, aligned operational ownership, primary-only issued-ticket targets, versioned source-event correction, and capability `2026082402` |
| `20260824_ticketing_admin_completion.sql`               | audited Admin/Master Admin/Super Admin root-TK completion on behalf of the current primary, exact replay, attributed completion-source lineage, and capability `2026082403`                                             |
| `20260825_ticketing_pgcrypto_compat.sql`                | compatibility bridge for Supabase projects that install `pgcrypto` outside `public`                                                                                                                                     |
| `20260826_secure_exec_sql.sql`                          | revokes anonymous/authenticated execution of the legacy PostgreSQL-owner `exec_sql(text)` helper while retaining service-role deployment access                                                                         |
| `20260826_ticketing_runtime_readiness.sql`              | trusted fixed-schema pgcrypto bridge, verified runtime dependency status, preserved capability history, and Ticketing capability `2026082601`                                                                           |
| `20260826_ticketing_sector_itinerary.sql`               | server-owned airport directory, airport-derived timezone/UTC sectors, retained root-TK itinerary revisions, audited administrator cover, guarded write context, and capability `2026082602`                             |
| `20260827_ticketing_schedule_changes.sql`               | immutable manual schedule-change cases, shared marking, owner/admin resolution, guarded status transitions, itinerary-revision finalisation, and capability `2026082701`                                                |
| `20260827_ticketing_time_limits.sql`                    | exact Held expiry, catch-up-safe 24/6/2-hour and expiry claims, stale-claim recovery, and capability `2026082702`                                                                                                       |
| `20260827_ticketing_service_passenger_allocation.sql`   | exact stable passenger allocation for issued DC/R-ER services and capability `2026082703`                                                                                                                               |
| `20260828_ticketing_youth_assistance_archive.sql`       | YTH fares, gross unit sale/discount, root-TK assistant facts with zero target units, audited archive, and capability `2026082801`                                                                                       |
| `20260828_ticketing_admin_requests_suppliers_api.sql`   | amendment/archive requests, supplier snapshots, airport metadata, AeroDataBox settings/usage, admin correction controls, and capability `2026082802`                                                                    |
| `20260829_commission_shadow_foundation.sql`             | immutable typed policies/components, effective employee assignments, source state, shadow entries, exceptions, audit, and Commission capability `2026082901`                                                            |
| `20260829_commission_shadow_processor.sql`              | bounded retry-safe shadow processing, corrections, period bonuses, reconciliation overview, and Commission capability `2026082902`                                                                                      |
| `20260829_commission_hr_department_access.sql`          | Staff Management HR-department authority and audited system-worker support, capability `2026082903`                                                                                                                     |
| `20260829_commission_staff_profiles.sql`                | employee-owned agreement snapshots, one-time copy, atomic independent per-service versions, effective replacement, scheduled cancellation, and capability `2026082904`                                                  |
| `20260829_ticketing_voucher_foundation.sql`             | immutable unknown-value passenger vouchers, eleven-month deadline, reminder claims, and capability `2026082901`                                                                                                         |
| `20260829_ticketing_package_pnr_reconciliation.sql`     | bidirectional exact package-PNR reconciliation, late classification, ambiguity handling, and capability `2026082902`                                                                                                    |
| `20260829_ticketing_refund_voucher_lifecycle.sql`       | saved refund formula/settlement/recovery evidence plus voucher claim/value/use/refund/closure events and capability `2026082903`                                                                                        |
| `20260829_ticketing_fare_check_observations.sql`        | append-only no-change supplier-fare observations, complete Low Fare owner options, no Commission event, and capability `2026082904`                                                                                     |

Apply unapplied files in filename order and track which migrations have already run. Every
versioned Ticketing capability migration begins with a forward-version guard: the foundation supports a fresh
install, follow-ups require their documented predecessor, and an exact same-version rerun is
allowed. A script older than the installed capability fails before its first schema, grant, policy,
or readiness mutation with
`TICKETING_FORWARD_MIGRATION_REPLAY_BLOCKED`. Capability `2026082304` also retires two shared
routine signatures with revoked procedure tombstones as a second defense against isolated 2301–2303
replay. Capability `2026082401` preserves those ratchets and adds booking-first serialization for
package-link mutations so an adjustment cannot snapshot package scope during a concurrent change.
Capability `2026082402` adds immutable attribution versions and a tightly scoped owner-correction
path; assistants remain source facts with zero target units, while the primary responsible employee
receives all issued passenger-ticket target units.
Capability `2026082403` adds reasoned admin-on-behalf root-TK completion without impersonation.
The compatibility bridge is tracked and hardened by capability `2026082601`, whose readiness status
also verifies the installed pgcrypto runtime dependency.
Capability `2026082602` preserves those checks and adds the service-only versioned itinerary
replacement boundary plus the read-only airport and sector projections.
Capability `2026082701` adds immutable manual schedule cases, single-use status contexts, a
read-only active-case projection, and owner/reasoned-administrator finalisation through itinerary
replacement.
Capabilities `2026082702`–`2026082802` add exact expiry processing, service-passenger allocation,
YTH/pricing/assistance/archive controls, staff requests, suppliers, and budgeted flight API state.
Capabilities `2026082901`–`2026082904` add vouchers, bidirectional package-PNR reconciliation,
refund/voucher lifecycle evidence, and no-change fare observations. The linked project is verified
ready at `2026082904`.
A feature deployment may require an earlier bootstrap noted by its active guide—for example
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
tombstones. The Low Fare migration raises the component to `2026082401`, adds immutable
`ticket_fare_adjustments`, the latest-tail `ticket_fare_adjustment_current` view, and the
service-role-only `ticketing_append_fare_adjustment(uuid, uuid, text, jsonb)` function. Each route
checks the minimum capability it needs and fails closed otherwise. The attribution migration raises
the component to `2026082402` and installs
`ticketing_create_quick_tk_attributed(uuid, text, jsonb)` plus
`ticketing_correct_booking_attribution(uuid, uuid, bigint, text, jsonb)`. All mutation functions are
executable only through the service-role boundary; the API derives the employee actor from the
verified staff session and never accepts that identity from the browser. The linked project was
verified ready at `2026082701` after deployment. The authorised completion, attribution, itinerary,
and schedule-change mutations are service-role-only; transient write-context tables are
inaccessible to API roles; and the expected invariant triggers are installed. The service role can
read but cannot directly append schedule events. Linked aggregate checks confirmed the active
sector guard, security-definer schedule RPC, denied browser execution, unique preserved capability
tokens, and zero open schedule contexts/events/cases before operational use. The generated types
were refreshed from this linked schema.

This capability supports TK Held/Issued quick entry, the authenticated agent's own ledger, partial
TK detail completion, aggregate issued DC/R-ER financial service movements against an existing
root TK, shared whole-PNR GBP supplier-fare adjustments and no-change observations, persisted
refund/recovery evidence, and voucher lifecycle events against eligible issued tickets. The
service children carry affected ADT/CHD/INF quantities and full supplier/customer unit values,
preserve immutable root facts, form an explicit R-ER supersession chain, and publish variables-only
service/payment facts that do not count as issued-TK target events. Low Fare appends a separate
linear supplier-fare history and target-safe positive/negative difference event without rewriting
the root. Root TKs now support retained itinerary revisions, the shared future-flight projection,
and manual flight-number/time change cases with owner/administrator resolution.
The runtime captures exact affected passenger identities for issued DC/R-ER children and processes
Held-ticket time-limit claims. It does not yet capture an airline-fee/fare-difference component
split, Held DC/R-ER children, changed child-service itinerary, non-GBP/partial-passenger Low Fare,
or Commission-owned targets/policy.

The LMS readiness endpoint returns `503` when the expected migration/capability is absent; it does not execute DDL. Security-sensitive routes also fail closed when the shared limiter is unavailable or incorrectly configured.

Privileged tables/functions revoke access from `public`, `anon`, and `authenticated` and grant only the needed service-role operations. Preserve that posture in follow-up migrations.
The legacy `exec_sql(text)` administrative helper is explicitly denied to anonymous and authenticated roles; never broaden that grant.

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
