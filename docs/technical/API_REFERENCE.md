# API Route Inventory

Last verified against `app/api/**/route.{ts,js}`: August 23, 2026.

This compact reference inventories every current API route and records cross-cutting contracts. The [detailed API documentation](../api/README.md) provides field-level access, input, success, error, side-effect, and example contracts for every exported handler. The route implementation, its schemas, and focused tests remain authoritative when a deployment has moved ahead of these documents.

## Protocol conventions

- Routes use the Next.js App Router under `/api`.
- JSON successes normally return the payload directly. They are not globally wrapped in `{ data: ... }`.
- JSON failures should return `{ "error": "message" }` with an appropriate status. Some routes add bounded structured fields such as `Retry-After`, readiness hints, or validation details.
- `400` is invalid input, `401` unauthenticated/invalid credential, `403` authenticated but unauthorized, `404` unavailable scope/record, `409` state conflict, `410` retired/expired, `413` body too large, `429` limited, and `503` required security/schema/provider capability unavailable.
- `proxy.ts` adds or propagates `x-request-id`; it does not authenticate. Each handler owns its security boundary.
- Protected staff routes use the cookie-backed Supabase user. Service-role access must follow server-side employee/role/department/resource checks.
- Sensitive routes use shared PostgreSQL fixed-window limits. A block returns `429` plus `Retry-After`; a required limiter that is unavailable fails closed with `503`.
- New/changed JSON mutations use a bounded Zod schema with `parseBodyWithSchema()`. The API-boundary baseline tracks remaining legacy parsing; it is not an approved pattern for new routes.
- Private/security responses should be `private, no-store`. Binary, redirect, HTML callback, and signed-URL routes document their own content behavior.

## Public, integration, and scheduled boundaries

These endpoints do not use an ordinary staff cookie and must not be made broader:

| Surface                          | Authentication/scope                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quote share and selection        | Unpredictable quote token, quote expiry/state, public DTO, shared IP/token limits                                                                       |
| Customer package portal          | Package reference plus normalized surname yields an enabled, unexpired document token; released/customer-visible data only                              |
| Third-party package documents    | Hashed share token plus access code, recipient identity, accepted terms, allowed categories, expiry/revocation, shared limits                           |
| Receipt verification             | Tracking number plus receipt PIN, with IP/tracking limits; unsupported services return a non-valid result                                               |
| Booking attendance link          | Per-reminder response token and bounded status query; returns HTML rather than JSON                                                                     |
| Frappe webhook                   | Raw-body signature in `x-frappe-signature`, deduplicated source event ID                                                                                |
| Physical timeclock device routes | Device-specific signature/secret, nonce/replay, timestamp, and active-device checks as defined by the route                                             |
| `/api/cron/*`                    | Exact `Authorization: Bearer <CRON_SECRET>`; missing configuration returns `503`, invalid/absent bearer returns `401`; `x-vercel-cron` alone is ignored |
| Document migration worker        | `DOCUMENT_MIGRATION_CRON_TOKEN` when configured, otherwise `CRON_SECRET`; accepts the matching bearer, `x-migration-token`, or bounded body token       |

## Authentication and account security

| Methods         | Route                             |
| --------------- | --------------------------------- |
| `POST`          | `/api/auth/password-login`        |
| `POST`          | `/api/auth/login-guard`           |
| `GET`, `DELETE` | `/api/auth/sessions`              |
| `POST`          | `/api/auth/update-password`       |
| `GET`, `PATCH`  | `/api/auth/security-preferences`  |
| `POST`          | `/api/auth/security-events`       |
| `GET`           | `/api/auth/backup-codes/count`    |
| `POST`          | `/api/auth/generate-backup-codes` |
| `POST`          | `/api/auth/consume-backup-code`   |
| `POST`          | `/api/auth/reset-2fa`             |

