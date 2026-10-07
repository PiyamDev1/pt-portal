# Repository Scripts

The `scripts/` directory contains versioned database changes and repeatable repository tooling.

| Folder           | Purpose                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `migrations/`    | Established feature/direct-deployment SQL history; apply via its intended deployment process. |
| `bootstrap/`     | Full feature setup SQL retained for controlled manual initialization.                         |
| `manual/`        | Reviewed one-off backfills or operational SQL that is not part of the migration chain.        |
| `manual/legacy/` | Historical SQL retained only when a current runtime dependency still exists.                  |
| `ci/`            | API-boundary, format, documentation, migration-inventory, and PostgreSQL integration checks.  |
| `dev/`           | Local helpers for generated Supabase types and the PDF.js worker.                             |

## Package commands

- `npm run api:check-boundaries` prevents growth in direct, unvalidated API JSON parsing.
- `npm run migrations:check` validates migration filename/version conventions and registered exact copies between the two migration histories.
- `npm run docs:check` validates local Markdown targets and heading anchors.
- `npm run docs:check-api` verifies that every exported API handler has a field-level contract.
- `npm run format:check:changed` checks all changed Prettier-supported files.
- `npm run test:db:commission-profiles` validates employee-owned Commission agreements, lifecycle,
  overwrite/removal, urgent Application rates, audited Application recipient routing, marginal
  flat package passenger bands, all-or-selected Ticket Assistance scope, privileges, idempotency, and
  forward-replay safety against disposable PostgreSQL.
- `npm run test:db:lms` validates the atomic LMS migration against disposable PostgreSQL.
- `npm run test:db:security` validates shared rate limiting and backup-code replacement.
- `npm run types:supabase` regenerates the linked public-schema types atomically.
- `npm run sync:pdf-worker` refreshes the generated PDF.js worker after dependency installation.

The separate Supabase CLI migration history is under `supabase/migrations/`; selected deployment
and PostgreSQL test workflows use that tree. Neither history should be merged into or substituted
for the other without checking the target project's migration ledger.

The documentation link checker lives at `scripts/ci/check-doc-links.mjs`. It checks Markdown link
targets and heading anchors; repository paths written only as inline code still require review.
The API documentation checker lives at `scripts/ci/check-api-docs.mjs`; it compares exported
route methods with the exact headings and required contract sections under `docs/api/`.

## Safety

- Add schema changes to the history used by the intended deployment workflow and make migrations retry-safe where practical.
- Keep `migrations/` and `supabase/migrations/` as separate, ordered histories. Never move or rename an applied migration between them without checking both deployment ledgers; register intentional exact SQL mirrors in `ci/migration-tree-mirrors.json`.
- Run database tests only against the disposable database in `DATABASE_TEST_URL`.
- Treat manual scripts as production-impacting operations: inspect their target and prerequisites
  before execution.
- Do not add credentials, environment dumps, or generated artifacts to this directory.
