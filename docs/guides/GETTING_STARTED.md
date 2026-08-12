# Getting Started

This is the shortest reliable path from a clean checkout to a working PT-Portal development environment.

## Prerequisites

- Node.js 20.9 or newer
- npm and Git
- Supabase project access for authenticated/data-backed work
- Optional: `psql` and a disposable PostgreSQL database for migration integration tests

The production dependencies are external. MinIO/R2, Mailgun, Frappe, Hetzner, and live smoke credentials are needed only for the features that use them.

## Install and configure

```bash
git clone https://github.com/PiyamDev1/pt-portal.git
cd pt-portal
npm ci
cp .env.example .env.local
```

Use `npm ci` for a reproducible checkout. Use `npm install` when intentionally changing dependencies and commit the resulting lockfile.

Minimum server-backed configuration:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RATE_LIMIT_HASH_SECRET=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`RATE_LIMIT_HASH_SECRET` must be a long, independent, server-only secret. Do not reuse a Supabase key and do not add a `NEXT_PUBLIC_` prefix.

Copy other values from [.env.example](https://github.com/PiyamDev1/pt-portal/blob/main/.env.example) when exercising the matching capability:

- `MAILGUN_*` for outbound email and staff onboarding/reset flows
- `MINIO_*` and optional `R2_*` for the private document vault
- `R3_*` for travel-package backup storage
- `FRAPPE_*` for HRMS provisioning, sync, webhook, and handoff
- `HETZNER_*` and `SERVER_CONTROL_*` for Super Admin server controls
- `OBSERVABILITY_ALERT_WEBHOOK_URL` for trusted operational alerts
- `SMOKE_*` for live Playwright tests

All credentials, cron tokens, peppers, and webhook destinations are server-only unless `.env.example` explicitly names them `NEXT_PUBLIC_*`.

## Run locally

```bash
npm run dev
```

Open `http://localhost:3000`. A useful first check is that the login page loads, an active employee can authenticate, and protected dashboard navigation works.

## Baseline verification

Run the checks relevant to a change:

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run format:check
npm run docs:check
npm run docs:check-api
npm run api:check-boundaries
npm run build
```

`npm run format` rewrites the repository; use it only when that is intended. CI checks only changed-file formatting for normal pull requests and separately runs lint, types, unit tests, documentation links, detailed API coverage, API boundaries, audit, and the production build.

## Browser smoke tests

Install Chromium once:

```bash
npm run test:smoke:install
```

For a live deployment, set `SMOKE_BASE_URL`, the required smoke account/scope variables, and either `SMOKE_2FA_TOTP_SECRET` or the one-time backup-code fallback. Then run:

```bash
npm run test:smoke
```

If `PLAYWRIGHT_BASE_URL` is unset, Playwright starts the local Next.js development server. The authenticated setup project writes state under `.playwright/`; reports and test results are ignored by Git.

## Database migration tests

Set `DATABASE_TEST_URL` to a disposable PostgreSQL database and run:

```bash
npm run test:db:lms
npm run test:db:security
```

These scripts install fixtures and exercise migrations, transactions, and concurrency. Never point them at production or a database containing data that must be retained.

## Supabase schema types

After deploying a database migration, authenticate and link the Supabase CLI, then regenerate the committed schema:

```bash
npm run types:supabase
```

The generator preserves the existing file if the CLI does not return a valid `Database` definition. See [Type Safety and Request Validation](../technical/TYPE_SAFETY.md).

## Repository map

| Path                  | Responsibility                                               |
| --------------------- | ------------------------------------------------------------ |
| `app/`                | App Router pages, feature-local UI, and route handlers       |
| `components/`         | Reusable app-native dialogs and modal primitives             |
| `hooks/`              | Live shared React hooks                                      |
| `lib/`                | Shared domain, auth, security, storage, and integration code |
| `types/`              | Generated Supabase schema and compatibility database types   |
| `scripts/migrations/` | Durable SQL schema history                                   |
| `scripts/ci/`         | CI ratchets and PostgreSQL integration runners               |
| `tests/unit/`         | Vitest unit and route tests                                  |
| `tests/integration/`  | Real-PostgreSQL fixtures and assertions                      |
| `tests/smoke/`        | Authenticated Playwright smoke tests                         |
| `docs/`               | Product, operations, and technical documentation             |

Continue with [Architecture](ARCHITECTURE_GUIDE.md), [Security](../technical/SECURITY.md), and [Integrations](INTEGRATIONS_GUIDE.md).

## Troubleshooting

### Authentication or data access fails

Verify the three Supabase values, confirm the database migrations are deployed, and ensure the Auth user has an active `employees` record. A service-role key enables privileged database access but never authenticates the caller.

### Sensitive APIs return `503`

Confirm `RATE_LIMIT_HASH_SECRET` exists and `20260812_security_rate_limits.sql` is deployed. Sensitive routes fail closed when the shared limiter is unavailable.

### Storage or email fails

Those features require real provider credentials. Check [Storage System](../technical/STORAGE_SYSTEM.md) or [Integrations](INTEGRATIONS_GUIDE.md); do not work around missing server credentials by exposing them to the browser.

### Frappe handoff fails

Verify every `FRAPPE_*` value and the matching Frappe bridge site configuration. Follow [Frappe HRMS Setup](FRAPPE_HRMS_SETUP.md).
