# Getting Started

This guide is the fastest reliable path to getting PT-Portal running locally and understanding how the repo is organized.

## What you are setting up

PT-Portal is a Next.js application that depends on:

- Supabase for auth and database access
- Mailgun for email delivery
- MinIO for document storage
- Frappe HRMS credentials if you want to exercise the HRMS bridge

You can still run the app without every integration being fully live, but the closer your `.env.local` is to production, the more realistic your local testing will be.

## Prerequisites

Install these first:

- `Node.js 20+`
- `npm`
- `Git`

Recommended tools:

- `VS Code`
- `Supabase dashboard` access
- `Vercel` access if you deploy from the platform

## Initial setup

1. Clone the repository.

```bash
git clone https://github.com/PiyamDev1/pt-portal.git
cd pt-portal
```

2. Install dependencies.

```bash
npm install
```

3. Create your local environment file.

```bash
cp .env.example .env.local
```

4. Fill in the required variables from Supabase and your operational services.

Minimum local baseline:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Commonly needed for real feature testing:

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
HETZNER_API_TOKEN=
HETZNER_SERVER_ID=
HETZNER_SERVER_IP=
HETZNER_SERVER_LABEL=
SERVER_CONTROL_SERVICES=
SERVER_CONTROL_SERVICE_HEALTH_URLS=
```

5. Start the app.

```bash
npm run dev
```

6. Open `http://localhost:3000`.

## Verification checklist

You should be able to confirm:

- the login page loads
- the app compiles without startup errors
- authenticated pages work with your Supabase-backed user
- basic dashboard navigation works

Before making changes, it is worth running:

```bash
npx tsc --noEmit
npm run lint
```

## Common working commands

```bash
npm run dev
npm run build
npm start
npm run lint
npm run lint:fix
npm run format
npm run format:check
npm run test:unit
```

For smoke tests:

```bash
npm run test:smoke
```

## How the repo is laid out

Main areas you will touch most often:

- `app/` for pages, route handlers, and dashboard UI
- `lib/` for shared server-side helpers and integrations
- `components/` for reusable UI primitives
- `hooks/` for reusable hooks
- `scripts/migrations/` for SQL migrations
- `docs/` for product, technical, and operational documentation
- `.github/workflows/` for automation

For a deeper technical walk-through, read [ARCHITECTURE_GUIDE.md](ARCHITECTURE_GUIDE.md).

## Suggested onboarding path

If you are new to the project, read in this order:

1. [Repository README](https://github.com/PiyamDev1/pt-portal/blob/main/README.md)
2. [ARCHITECTURE_GUIDE.md](ARCHITECTURE_GUIDE.md)
3. [USAGE_GUIDE.md](USAGE_GUIDE.md)
4. [INTEGRATIONS_GUIDE.md](INTEGRATIONS_GUIDE.md)
5. [QUICK_REFERENCE.md](QUICK_REFERENCE.md)

## Troubleshooting

### `npm install` fails

- Ensure you are on Node `20+`
- Delete `node_modules` and retry `npm install`
- If lockfile drift is suspected, keep `package-lock.json` and retry from a clean checkout

### App starts but auth does not work

- Check `NEXT_PUBLIC_SUPABASE_URL`
- Check `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Check `SUPABASE_SERVICE_ROLE_KEY` for server-side routes

### Storage or email features fail locally

- Those features require real MinIO and Mailgun credentials
- If you are only working on UI, avoid flows that send mail or upload files until env is complete

### Frappe handoff or provisioning fails

- Confirm all `FRAPPE_*` variables are set
- Read [FRAPPE_HRMS_SETUP.md](FRAPPE_HRMS_SETUP.md)
- Confirm the Frappe bridge app and matching handoff secret are deployed
