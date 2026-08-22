# PT-Portal

PT-Portal is Piyam Travel's internal operations platform. One Next.js application covers travel applications, appointment bookings, package quotations and operations, receipts, pricing, LMS/accounting, timeclock, training, staff administration, private document storage, and the Frappe HRMS bridge.

## Platform

- Next.js 16 App Router, React 18, TypeScript, and Tailwind CSS
- Supabase Auth and PostgreSQL data storage
- MinIO private document storage with an optional private R2 fallback
- Mailgun for operational email
- Frappe HRMS provisioning, synchronization, webhook, and signed handoff integration
- Vitest unit tests, Playwright smoke tests, and PostgreSQL 16 migration tests

The portal normally runs on Vercel. Supabase and the object stores are external services; Frappe runs separately and is reached through server-side integration routes.

## Quick start

Use Node.js 20.9 or newer.

```bash
git clone https://github.com/PiyamDev1/pt-portal.git
cd pt-portal
npm ci
cp .env.example .env.local
npm run dev
```

Add at least the three Supabase values and `RATE_LIMIT_HASH_SECRET` to `.env.local`; features that send email, store documents, or call Frappe need their corresponding integration values. Open `http://localhost:3000`.

Read [Getting Started](docs/guides/GETTING_STARTED.md) for the complete local setup and [Deployment Guide](docs/guides/DEPLOYMENT_GUIDE.md) before a release.

## Verification

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

Additional suites:

```bash
npm run test:smoke:install
npm run test:smoke
npm run test:db:ticketing
npm run test:db:lms
npm run test:db:security
```

The database commands require `psql` and a disposable PostgreSQL database in `DATABASE_TEST_URL`. The live smoke suite requires the `SMOKE_*` variables documented in [.env.example](.env.example).

## Documentation

- [Documentation home](docs/README.md)
- [Architecture](docs/guides/ARCHITECTURE_GUIDE.md)
- [Travel packages](docs/guides/TRAVEL_PACKAGES_GUIDE.md)
- [Detailed API contracts](docs/api/README.md)
- [API route inventory](docs/technical/API_REFERENCE.md)
- [Database and migrations](docs/technical/DATABASE_SCHEMA_OVERVIEW.md)
- [Authentication](docs/technical/AUTHENTICATION_FLOW.md)
- [Security](docs/technical/SECURITY.md)
- [Storage](docs/technical/STORAGE_SYSTEM.md)
- [Environment and deployment](docs/technical/DEPLOYMENT_ENVIRONMENT_SETUP.md)

The active guides and technical references describe current behavior. `docs/plans/`, `docs/operations/`, `docs/archive/`, and the point-in-time reports listed in [the docs index](docs/README.md#historical-and-supporting-material) are retained for context and are not implementation authority.

## Database changes

`scripts/migrations/` is the durable schema history. Apply pending migrations before deploying code that depends on them, then regenerate the checked-in Supabase schema types:

```bash
npm run types:supabase
```

Do not run integration fixtures against production. Do not expose `SUPABASE_SERVICE_ROLE_KEY`, object-store credentials, rate-limit secrets, cron tokens, or alert webhooks through `NEXT_PUBLIC_*` variables.

## Automation

GitHub Actions performs dependency auditing, linting, type checking, API-boundary checks, unit tests, formatting checks, production builds, database migration tests, authenticated smoke tests, documentation publishing, database backup, and document fallback migration. See [Deployment Guide](docs/guides/DEPLOYMENT_GUIDE.md#github-actions) for triggers and required secrets.
