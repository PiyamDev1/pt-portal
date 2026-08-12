# Contributing to PT-Portal

PT-Portal is an operational system. Changes should preserve data integrity, authorization boundaries, external-service contracts, and clear operator feedback.

## Setup

Use Node.js 20.9 or newer.

```bash
git clone https://github.com/PiyamDev1/pt-portal.git
cd pt-portal
npm ci
cp .env.example .env.local
npm run dev
```

Use `npm install` instead of `npm ci` only when intentionally changing dependencies. Never commit real secrets. See [Getting Started](docs/guides/GETTING_STARTED.md) for environment and integration requirements.

## Make a focused change

- Keep route/page-specific code under `app/` and demonstrably shared logic under `lib/` or `hooks/`.
- Prefer direct module imports over new wide barrel exports.
- Update active documentation when behavior, commands, routes, schemas, or environment variables change.
- Preserve unrelated worktree changes; stage only the intended files.
- Use clear commit messages that describe the outcome, for example `fix: make LMS payment retries atomic`.

## Security and data rules

- Authenticate protected APIs with `requireStaffSession()` or the narrow admin wrapper.
- Derive actor identity from the verified session; do not trust caller-supplied user IDs, roles, or storage keys as authorization.
- Keep service-role, storage, Mailgun, cron, rate-limit, and webhook credentials server-only.
- Parse new or changed mutation bodies with bounded helpers from `lib/api/request.ts` and a Zod schema.
- Apply shared database-backed rate limiting to sensitive or abuse-prone routes.
- Require fresh 2FA for destructive or security-recovery actions where the existing workflow does.
- Put transactionally related writes in PostgreSQL functions rather than coordinating partial writes from route code.
- Use structured/redacted observability; do not log credentials, bodies, documents, codes, tokens, or raw rate-limit identities.

Read [Security Architecture](docs/technical/SECURITY.md), [Authentication Flow](docs/technical/AUTHENTICATION_FLOW.md), and [Database Schema Overview](docs/technical/DATABASE_SCHEMA_OVERVIEW.md) before altering those boundaries.

## UI rules

- Use Sonner toasts for notifications.
- Use `AppDialog`, `ConfirmationDialog`, or `ModalBase` for user decisions and input.
- Do not add `window.alert`, `window.confirm`, or `window.prompt`.
- Keep dialogs keyboard accessible with focus management and explicit button types.
- Preserve the existing responsive behavior and terminology of the feature being changed.

## Database migrations and types

Schema changes belong in an idempotent file under `scripts/migrations/`. Runtime setup routes may report readiness; they must not own production DDL.

When a migration is deployed, regenerate the checked-in schema contract:

```bash
npm run types:supabase
```

Add PostgreSQL integration assertions for transactions, grants, or concurrency. Never run the integration fixtures against production or persistent data.

## Required verification

Run the checks proportional to the change:

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
npm run test:db:lms
npm run test:db:security
npm run test:smoke:install
npm run test:smoke
```

The PostgreSQL suites need a disposable `DATABASE_TEST_URL`. The smoke suite needs a configured deployment and `SMOKE_*` secrets. If a relevant suite cannot run, state why in the handoff or pull request.

Do not run `npm run api:update-boundary-baseline` merely to silence CI. A baseline update must accompany a reviewed, intentional request-parsing exception or migration.

## CI expectations

The main quality workflow runs dependency audit, repository-wide lint, TypeScript, API-boundary checks, unit tests, changed-file formatting, documentation-link checks, and a production build. Database migration tests run on PostgreSQL 16 when their paths change. Authenticated smoke tests run on pull requests and manual dispatch when repository secrets are configured.

Documentation-only changes should still pass Markdown formatting and link/path checks. GitHub Pages publishes from `docs/` after changes reach `main`.

## Pull-request checklist

- [ ] Scope is focused and unrelated changes are excluded.
- [ ] Authorization and persistent-data effects were reviewed.
- [ ] Input is bounded and runtime validated where applicable.
- [ ] Unit/integration/smoke coverage was added or updated as appropriate.
- [ ] Lint, types, tests, formatting, API boundaries, and build were run as applicable.
- [ ] Active documentation, `.env.example`, migrations, and generated types are synchronized.
- [ ] No credentials, sensitive payloads, generated reports, or local auth state are committed.

By contributing, you agree that your contribution is licensed under the repository's MIT License.