Password login accepts a bounded normalized email/password body, applies IP and email limits, checks the persisted login guard, and returns the minimal token pair the browser SDK needs to establish a session. Token/security-material responses are non-cacheable. Backup-code generation and 2FA reset require a fresh factor; backup-code replacement is atomic. Passkeys use the native Supabase browser SDK and therefore do not add portal HTTP routes. See [Authentication Flow](AUTHENTICATION_FLOW.md).

## Applications, passports, visas, and receipts

| Methods                 | Route                                |
| ----------------------- | ------------------------------------ |
| `POST`                  | `/api/nadra/add-application`         |
| `GET`                   | `/api/nadra/agent-options`           |
| `POST`                  | `/api/nadra/complaint`               |
| `POST`                  | `/api/nadra/manage-record`           |
| `GET`                   | `/api/nadra/metadata`                |
| `POST`                  | `/api/nadra/refund`                  |
| `GET`                   | `/api/nadra/status-history`          |
| `POST`                  | `/api/nadra/update-status`           |
| `GET`, `POST`, `DELETE` | `/api/applications/notes-read`       |
| `POST`                  | `/api/passports/pak/add-application` |
| `GET`, `POST`           | `/api/passports/pak/drafts`          |
| `POST`                  | `/api/passports/pak/manage-record`   |
| `GET`                   | `/api/passports/pak/metadata`        |
| `GET`, `POST`           | `/api/passports/pak/notes`           |
| `GET`                   | `/api/passports/pak/status-history`  |
| `POST`                  | `/api/passports/pak/update-custody`  |
| `POST`                  | `/api/passports/pak/update-status`   |
| `POST`                  | `/api/passports/gb/add`              |
| `POST`                  | `/api/passports/gb/delete`           |
| `GET`                   | `/api/passports/gb/metadata`         |
| `GET`                   | `/api/passports/gb/status-history`   |
| `POST`                  | `/api/passports/gb/update`           |
| `POST`                  | `/api/visas/add-application`         |
| `GET`                   | `/api/visas/metadata`                |
| `POST`                  | `/api/visas/save`                    |
| `POST`                  | `/api/visas/update-status`           |
| `POST`                  | `/api/receipts/generate`             |
| `GET`                   | `/api/receipts/list`                 |
| `POST`                  | `/api/receipts/share`                |
| `POST`                  | `/api/receipts/verify`               |

Application mutations are staff workflows and must derive the actor from the session. Receipt generation/list/share are protected; verification is the limited public exception. Receipt availability and fields differ by service—use [Receipt Operations](../guides/RECEIPT_OPERATIONS_GUIDE.md).

## Application document vault

| Methods       | Route                                   |
| ------------- | --------------------------------------- |
| `GET`, `POST` | `/api/documents`                        |
| `POST`        | `/api/documents/upload-direct`          |
| `POST`        | `/api/documents/upload`                 |
| `GET`         | `/api/documents/status`                 |
| `GET`         | `/api/documents/[documentId]/preview`   |
| `GET`         | `/api/documents/[documentId]/download`  |
| `GET`         | `/api/documents/[documentId]/thumbnail` |
| `DELETE`      | `/api/documents/[documentId]`           |
| `GET`         | `/api/documents/preview`                |
| `GET`         | `/api/documents/download`               |
| `GET`         | `/api/documents/signed-url`             |
| `GET`, `POST` | `/api/documents/zip`                    |
| `GET`         | `/api/documents/download-all`           |
| `GET`, `POST` | `/api/documents/migrate-scheduled`      |
| `GET`, `POST` | `/api/documents/migration-overview`     |

`POST /api/documents/upload-direct` is the supported server-owned upload: active staff, existing scope, maximum 1,500,000-byte file, PDF/JPEG/PNG/WebP, safe category/name, and matching signature/MIME/extension. Standalone metadata creation and the old upload path return `410`; download-all is also retired. Preview/download/delete/ZIP routes resolve a live database record before accessing an object key. See [Document Management](../guides/DOCUMENT_MANAGEMENT_GUIDE.md).

## Bookings

