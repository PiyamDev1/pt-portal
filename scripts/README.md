# Repository Scripts

The `scripts/` directory contains versioned database changes and repeatable repository tooling.

| Folder           | Purpose                                                                                |
| ---------------- | -------------------------------------------------------------------------------------- |
| `migrations/`    | Ordered, durable SQL migrations. Apply these through the deployment process.           |
| `bootstrap/`     | Full feature setup SQL retained for controlled manual initialization.                  |
| `manual/`        | Reviewed one-off backfills or operational SQL that is not part of the migration chain. |
| `manual/legacy/` | Historical SQL retained only when a current runtime dependency still exists.           |
| `ci/`            | API-boundary, formatting, documentation-link, and PostgreSQL integration checks.       |
| `dev/`           | Local helpers for generated Supabase types and the PDF.js worker.                      |

## Package commands

- `npm run api:check-boundaries` prevents growth in direct, unvalidated API JSON parsing.
- `npm run docs:check` validates local Markdown targets and heading anchors.
- `npm run docs:check-api` verifies that every exported API handler has a field-level contract.
- `npm run format:check:changed` checks all changed Prettier-supported files.
- `npm run test:db:commission-profiles` validates employee-owned Commission agreements, lifecycle,
  privileges, idempotency, and forward-replay safety against disposable PostgreSQL.
- `npm run test:db:lms` validates the atomic LMS migration against disposable PostgreSQL.
- `npm run test:db:security` validates shared rate limiting and backup-code replacement.
- `npm run types:supabase` regenerates the linked public-schema types atomically.
- `npm run sync:pdf-worker` refreshes the generated PDF.js worker after dependency installation.

The documentation link checker lives at `scripts/ci/check-doc-links.mjs`. It checks Markdown link
targets and heading anchors; repository paths written only as inline code still require review.
The API documentation checker lives at `scripts/ci/check-api-docs.mjs`; it compares exported
route methods with the exact headings and required contract sections under `docs/api/`.

## Safety

- Prefer `migrations/` for schema evolution and make migrations retry-safe where practical.
- Run database tests only against the disposable database in `DATABASE_TEST_URL`.
- Treat manual scripts as production-impacting operations: inspect their target and prerequisites
  before execution.
- Do not add credentials, environment dumps, or generated artifacts to this directory.
