# Deployment Guide

This guide covers how PT-Portal is typically deployed and what should be checked before and after release.

## Deployment shape

PT-Portal is usually deployed as:

- `Vercel` for the Next.js portal
- `Supabase` for auth and database
- `MinIO` for primary document storage
- `Mailgun` for outbound mail
- `Frappe HRMS` on a separate Ubuntu/Docker host

The repo also includes GitHub Actions for smoke tests, database backups, document migration cron, and GitHub Pages docs publishing.

## Required environment variables

Start from [.env.example](https://github.com/PiyamDev1/pt-portal/blob/main/.env.example).

Key production groups:

### Core portal

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`

### Email

- `MAILGUN_API_KEY`
- `MAILGUN_DOMAIN`

### Storage

- `MINIO_ENDPOINT`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET_NAME`
- `NEXT_PUBLIC_MINIO_ENDPOINT`

### Frappe

- `FRAPPE_BASE_URL`
- `FRAPPE_API_KEY`
- `FRAPPE_API_SECRET`
- `FRAPPE_WEBHOOK_SECRET`
- `FRAPPE_HANDOFF_SECRET`

### Server Control

- `HETZNER_API_TOKEN`
- `HETZNER_SERVER_ID`
- `HETZNER_SERVER_IP`
- `HETZNER_SERVER_LABEL`
- `SERVER_CONTROL_SERVICES`
- `SERVER_CONTROL_SERVICE_HEALTH_URLS`

`HETZNER_SERVER_IP` accepts an IPv4 address, a Hetzner IPv6 `/64`, or both separated by commas.

## Local-to-production rule

Do not rely on `.env.local` assumptions when documenting or debugging production behavior. Production should always be treated as its own config surface with explicit platform secrets.

## Vercel deployment flow

Typical release path:

1. Push to GitHub.
2. Let Vercel build from the connected repo.
3. Confirm all required environment variables are present in the target environment.
4. Validate the deployment health after release.

Before promoting important releases, run locally:

```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run build
```

If smoke-test secrets are configured, also run:

```bash
npm run test:smoke
```

## Database and migration flow

Database change management in this repo is migration-file driven.

Main location:

- `scripts/migrations/`

Apply the relevant SQL in Supabase before enabling features that depend on it. Examples:

- bookings upgrades
- security preferences
- passkeys
- Frappe identity map and handoff audit tables

For the latest Frappe handoff audit work, ensure [20260612_add_frappe_handoff_events.sql](https://github.com/PiyamDev1/pt-portal/blob/main/scripts/migrations/20260612_add_frappe_handoff_events.sql) has been applied.

## GitHub Actions in this repo

Current workflows:

- [db-backup.yml](https://github.com/PiyamDev1/pt-portal/blob/main/.github/workflows/db-backup.yml)
- [document-migration-cron.yml](https://github.com/PiyamDev1/pt-portal/blob/main/.github/workflows/document-migration-cron.yml)
- [smoke-tests.yml](https://github.com/PiyamDev1/pt-portal/blob/main/.github/workflows/smoke-tests.yml)
- [github-pages.yml](https://github.com/PiyamDev1/pt-portal/blob/main/.github/workflows/github-pages.yml)

### Smoke tests

Smoke tests are PR-triggered and manual-trigger capable. They depend on GitHub secrets for a real smoke-test account and base URL.

### Database backup

The backup workflow uses the Supabase CLI and uploads schema/data archives to S3-compatible storage.

### Document migration cron

The migration cron hits the scheduled document migration endpoint at a regular interval using a shared token.

### GitHub Pages docs

Docs are deployed from `docs/` via the GitHub Pages workflow. Enable Pages in repository settings and use the Actions deployment source.

## Release checklist

Before releasing:

- all required env vars are present
- required SQL migrations are applied
- `npx tsc --noEmit` passes
- `npm run lint` passes
- `npm run test:unit` passes
- `npm run build` passes
- smoke tests pass if the release touches critical flows

After releasing:

- login works
- dashboard loads
- key admin pages load
- document upload/preview works
- bookings load for enabled branches
- Frappe health endpoint returns expected status
- recent error logs are reviewed

## GitHub Pages setup

To publish docs:

1. Go to repository `Settings -> Pages`.
2. Set the source to `GitHub Actions`.
3. Push docs changes to `main` or trigger the workflow manually.

The source files are:

- [docs/index.md](../index.md)
- [docs/\_config.yml](../_config.yml)
- [docs/README.md](../README.md)

## Related docs

- [GETTING_STARTED.md](GETTING_STARTED.md)
- [INTEGRATIONS_GUIDE.md](INTEGRATIONS_GUIDE.md)
- [FRAPPE_HRMS_SETUP.md](FRAPPE_HRMS_SETUP.md)
- [../technical/DEPLOYMENT_ENVIRONMENT_SETUP.md](../technical/DEPLOYMENT_ENVIRONMENT_SETUP.md)
