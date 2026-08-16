# Integrations Guide

Last verified against the repository: August 16, 2026.

`.env.example` is the committed variable checklist. Keep every credential/token server-only unless the name intentionally begins with `NEXT_PUBLIC_`; configure real values in local/platform secret storage.

## Integration map

| Provider        | Responsibility                                                                       | Failure is visible as                                                        |
| --------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Supabase        | Auth, PostgreSQL, RLS, RPCs, linked type generation                                  | Login/session errors, schema/readiness `503`, database failures              |
| MinIO           | Primary application documents, package documents, and default issue-report artifacts | Upload/preview/health failure; optional fallback may activate                |
| R2              | Optional private application-vault and issue-artifact fallback                       | Fallback unavailable or migration backlog                                    |
| R3              | Optional travel-package backup object store                                          | Package backup reconciliation degraded; primary remains MinIO                |
| Mailgun         | Operational email                                                                    | Booking, application-assignment, and admin notification warnings or failures |
| Frappe HRMS     | Employee provisioning, HR sync, leave, webhook, signed browser handoff               | Health/provisioning/sync/handoff errors                                      |
| Vercel          | Next.js runtime and five scheduled cron invocations                                  | Deployment/runtime/cron failures                                             |
| GitHub Actions  | Quality/DB/smoke/docs, database backup, document migration                           | Failed workflow/check or stale backup/migration run                          |
| Hetzner Cloud   | Super Admin server status/power control                                              | Server-control provider/health error                                         |
| Legacy Firebase | Read-only source for one-time package migration                                      | Scan/import unavailable; normal packages unaffected                          |
| Alert webhook   | Optional trusted receiver for redacted operational alerts                            | Delivery warning in server logs; original API response remains authoritative |

## Supabase

Core values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- independent `RATE_LIMIT_HASH_SECRET`

The anon key participates in cookie-backed user sessions and RLS. The service-role key bypasses RLS and must appear only in server code after explicit authorization. Apply required migrations before dependent code and regenerate types with `npm run types:supabase` after the linked project changes.

Microsoft SSO, TOTP, and native passkeys are mediated through the Supabase Auth project. Configure
the providers, OAuth redirects, passkey RP ID, and allowed WebAuthn origins in Supabase; keep the
portal callback/origin aligned with `NEXT_PUBLIC_SITE_URL`. Passkey challenge state, credentials,
counters, and resulting sessions belong to Supabase Auth, not portal public-schema tables.

## Object storage

### Primary MinIO

`MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_REGION`, and bucket values configure the S3-compatible server client. `MINIO_BUCKET_NAME` defaults application documents; `MINIO_PACKAGES_BUCKET_NAME` separates package objects. `ISSUE_REPORTS_MINIO_BUCKET_NAME` can override the artifact bucket.

`NEXT_PUBLIC_MINIO_ENDPOINT` is display/health metadata only. It is not a credential and must not be used for browser object authorization.

### Application R2 fallback

`R2_ENDPOINT`, credentials, and `R2_BUCKET_NAME` enable private fallback writes for application documents. `R2_PING_URL` is only an optional health/display endpoint; `ISSUE_REPORTS_R2_BUCKET_NAME` can isolate report artifacts. The GitHub document-migration workflow uses `DOCUMENT_MIGRATION_CRON_TOKEN` to move bounded batches back to MinIO.

### Package R3 backup

`R3_ENDPOINT`, `R3_ACCESS_KEY_ID`, `R3_SECRET_ACCESS_KEY`, `R3_BUCKET_NAME`, and optional `R3_PUBLIC_URL` configure the package backup provider. The code calls this integration R3 to avoid colliding with the application-vault `R2_*` keys. MinIO remains package primary; Super Admin reconciliation reports/copies backup state.

All buckets containing customer/staff documents should be private. Access is issued only after a database record/token check through short-lived signed URLs. See [Storage System](../technical/STORAGE_SYSTEM.md).

## Mailgun

`MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_SENDER_EMAIL`, and optional `MAILGUN_ENDPOINT` configure outbound mail.

Mail is used for booking confirmations/changes/cancellations/reminders, selected staff/application notifications, and administrative temporary-password delivery. A database mutation may succeed while a non-transactional email reports a warning; show the warning without pretending the underlying operation failed.