| Methods                  | Route                                   |
| ------------------------ | --------------------------------------- |
| `GET`, `POST`            | `/api/bookings`                         |
| `PATCH`                  | `/api/bookings/[id]`                    |
| `GET`                    | `/api/bookings/[id]/history`            |
| `POST`                   | `/api/bookings/[id]/no-show`            |
| `POST`                   | `/api/bookings/[id]/resend`             |
| `GET`                    | `/api/bookings/available-slots`         |
| `GET`, `PATCH`, `DELETE` | `/api/bookings/drafts`                  |
| `GET`, `PATCH`           | `/api/bookings/preferences`             |
| `GET`, `POST`, `PATCH`   | `/api/bookings/waitlist`                |
| `GET`                    | `/api/bookings/export`                  |
| `GET`                    | `/api/bookings/report`                  |
| `GET`                    | `/api/bookings/attendance/respond`      |
| `POST`                   | `/api/bookings/telemetry`               |
| `GET`, `PATCH`           | `/api/bookings/settings/branch`         |
| `GET`, `POST`            | `/api/bookings/settings/overrides`      |
| `DELETE`                 | `/api/bookings/settings/overrides/[id]` |
| `GET`, `POST`            | `/api/bookings/settings/services`       |
| `PATCH`, `DELETE`        | `/api/bookings/settings/services/[id]`  |
| `GET`, `PATCH`           | `/api/bookings/settings/reminders`      |

Availability derives from branch schedules/overrides, active service rules, capacity, group size, and existing/reserved bookings. Settings mutations require an active Admin, Master Admin, or Super Admin session before service-role access. The attendance-response route is a public tokenized, one-shot HTML flow; repeated or concurrent requests cannot apply a missed-attendance penalty twice. Public booking telemetry is schema-bound, size-bound, and rate-limited. See [Bookings](../guides/BOOKINGS_GUIDE.md).

## LMS and accounting

| Methods                   | Route                              |
| ------------------------- | ---------------------------------- |
| `GET`                     | `/api/accounting/applications`     |
| `GET`, `POST`             | `/api/lms`                         |
| `GET`                     | `/api/lms/installments`            |
| `POST`, `PATCH`, `DELETE` | `/api/lms/installment-payment`     |
| `POST`                    | `/api/lms/skip-installment`        |
| `POST`                    | `/api/lms/update-installments`     |
| `POST`                    | `/api/lms/delete-installment-plan` |
| `GET`, `POST`, `DELETE`   | `/api/lms/notes`                   |
| `GET`, `POST`             | `/api/lms/audit-logs`              |
| `GET`                     | `/api/lms/payment-methods`         |
| `POST`                    | `/api/lms/seed-service-categories` |

Current LMS money/installment mutations require the `20260812` schema capability and execute through service-role-only atomic PostgreSQL functions. Apply `scripts/migrations/20260812_update_lms_installments_atomically.sql` after the main secure LMS migration so batch due-date/amount edits also commit as one transaction. Retryable operations use idempotency keys; account pagination is global at the database layer. Routes fail when required schema capabilities are absent rather than falling back to partial multi-write behavior.

## Quotes, package folders, and groups

### Quotation routes

| Methods        | Route                                   |
| -------------- | --------------------------------------- |
| `GET`, `POST`  | `/api/packages`                         |
| `GET`, `PATCH` | `/api/packages/[id]`                    |
| `POST`         | `/api/packages/[id]/selection`          |
| `POST`         | `/api/packages/[id]/convert`            |
| `GET`          | `/api/packages/share/[token]`           |
| `POST`         | `/api/packages/share/[token]/selection` |

### Operational package routes

