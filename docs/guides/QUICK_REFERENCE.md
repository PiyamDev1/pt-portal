# Quick Reference

## Local checkout

```bash
git clone https://github.com/PiyamDev1/pt-portal.git
cd pt-portal
npm ci
cp .env.example .env.local
npm run dev
```

Minimum values: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_HASH_SECRET`, and `NEXT_PUBLIC_SITE_URL`.

## Commands

| Command                        | Purpose                                         |
| ------------------------------ | ----------------------------------------------- |
| `npm run dev`                  | Start local Next.js development                 |
| `npm run build`                | Create a production build                       |
| `npm start`                    | Run the production build                        |
| `npm run lint`                 | Lint the repository                             |
| `npm run typecheck`            | Run TypeScript without emitting files           |
| `npm run test:unit`            | Run Vitest once                                 |
| `npm run test:unit:watch`      | Run Vitest in watch mode                        |
| `npm run format:check`         | Check repository formatting                     |
| `npm run format:check:changed` | Check formatting for changed files              |
| `npm run docs:check`           | Validate local Markdown links                   |
| `npm run docs:check-api`       | Verify field-level docs cover every API handler |
| `npm run api:check-boundaries` | Enforce the API body-validation ratchet         |
| `npm run audit:ci`             | Fail on high-or-critical npm audit findings     |
| `npm run test:smoke:install`   | Install Playwright Chromium                     |
| `npm run test:smoke`           | Run authenticated browser smoke tests           |
| `npm run test:db:lms`          | Test the LMS migration on disposable PostgreSQL |
| `npm run test:db:security`     | Test security migration/concurrency behavior    |
| `npm run types:supabase`       | Regenerate the linked Supabase schema types     |
| `npm run sync:pdf-worker`      | Sync the checked-in PDF.js worker               |

`npm run format` and `npm run lint:fix` modify files. Use them intentionally.

## High-signal paths

| Path                                         | Purpose                                           |
| -------------------------------------------- | ------------------------------------------------- |
| `app/api/`                                   | HTTP route handlers                               |
| `app/dashboard/`                             | Protected product/admin surfaces                  |
| `lib/auth/`                                  | Authentication, 2FA, and security-event logic     |
| `lib/security/`                              | Shared rate limiting and secure randomness        |
| `lib/observability/server.ts`                | Structured/redacted server events                 |
| `lib/services/documentServer.ts`             | Private document record/object access             |
| `scripts/migrations/`                        | Ordered database changes                          |
| `scripts/ci/`                                | CI checks and database integration runners        |
| `types/supabase.generated.ts`                | Last linked-project schema snapshot               |
| `types/supabase.ts`                          | Current snapshot overlay and legacy compatibility |
| `.github/workflows/quality.yml`              | Main quality pipeline                             |
| `.github/workflows/database-integration.yml` | PostgreSQL migration pipeline                     |
| `.github/workflows/smoke-tests.yml`          | Live authenticated smoke pipeline                 |

## Security response guide

- `400`: malformed or invalid bounded input
- `401`: missing/invalid authenticated session
- `403`: authenticated but missing role, department, scope, or fresh factor
- `404`: requested record/scope is not available
- `409`: current state conflicts with the operation
- `413`: request or upload exceeds its route limit
- `429`: shared fixed-window limit exceeded; respect `Retry-After`
- `503`: required migration, limiter, or external dependency is unavailable

## Documentation

- [Getting Started](GETTING_STARTED.md)
- [Architecture](ARCHITECTURE_GUIDE.md)
- [Deployment](DEPLOYMENT_GUIDE.md)
- [Detailed API contracts](../api/README.md)
- [API route inventory](../technical/API_REFERENCE.md)
- [Security](../technical/SECURITY.md)
- [Database](../technical/DATABASE_SCHEMA_OVERVIEW.md)
- [Storage](../technical/STORAGE_SYSTEM.md)
