# Windows Setup Guide

PT-Portal uses the same Node/npm workflow on Windows as on Linux and macOS. PowerShell examples are shown below.

## Prerequisites

- Node.js 20.9 or newer
- Git for Windows
- Visual Studio Code or another editor
- Supabase project access for authenticated/data-backed work

Verify the tools:

```powershell
node --version
npm --version
git --version
```

## Checkout

```powershell
git clone https://github.com/PiyamDev1/pt-portal.git
Set-Location pt-portal
npm ci
Copy-Item .env.example .env.local
```

Use `npm install` instead when intentionally changing a dependency and its lockfile.

## Environment

Open `.env.local` and set at least:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RATE_LIMIT_HASH_SECRET=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Copy optional Mailgun, MinIO/R2, package backup, Frappe, server-control, observability, and smoke values from `.env.example` only when working on those features. Never commit `.env.local` and never expose server credentials with a `NEXT_PUBLIC_` prefix.

## Start and verify

```powershell
npm run dev
```

Open `http://localhost:3000`. Run the baseline checks in another terminal:

```powershell
npm run lint
npm run typecheck
npm run test:unit
npm run format:check
npm run docs:check
npm run docs:check-api
npm run api:check-boundaries
npm run build
```

## Playwright

Install Chromium once, configure the `SMOKE_*` values when using a live target, then run:

```powershell
npm run test:smoke:install
npm run test:smoke
```

When `PLAYWRIGHT_BASE_URL` is unset, Playwright starts the local development server. Live smoke tests need a real test account and scope records; TOTP is preferred over the one-time backup-code fallback.

## PostgreSQL integration tests

The LMS/security scripts are Bash scripts and require `psql`. Run them from WSL or a suitable Bash environment with `DATABASE_TEST_URL` pointing to a disposable PostgreSQL database:

```bash
npm run test:db:lms
npm run test:db:security
```

Never use a production or persistent database for the integration fixtures.

## VS Code

Useful extensions include ESLint and Prettier. Let the repository configuration drive formatting rather than creating a conflicting workspace style. For Next.js debugging, use a normal Node launch that runs `node_modules/next/dist/bin/next dev`, or start `npm run dev` in the integrated terminal and attach your debugger.

## Common Windows issues

### PowerShell cannot find npm or Git

Restart the terminal after installation. If that fails, verify the Node.js and Git install directories are on `PATH`.

### Port 3000 is occupied

Find the process:

```powershell
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
```

Stop the specific process only if it is safe, or use another port:

```powershell
npm run dev -- --port 3001
```

### Environment changes do not appear

Stop and restart the development server. Confirm the file is named `.env.local`, not `.env.local.txt` (enable file extensions in Explorer).

### Authentication succeeds but dashboard access fails

The Supabase Auth user must also have an active `employees` record and appropriate role/location/department data. The service-role key does not replace that application authorization.

### Sensitive routes return 503

Confirm `RATE_LIMIT_HASH_SECRET` is set and `scripts/migrations/20260812_security_rate_limits.sql` has been deployed.

### Type/build artifacts seem stale

Stop the dev server, remove only the generated `.next` directory, and retry the command. Do not delete project data or reset unrelated changes.

## Next reading

- [Getting Started](GETTING_STARTED.md)
- [Quick Reference](QUICK_REFERENCE.md)
- [Architecture](ARCHITECTURE_GUIDE.md)
- [Deployment](DEPLOYMENT_GUIDE.md)
- [Security](../technical/SECURITY.md)