| Methods                | Route                                                                   |
| ---------------------- | ----------------------------------------------------------------------- |
| `GET`                  | `/api/travel-packages`                                                  |
| `GET`, `PATCH`         | `/api/travel-packages/[id]`                                             |
| `GET`, `POST`, `PATCH` | `/api/travel-packages/[id]/operations`                                  |
| `POST`                 | `/api/travel-packages/[id]/operations/sync`                             |
| `GET`, `POST`          | `/api/travel-packages/[id]/passengers`                                  |
| `PATCH`, `DELETE`      | `/api/travel-packages/[id]/passengers/[passengerId]`                    |
| `GET`, `POST`          | `/api/travel-packages/[id]/reservations`                                |
| `PATCH`, `DELETE`      | `/api/travel-packages/[id]/reservations/[reservationId]`                |
| `GET`, `POST`          | `/api/travel-packages/[id]/reservations/[reservationId]/items`          |
| `PATCH`                | `/api/travel-packages/[id]/reservations/[reservationId]/items/[itemId]` |
| `POST`                 | `/api/travel-packages/[id]/reservations/[reservationId]/refunds`        |
| `GET`, `POST`, `PATCH` | `/api/travel-packages/[id]/invoice`                                     |
| `POST`                 | `/api/travel-packages/[id]/invoice/amend`                               |
| `POST`                 | `/api/travel-packages/[id]/invoice/release`                             |
| `POST`                 | `/api/travel-packages/[id]/invoice/lines`                               |
| `PATCH`, `DELETE`      | `/api/travel-packages/[id]/invoice/lines/[lineId]`                      |
| `GET`, `POST`          | `/api/travel-packages/[id]/payments`                                    |
| `PATCH`, `DELETE`      | `/api/travel-packages/[id]/payments/[paymentId]`                        |
| `GET`, `POST`          | `/api/travel-packages/[id]/payment-plan`                                |
| `GET`, `POST`          | `/api/travel-packages/[id]/documents`                                   |
| `PATCH`, `DELETE`      | `/api/travel-packages/[id]/documents/[documentId]`                      |
| `GET`                  | `/api/travel-packages/[id]/documents/[documentId]/signed-url`           |
| `PATCH`                | `/api/travel-packages/[id]/documents/access`                            |
| `GET`, `POST`          | `/api/travel-packages/[id]/third-party-document-shares`                 |
| `PATCH`                | `/api/travel-packages/[id]/third-party-document-shares/[shareId]`       |
| `GET`, `POST`          | `/api/travel-packages/[id]/transport-vouchers`                          |
| `PATCH`                | `/api/travel-packages/[id]/transport-vouchers/[voucherId]`              |
| `GET`                  | `/api/travel-packages/[id]/transport-vouchers/[voucherId]/preview`      |
| `GET`, `POST`          | `/api/travel-packages/backups/reconcile`                                |
| `GET`                  | `/api/travel-packages/migration/status`                                 |
| `POST`                 | `/api/travel-packages/migration/scan`                                   |
| `POST`                 | `/api/travel-packages/migration/import`                                 |
| `GET`                  | `/api/package-documents/[token]`                                        |
| `POST`                 | `/api/package-portal/access`                                            |
| `POST`                 | `/api/package-third-party-documents/[token]`                            |

### Group routes

| Methods                          | Route                                             |
| -------------------------------- | ------------------------------------------------- |
| `GET`, `POST`                    | `/api/travel-package-groups`                      |
| `GET`, `PATCH`                   | `/api/travel-package-groups/[id]`                 |
| `POST`, `PATCH`, `DELETE`        | `/api/travel-package-groups/[id]/members`         |
| `POST`, `PUT`, `PATCH`, `DELETE` | `/api/travel-package-groups/[id]/shared-services` |

Internal quote/folder/group operations require an authenticated staff context and feature-specific permissions; backup reconciliation and legacy migration controls require Super Admin. Public serializers exclude internal component costs, internal notes, storage keys, and agent-only documents. Customer visibility is release-based, not inferred from object existence. See [Travel Packages](../guides/TRAVEL_PACKAGES_GUIDE.md).

## Timeclock

