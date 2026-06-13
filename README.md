# PT-Portal

PT-Portal is an internal operations platform for Piyam Travel. It combines travel application handling, staff/admin tooling, pricing, appointment bookings, document storage, LMS/payment tracking, timeclock features, and an IMS-controlled Frappe HRMS bridge in one Next.js + Supabase codebase.

The application is built for a real operating environment rather than a demo flow. That means the repo includes API routes, database migrations, storage failover logic, security controls, smoke tests, cron workflows, and operational documentation alongside the frontend.

## What this repo contains

- Next.js 16 App Router application
- Supabase-backed auth and data access
- Travel application modules for NADRA, passports, visas, and receipts
- Appointment bookings with branch schedules, reminders, no-show handling, waitlist, and audit logs
- Document management backed by MinIO primary storage with fallback support
- IMS-to-Frappe HRMS provisioning, webhook sync, and signed handoff flow
- GitHub Actions for smoke tests, database backup, and document migration cron

## Core stack

- Framework: `Next.js 16`
- UI: `React 18`, `TypeScript`, `Tailwind CSS`
- Database/Auth: `Supabase`
- Storage: `MinIO` with fallback object storage support
- Notifications: `Mailgun`
- Integrations: `Frappe HRMS`
- Deployment: `Vercel` for the portal, Ubuntu/Docker/Coolify for Frappe

## Quick start

1. Clone the repository.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Fill in the required Supabase, storage, mail, and Frappe variables.
5. Run `npm run dev`.
6. Open `http://localhost:3000`.

The detailed setup path lives in [Getting Started](docs/guides/GETTING_STARTED.md) and the deployment/runtime details live in [Deployment Guide](docs/guides/DEPLOYMENT_GUIDE.md).

## Documentation map

The documentation is split into a GitHub-friendly docs site and deeper guide/reference files under `docs/`.

- Docs home: [docs/README.md](docs/README.md)
- GitHub Pages landing page source: [docs/index.md](docs/index.md)
- Setup and onboarding: [docs/guides/GETTING_STARTED.md](docs/guides/GETTING_STARTED.md)
- Day-to-day product usage: [docs/guides/USAGE_GUIDE.md](docs/guides/USAGE_GUIDE.md)
- Deployment and release flow: [docs/guides/DEPLOYMENT_GUIDE.md](docs/guides/DEPLOYMENT_GUIDE.md)
- Integrations and external services: [docs/guides/INTEGRATIONS_GUIDE.md](docs/guides/INTEGRATIONS_GUIDE.md)
- Frappe HRMS setup: [docs/guides/FRAPPE_HRMS_SETUP.md](docs/guides/FRAPPE_HRMS_SETUP.md)
- Architecture: [docs/guides/ARCHITECTURE_GUIDE.md](docs/guides/ARCHITECTURE_GUIDE.md)
- API reference: [docs/technical/API_REFERENCE.md](docs/technical/API_REFERENCE.md)

## Development commands

```bash
npm run dev
npm run build
npm start
npm run lint
npm run lint:fix
npm run format
npm run format:check
npm run test:unit
npm run test:smoke
```

There is no dedicated `type-check` script right now. Use `npx tsc --noEmit` when you want a standalone TypeScript check.

## Environment variables

The baseline variables are documented in [.env.example](.env.example). Main groups:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`
- `MINIO_*`, `NEXT_PUBLIC_MINIO_ENDPOINT`
- `FRAPPE_*`

Do not commit real secrets. Use `.env.local` locally and your platform secret store in deployment.

## GitHub Pages documentation

This repo now includes a GitHub Pages publishing workflow:

- Workflow: [.github/workflows/github-pages.yml](.github/workflows/github-pages.yml)
- Site source: `docs/`
- Landing page: [docs/index.md](docs/index.md)
- Jekyll config: [docs/\_config.yml](docs/_config.yml)

Once GitHub Pages is enabled for the repository's Actions-based deployment, the docs site can be published directly from the `docs/` folder contents.

## Recommended reading order

If you are new to the repo:

1. [docs/README.md](docs/README.md)
2. [docs/guides/GETTING_STARTED.md](docs/guides/GETTING_STARTED.md)
3. [docs/guides/ARCHITECTURE_GUIDE.md](docs/guides/ARCHITECTURE_GUIDE.md)
4. [docs/guides/USAGE_GUIDE.md](docs/guides/USAGE_GUIDE.md)
5. [docs/guides/INTEGRATIONS_GUIDE.md](docs/guides/INTEGRATIONS_GUIDE.md)

If you are deploying:

1. [docs/guides/DEPLOYMENT_GUIDE.md](docs/guides/DEPLOYMENT_GUIDE.md)
2. [docs/guides/FRAPPE_HRMS_SETUP.md](docs/guides/FRAPPE_HRMS_SETUP.md)
3. [docs/technical/SECURITY.md](docs/technical/SECURITY.md)

## Current status

The portal is active and substantial. Some modules, especially bookings and paired PWA/Frappe flows, are still evolving operationally. The docs are written to reflect the real current state rather than pretending every area is fully settled.
