# Deployment and Environment Setup

This reference complements the operational [Deployment Guide](../guides/DEPLOYMENT_GUIDE.md). `.env.example`, workflow YAML, and `vercel.json` are the executable configuration sources.

## Configuration classes

| Class              | Examples                                                     | Exposure                                  |
| ------------------ | ------------------------------------------------------------ | ----------------------------------------- |
| Browser-public     | Supabase URL/anon key, site URL, display-only MinIO endpoint | `NEXT_PUBLIC_*`; bundled into client code |
| Server credentials | service-role, Mailgun, storage, Frappe, Hetzner              | platform secrets only                     |
| Security controls  | rate-limit pepper, cron/migration tokens, alert webhook      | independent server-only secrets           |
| CI-only            | backup credentials, smoke account/scope, disposable DB URL   | GitHub environment/repository secrets     |

Do not reuse one security secret for multiple roles. Do not put real secrets, credentials, or private tokens in `.env.example`, source, logs, tests, or documentation; public example URLs and non-secret identifiers must still be reviewed before reuse in another environment.

## Runtime requirements

The core application needs Node.js 20.9+, the three Supabase values, `RATE_LIMIT_HASH_SECRET`, and the canonical public site URL. A feature can render without every external integration, but calls to its provider will fail until its group is configured.

Storage credentials must point at private S3-compatible buckets. The R2 endpoint is the S3 API endpoint. Package R3 is a backup provider, not a replacement for package MinIO primary storage.

`OBSERVABILITY_ALERT_WEBHOOK_URL` must be a trusted fixed receiver. It receives redacted operational events and request IDs; callers cannot select the destination.

## Scheduled work

Every Vercel cron route requires an exact `Authorization: Bearer <CRON_SECRET>` header. Missing server configuration returns `503`; invalid or absent credentials return `401`. The `x-vercel-cron` header alone is ignored. Commission shadow processing also requires `COMMISSION_CRON_ACTOR_EMPLOYEE_ID`, set to an active Admin/HR employee who is authorised to manage Commission policies; that employee is recorded as the audit actor. Booking-attendance links use `APP_BASE_URL`, then `NEXT_PUBLIC_SITE_URL`, then the legacy `NEXT_PUBLIC_APP_URL` fallback. The document fallback migration runs from a separate GitHub workflow and prefers `DOCUMENT_MIGRATION_CRON_TOKEN`, falling back to `CRON_SECRET` only when that dedicated token is absent.

Database backup configuration lives entirely in the backup workflow secrets and should use a dedicated S3-compatible bucket/credentials with retention access.

## Build/runtime notes

- `npm ci` runs the `postinstall` PDF-worker sync unless CI deliberately uses `--ignore-scripts`.
- `next.config.js` keeps the Chromium packages server-external for PDF/voucher rendering.
- Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` only when the deployment needs a specific browser binary.
- Auth endpoints are non-cacheable; private document and security responses should remain private/no-store.

## Release checklist

1. Apply required migrations and verify capability markers/functions.
2. Regenerate Supabase types after schema deployment.
3. Confirm application and workflow secrets in the exact target environment.
4. Run the quality suite plus applicable database/smoke checks.
5. Deploy, exercise critical workflows, and review correlated logs/alerts.
6. Verify scheduled jobs, backup retention, and document migration after infrastructure changes.

Never run integration fixtures against production. Never use the API-boundary baseline update to conceal newly unvalidated request bodies.