| Methods | Route                                     |
| ------- | ----------------------------------------- |
| `GET`   | `/api/timeclock/events`                   |
| `PATCH` | `/api/timeclock/events/[eventId]/adjust`  |
| `POST`  | `/api/timeclock/scan`                     |
| `GET`   | `/api/timeclock/notices`                  |
| `GET`   | `/api/timeclock/manual-entry/diagnostics` |
| `POST`  | `/api/timeclock/manual-entry/generate`    |
| `POST`  | `/api/timeclock/manual-entry/submit`      |
| `GET`   | `/api/timeclock/devices/activity`         |
| `GET`   | `/api/timeclock/devices/config`           |
| `POST`  | `/api/timeclock/devices/heartbeat`        |
| `POST`  | `/api/timeclock/devices/manual-code`      |

The staff QR-scan route validates the authenticated user and signed device QR payload. Physical-device endpoints use the signed `ptc1` device contract, nonce/timestamp replay controls, and active-device checks. Never expose device secrets or log signed payload material.

## Ticketing

| Methods        | Route                                                              |
| -------------- | ------------------------------------------------------------------ |
| `GET`, `POST`  | `/api/ticketing/ledger`                                            |
| `GET`, `PATCH` | `/api/ticketing/ledger/[bookingId]`                                |
| `GET`          | `/api/ticketing/bookings`                                          |
| `POST`         | `/api/ticketing/bookings/[bookingId]/transactions`                 |
| `PATCH`        | `/api/ticketing/bookings/[bookingId]/transactions/[transactionId]` |
| `GET`, `PUT`   | `/api/ticketing/bookings/[bookingId]/sectors`                      |
| `GET`          | `/api/ticketing/airports`                                          |
| `GET`          | `/api/ticketing/flight-monitor`                                    |
| `POST`         | `/api/ticketing/flight-monitor/[sectorId]/schedule-change`         |

The My Sales Ledger endpoint verifies an active Ticketing department member or Ticketing oversight
role, but always returns and creates records for the authenticated employee in this first slice.
Quick TK creation is one retry-safe database operation and performs duplicate confirmation and
package-PNR matching atomically. The detail route lazily loads and atomically completes customer,
journey, grouped sale/payment, and passenger-slot details with optimistic versions and retry-safe
conflict handling. The exact-PNR booking route uses bounded keyset pages so every own-agent match
remains reachable, and the child-transaction routes add issued DC/R-ER financial service movements
plus a separate Unpaid-to-Paid transition. Root-TK itinerary routes remain owner-only except for
reasoned Admin/Master Admin/Super Admin cover. Flight Monitoring is intentionally shared across all
agents but exposes only operational flight, passenger, contact, owner, and active schedule-case
context. Any authorised Ticketing employee may mark a suspected time/flight-number change; only
the responsible owner or reasoned Admin/Master Admin/Super Admin cover may review, dismiss, or
finalise it. API mutation responses and the ledger never expose calculated commission, earnings,
margin, or profit. See the [Ticketing API](../api/TICKETING.md).

## Frappe, HR, training, and dashboard services

| Methods       | Route                                              |
| ------------- | -------------------------------------------------- |
| `GET`         | `/api/integrations/frappe/health`                  |
| `GET`         | `/api/integrations/frappe/handoff`                 |
| `GET`         | `/api/integrations/frappe/provisioning/candidates` |
| `GET`, `POST` | `/api/integrations/frappe/provisioning/me`         |
| `POST`        | `/api/integrations/frappe/provisioning/transfer`   |
| `POST`        | `/api/integrations/frappe/reconcile`               |
| `POST`        | `/api/integrations/frappe/sync/pull`               |
| `POST`        | `/api/integrations/frappe/sync/push`               |
| `POST`        | `/api/integrations/frappe/webhook`                 |
| `GET`, `POST` | `/api/hr/leave/requests`                           |
| `PATCH`       | `/api/hr/leave/requests/[id]`                      |
| `GET`, `POST` | `/api/training`                                    |
| `GET`, `POST` | `/api/dashboard/modules`                           |
| `GET`         | `/api/dashboard/notice-board`                      |
| `GET`         | `/api/dashboard/notice-board/image`                |
| `POST`        | `/api/dashboard/notice-board/read`                 |
| `POST`        | `/api/issue-reports`                               |
| `POST`        | `/api/vitals`                                      |
| `GET`         | `/api/pricing/umrah-transport`                     |