Do not log message bodies or provider credentials. Check the route's response, persisted email/audit row where available, and Mailgun delivery logs using a request/record ID.

## Frappe HRMS

Required integration values:

- `FRAPPE_BASE_URL`
- either `FRAPPE_API_KEY` plus `FRAPPE_API_SECRET`, or `FRAPPE_API_TOKEN`
- `FRAPPE_WEBHOOK_SECRET`
- `FRAPPE_HANDOFF_SECRET`

PT-Portal owns portal identity and maps/provisions employees into Frappe. The bridge supports health, candidate/self provisioning, transfer, push/pull sync, conflict/reconciliation queues, an authenticated webhook inbox, and a short-lived signed handoff. Handoff and webhook secrets have different purposes and must not be reused.

Scheduled outbox and timeclock-attendance work is invoked through the portal's `CRON_SECRET` routes. Full deployment, proxy, hook, and rollout requirements are in [Frappe HRMS Setup](FRAPPE_HRMS_SETUP.md).

## Vercel scheduled jobs

Every `/api/cron/*` route requires `Authorization: Bearer <CRON_SECRET>`. Vercel supplies that header for configured cron jobs. Missing server configuration returns `503`; an invalid/absent credential returns `401`; `x-vercel-cron` alone is ignored.

Booking reminders require an absolute URL. Resolution order is `APP_BASE_URL`, `NEXT_PUBLIC_SITE_URL`, then legacy `NEXT_PUBLIC_APP_URL`. `BOOKING_REMINDER_CRON_LOOKBACK_MINUTES` is optional and clamped from 15 to 1,440 minutes.

See [Deployment](DEPLOYMENT_GUIDE.md#vercel-cron-schedule) for the exact schedules. The document migration endpoint is invoked by a separate GitHub Actions worker. It prefers `DOCUMENT_MIGRATION_CRON_TOKEN` and falls back to `CRON_SECRET` only when the dedicated token is not configured.

## GitHub Actions and backup storage

Repository workflows cover:

- dependency audit, repository lint, types, API boundaries, unit tests, formatting, documentation links, and build;
- disposable PostgreSQL LMS/security migration checks;
- authenticated Playwright smoke tests;
- GitHub Pages documentation;
- daily Supabase dump to S3-compatible backup storage; and
- ten-minute application-document fallback migration.

Workflow-only database-backup and smoke secrets are documented in [Deployment](DEPLOYMENT_GUIDE.md#github-actions). Use dedicated least-privilege backup credentials and verify restore behavior, not just upload success.

## Hetzner server control

`HETZNER_API_TOKEN`, `HETZNER_SERVER_ID`, address/label, and `SERVER_CONTROL_*` values feed the Super Admin server-control panel. Status/health reads and power actions are server-side. Power operations require the exact authorized role, an explicit operation, and a fresh TOTP or backup code. Never expose the provider token or accept a caller-selected server ID.

## Legacy Firebase migration

`LEGACY_BOOKINGS_FIREBASE_PROJECT_ID`, service-account email, and private key are used only by Super Admin travel-package migration scan/import routes. They do not participate in normal quote or folder reads. Preserve newline escaping in the private key, limit service-account access to the source project, and remove/rotate the credential after migration is complete.

## PDF/Chromium runtime

Package transport vouchers and related PDF work can use Chromium. The deployment keeps Chromium packages server-external; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` only when the target runtime needs an explicit binary. PDF.js application-document previews instead use the checked-in worker synchronized by `npm run sync:pdf-worker`.

## Observability webhook

`OBSERVABILITY_ALERT_WEBHOOK_URL` may point to one trusted fixed receiver for redacted high-value operational events. Events include request IDs and bounded context. Callers cannot select the destination; alert delivery has a timeout and does not replace the original request result.

## Triage order

1. Capture the route, status, safe error text, request ID, target environment, and time.
2. Check the relevant environment group without printing its values.
3. Check schema/readiness markers and recent deployments/workflows.
4. Check the provider health/status panel and correlated provider logs.
5. Confirm scope/role/token/expiry before treating an authorization failure as provider downtime.
6. Rotate any credential that might have appeared in a browser, log, screenshot, or ticket.
