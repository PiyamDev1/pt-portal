# Quick Reference

This page is the short operational cheat sheet for PT-Portal.

## Local setup

```bash
git clone https://github.com/PiyamDev1/pt-portal.git
cd pt-portal
npm install
cp .env.example .env.local
npm run dev
```

## Core commands

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
npx tsc --noEmit
```

## High-signal file locations

| Path                  | Purpose                                     |
| --------------------- | ------------------------------------------- |
| `app/api/`            | Next.js route handlers                      |
| `app/dashboard/`      | Protected dashboard pages                   |
| `app/login/`          | Login and 2FA flows                         |
| `lib/`                | Shared helpers, storage, auth, integrations |
| `scripts/migrations/` | SQL migrations                              |
| `docs/`               | Documentation source                        |
| `.github/workflows/`  | GitHub automation                           |

## Environment variables

Baseline local auth:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Operational integrations:

```env
MAILGUN_API_KEY=
MAILGUN_DOMAIN=
MINIO_ENDPOINT=
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
MINIO_BUCKET_NAME=
NEXT_PUBLIC_MINIO_ENDPOINT=
FRAPPE_BASE_URL=
FRAPPE_API_KEY=
FRAPPE_API_SECRET=
FRAPPE_WEBHOOK_SECRET=
FRAPPE_HANDOFF_SECRET=
```

## Main docs

- Setup: [GETTING_STARTED.md](GETTING_STARTED.md)
- Usage: [USAGE_GUIDE.md](USAGE_GUIDE.md)
- Architecture: [ARCHITECTURE_GUIDE.md](ARCHITECTURE_GUIDE.md)
- Deployment: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- Integrations: [INTEGRATIONS_GUIDE.md](INTEGRATIONS_GUIDE.md)
- Frappe HRMS: [FRAPPE_HRMS_SETUP.md](FRAPPE_HRMS_SETUP.md)

## Validation flow

Before pushing meaningful changes:

```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run build
```

For frontend flows that matter in production, also run smoke tests if the secrets are configured:

```bash
npm run test:smoke
```

## Troubleshooting

### Local server will not start

- Check Node version
- Re-run `npm install`
- Check `.env.local`

### TypeScript script confusion

There is no `npm run type-check` script in this repo. Use:

```bash
npx tsc --noEmit
```

### Bookings feature looks inconsistent

Check:

- schema migrations in `scripts/migrations/`
- [BOOKINGS_GUIDE.md](BOOKINGS_GUIDE.md)
- `app/api/bookings/`

### Frappe flow breaks

Check:

- `FRAPPE_*` env vars
- [FRAPPE_HRMS_SETUP.md](FRAPPE_HRMS_SETUP.md)
- latest handoff audit migration
- maintenance health panel in the portal

## GitHub Pages docs

Docs publish from:

- [docs/index.md](../index.md)
- [docs/\_config.yml](../_config.yml)
- [GitHub Pages workflow](https://github.com/PiyamDev1/pt-portal/blob/main/.github/workflows/github-pages.yml)