Frappe staff routes require portal authorization; the webhook is signature-authenticated. Handoff tokens are short-lived and server-signed. See [Integrations](../guides/INTEGRATIONS_GUIDE.md) and [Frappe HRMS Setup](../guides/FRAPPE_HRMS_SETUP.md).

## Administration

| Methods                          | Route                                                        |
| -------------------------------- | ------------------------------------------------------------ |
| `GET`, `OPTIONS`, `POST`         | `/api/admin/add-employee`                                    |
| `POST`                           | `/api/admin/delete-employee`                                 |
| `POST`                           | `/api/admin/disable-enable-employee`                         |
| `POST`                           | `/api/admin/reset-password`                                  |
| `POST`                           | `/api/admin/recover-employee-2fa`                            |
| `GET`, `POST`, `PATCH`           | `/api/admin/timeclock/devices`                               |
| `GET`, `POST`                    | `/api/admin/server-control`                                  |
| `GET`, `POST`, `PATCH`, `DELETE` | `/api/admin/notice-board`                                    |
| `POST`                           | `/api/admin/notice-board/upload`                             |
| `GET`                            | `/api/admin/receipt-metrics`                                 |
| `GET`                            | `/api/admin/issue-reports`                                   |
| `GET`, `PATCH`                   | `/api/admin/issue-reports/[reportId]`                        |
| `GET`                            | `/api/admin/issue-reports/[reportId]/artifacts/[artifactId]` |
| `POST`                           | `/api/admin/create-installments`                             |
| `POST`                           | `/api/admin/create-installments-table`                       |
| `POST`                           | `/api/admin/clear-lms`                                       |
| `POST`                           | `/api/admin/clear-lms-data`                                  |
| `POST`                           | `/api/admin/wipe-installments`                               |
| `POST`                           | `/api/admin/migrate-installment-amounts`                     |
| `POST`                           | `/api/admin/migrate-names-lowercase`                         |
| `GET`, `POST`                    | `/api/admin/seed-countries`                                  |
| `POST`                           | `/api/admin/seed-payment-methods`                            |
| `GET`                            | `/api/admin/seed-presets`                                    |
| `POST`                           | `/api/admin/seed-pricing`                                    |

Admin route names include legacy verbs and are not a promise of REST semantics. Destructive security and infrastructure operations add stricter roles, target restrictions, confirmation fields, rate limits, and fresh TOTP/backup verification as defined by each route. `POST /api/admin/create-installments-table` is a schema-readiness check and returns `503` if the required LMS migration is absent; it does not create tables at runtime.

## Scheduled jobs

| Methods | Route                                                | Schedule in `vercel.json` |
| ------- | ---------------------------------------------------- | ------------------------- |
| `GET`   | `/api/cron/bookings/reminders`                       | Daily 06:00 UTC           |
| `GET`   | `/api/cron/issue-reports/cleanup`                    | Daily 03:00 UTC           |
| `GET`   | `/api/cron/passports/pak/drafts-cleanup`             | Daily 03:30 UTC           |
| `GET`   | `/api/cron/integrations/frappe/outbox`               | Daily 04:00 UTC           |
| `GET`   | `/api/cron/integrations/frappe/timeclock-attendance` | Daily 04:30 UTC           |

All five routes use the shared fail-closed cron authorization helper. Manual calls must send the same bearer header. Booking reminder links use `APP_BASE_URL`, then `NEXT_PUBLIC_SITE_URL`, then legacy `NEXT_PUBLIC_APP_URL`; the optional lookback is clamped to 15–1,440 minutes.

## Updating this reference

When adding, deleting, or changing a route:

1. Update the relevant table and cross-cutting contract here.
2. Add/update bounded validation and focused tests.
3. Update the corresponding field-level entry under `docs/api/`.
4. Run `npm run api:check-boundaries`, `npm run docs:check`, and `npm run docs:check-api`.
5. Update the feature guide when behavior, permissions, limits, environment values, or customer-visible fields changed.
