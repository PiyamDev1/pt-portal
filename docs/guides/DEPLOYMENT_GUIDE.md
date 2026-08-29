# Deployment Guide

Last verified against the repository: August 16, 2026.

## Runtime topology

- Vercel: Next.js portal and configured cron routes
- Supabase: Auth and PostgreSQL
- MinIO: primary private document/package storage
- Optional R2: application-vault fallback
- Optional R3: travel-package backup copy
- Mailgun: outbound operational email
- Frappe HRMS: separate server/application reached through the bridge

Start with `.env.example`; it is the committed deployment-variable checklist. Store production values in the platform secret manager, never in the repository.

## Release order

1. Review the code and migration diff.
2. Apply required SQL migrations to the target Supabase project in filename order.
3. Regenerate/commit Supabase types if the deployed schema changed.
4. Configure the target environment and workflow secrets.
5. Run the proportional verification suites.
6. Deploy the application.
7. Perform post-deploy checks and review correlated error/alert events.

Deploy schema before code when new routes require a table/function/marker. The LMS/security routes fail readiness/limits closed when their required 20260812 migrations are absent. The batch installment route also requires the follow-up LMS function migration.

## Environment groups

Required for the core portal/security boundary:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RATE_LIMIT_HASH_SECRET`
- `NEXT_PUBLIC_SITE_URL`

Feature groups from `.env.example`:

- Mail: `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_SENDER_EMAIL`, and optional `MAILGUN_ENDPOINT`
- Application vault: `MINIO_*`, optional `R2_*`, `DOCUMENT_MIGRATION_CRON_TOKEN`
- Package storage/migration: `MINIO_PACKAGES_BUCKET_NAME`, optional `R3_*`, legacy Firebase values
- Frappe: `FRAPPE_*`
- Server controls: `HETZNER_*`, `SERVER_CONTROL_*`
- Alerts: optional `OBSERVABILITY_ALERT_WEBHOOK_URL`
- Live tests: `SMOKE_*`

### Supabase Auth passkey configuration

Passkeys are a native, currently experimental Supabase Auth capability and require the pinned
passkey-capable `@supabase/supabase-js` version in this repository. Before deploying passkey UI:

1. Open the target Supabase project's Authentication provider/sign-in settings and enable
   Passkeys.
2. Set a stable display name, for example `Piyam Travels IMS`.
3. Set the relying-party ID to the production portal's registrable host. For the committed
   `NEXT_PUBLIC_SITE_URL=https://piyamtravels.com`, use `piyamtravels.com`.
4. Add the exact HTTPS portal origin, `https://piyamtravels.com`, to the allowed WebAuthn origins.
   Configure preview/local origins only in the appropriate non-production project; origin includes
   scheme and port, while RP ID is a host name.
5. Verify registration, discoverable/conditional sign-in, rename/delete, TOTP-protected
   management, and logout on at least Android/Chrome, iOS/Safari, and Windows/Edge or Chrome.

Do not change the production RP ID casually: WebAuthn credentials are scoped to it, so existing
passkeys may stop matching. The browser option `auth.experimental.passkey: true` is already
centralized in `lib/auth/browserSupabase.ts`; no passkey secret or environment variable is needed.
If the provider is disabled or misconfigured, password, TOTP/backup-code, and Microsoft recovery
paths remain available.

The Vercel cron handlers require `Authorization: Bearer <CRON_SECRET>`. A missing or blank server configuration fails closed with `503`; a missing or invalid bearer value returns `401`. The `x-vercel-cron` header is not authentication. Booking reminders use `APP_BASE_URL`, then `NEXT_PUBLIC_SITE_URL`, then the legacy `NEXT_PUBLIC_APP_URL` fallback to construct attendance links. Configure `CRON_SECRET` and an absolute canonical base URL in production.

All service-role, Mailgun, storage, cron, rate-limit, Frappe, Hetzner, and alert values are server-only. A `NEXT_PUBLIC_*` variable is shipped to browsers.

## Pre-deploy verification

```bash
npm ci
npm run audit:ci
npm run lint
npm run typecheck
npm run test:unit
npm run format:check
npm run docs:check
npm run docs:check-api
npm run api:check-boundaries
npm run build
```

When relevant:

```bash
npm run test:db:lms
npm run test:db:security
npm run test:smoke
```

Database tests require a disposable `DATABASE_TEST_URL`. Live smoke tests require the configured deployment/account/scope secrets and TOTP or the one-use backup fallback.

## Database deployment

Executable migrations under `scripts/migrations/` are authoritative. Do not use runtime APIs to create production schema. After applying schema changes:

```bash
npm run types:supabase
```

The latest cross-cutting required migrations are:

- `20260812_secure_atomic_lms_operations.sql`
- `20260812_security_rate_limits.sql`
- `20260812_update_lms_installments_atomically.sql`

Apply all three in filename order. Do not deploy the batch installment route until `lms_update_installments(jsonb)` exists and is executable only by `service_role`.

Feature migrations remain required for bookings, receipts, security preferences/events, documents,
Frappe, training, timeclock hardware, Pakistani passport drafts, and travel packages. Native
passkeys require the Supabase Auth provider configuration above, not a portal public-schema
migration. See [Database Schema Overview](../technical/DATABASE_SCHEMA_OVERVIEW.md) and
[Travel Packages](TRAVEL_PACKAGES_GUIDE.md).

## GitHub Actions

| Workflow                      | Trigger                                 | Responsibility                                                                                                      |
| ----------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `quality.yml`                 | push/PR to `main`, manual               | audit, repository-wide lint, types, API boundaries, unit tests, changed-file formatting, documentation links, build |
| `database-integration.yml`    | relevant push/PR paths, manual          | PostgreSQL 16 LMS and security migration tests                                                                      |
| `smoke-tests.yml`             | PR to `main`, manual                    | authenticated live Playwright suite and report artifact                                                             |
| `db-backup.yml`               | daily 02:00 UTC, manual                 | linked Supabase schema/data dump to S3-compatible storage, 30-day default retention                                 |
| `document-migration-cron.yml` | every ten minutes, manual               | bounded R2-to-MinIO migration endpoint call                                                                         |
| `github-pages.yml`            | docs/root README push to `main`, manual | Jekyll build and GitHub Pages deployment                                                                            |

Repository secrets outside application runtime include:

- backup: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `S3_BACKUP_BUCKET`, `S3_ENDPOINT_URL`, and AWS credentials/region;
- document worker: `APP_BASE_URL`, `DOCUMENT_MIGRATION_CRON_TOKEN`; and
- smoke: required `SMOKE_BASE_URL`, user credentials, branch code, family scope, plus optional mutation/package/LMS/receipt values.

The smoke workflow intentionally fails when its required account/base secrets are missing.

## Vercel cron schedule

`vercel.json` currently schedules:

- booking reminders daily at 06:00 UTC;
- issue-report cleanup daily at 03:00 UTC;
- Pakistani passport draft cleanup daily at 03:30 UTC;
- Frappe outbox daily at 04:00 UTC; and
- Frappe timeclock attendance daily at 04:30 UTC;
- Ticketing time-limit processing daily at 05:00 UTC; and
- Ticketing AeroDataBox flight monitoring daily at 05:30 UTC; and
- Commission non-payable shadow processing daily at 05:45 UTC.

Every Vercel cron request must carry the bearer secret configured by Vercel. Commission processing additionally requires `COMMISSION_CRON_ACTOR_EMPLOYEE_ID` to identify an active authorised Admin/HR audit actor. The separate document migration schedule is GitHub Actions, not Vercel. Its endpoint prefers `DOCUMENT_MIGRATION_CRON_TOKEN` and falls back to `CRON_SECRET` only when the dedicated token is not configured; configure the dedicated token for the workflow so the two automation boundaries remain independently rotatable.

## Post-deploy checks

- Password, Microsoft, explicit passkey, and conditional passkey login work; employee
  status/branch and required assurance checks still run.
- Dashboard and role-scoped admin pages load.
- Shared limiter returns normal responses and records no unexpected `503`.
- Application document upload, preview, download, deletion, and status work.
- LMS payment/installment mutations, atomic batch rescheduling, and global pagination work.
- Package quote share, conversion, financial operations, and released portal content work if changed.
- Booking availability/reminder behavior works if changed.
- Frappe health/handoff works if changed.
- Request IDs are present on correlated API failures and trusted alerts contain no secrets.
- Backup/migration/smoke workflows have valid secrets and recent successful runs.

## Rollback

Application rollback is a redeploy of the previous known-good commit/config. Database rollback must follow the specific migration's compatibility strategy; do not blindly reverse a data migration. If code depends on a new irreversible schema, deploy a forward-compatible corrective migration before/with the application fix.

Record which deployment, migrations, environment changes, and external providers were involved. Rotate any secret that may have been exposed.

## Documentation publishing

Enable GitHub Pages with GitHub Actions as the source. The workflow builds `docs/index.md` with `docs/_config.yml` and deploys the resulting Jekyll site.
