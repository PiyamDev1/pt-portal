# PT-Portal Documentation

This folder contains the maintained PT-Portal documentation and the source published to GitHub Pages. Active guides describe current repository behavior; planning artifacts and point-in-time reports are separated so they cannot be mistaken for implementation authority.

## Start here

- [Repository overview](https://github.com/PiyamDev1/pt-portal/blob/main/README.md)
- [Getting Started](guides/GETTING_STARTED.md)
- [Quick Reference](guides/QUICK_REFERENCE.md)
- [Developer Guide](guides/DEVELOPER_GUIDE.md)
- [Usage Guide](guides/USAGE_GUIDE.md)

## Product and operations guides

- [Appointment Bookings](guides/BOOKINGS_GUIDE.md)
- [Travel Packages](guides/TRAVEL_PACKAGES_GUIDE.md)
- [Document Management](guides/DOCUMENT_MANAGEMENT_GUIDE.md)
- [Receipt Operations](guides/RECEIPT_OPERATIONS_GUIDE.md)
- [Deployment](guides/DEPLOYMENT_GUIDE.md)
- [Integrations](guides/INTEGRATIONS_GUIDE.md)
- [Frappe HRMS Setup](guides/FRAPPE_HRMS_SETUP.md)
- [Windows Setup](guides/WINDOWS_SETUP_GUIDE.md)

## Technical reference

- [Architecture](guides/ARCHITECTURE_GUIDE.md)
- [Detailed API contracts](api/README.md)
- [API route inventory](technical/API_REFERENCE.md)
- [Authentication Flow](technical/AUTHENTICATION_FLOW.md)
- [Security Architecture](technical/SECURITY.md)
- [Database Schema Overview](technical/DATABASE_SCHEMA_OVERVIEW.md)
- [Storage System](technical/STORAGE_SYSTEM.md)
- [Deployment and Environment Setup](technical/DEPLOYMENT_ENVIRONMENT_SETUP.md)
- [Type Safety and Request Validation](technical/TYPE_SAFETY.md)
- [Domain Type Conventions](TYPES.md)

## Source-of-truth order

When two documents disagree, use this order:

1. Runtime code, migrations, `.env.example`, `package.json`, and workflow files.
2. Active guides and technical references listed above.
3. Operations notes and point-in-time reports.
4. Plans and archived material.

Database DDL belongs in `scripts/migrations/`. `types/supabase.generated.ts` is the last linked-project snapshot; `types/supabase.ts` combines it with the narrow pending-migration overlay used by current source. The [database reference](technical/DATABASE_SCHEMA_OVERVIEW.md) explains the deployment and regeneration flow.

## Historical and supporting material

The following content is deliberately retained but is not a statement of current implementation:

- [Plans](plans/README.md): proposals, handoffs, and completed planning checklists.
- [Operations notes](operations/README.md): one-off fixes and rollout-era procedures that require live verification before reuse.
- [Archive](archive/README.md): old release notes and completion snapshots.
- Point-in-time technical reports: `AUTH_SECURITY_AND_RLS_REVIEW.md`, `BUILD_PERFORMANCE.md`, `BUNDLE_ANALYSIS.md`, `CODE_AUDIT.md`, `CODE_QUALITY_REPORT.md`, `DEPENDENCY_AUDIT.md`, `PAYMENT_SERVICE_OPTIMIZATION.md`, and `REFRESH_LOOP_FIX_SUMMARY.md`.

These files remain useful for decisions and provenance. Do not copy commands or architecture from them without checking the current source.

## Documentation maintenance

When behavior changes:

1. Update the closest active guide or technical reference in the same change.
2. Update the route's field-level entry in [Detailed API contracts](api/README.md) and its compact method/security entry in [API route inventory](technical/API_REFERENCE.md).
3. Update environment documentation only after adding the variable to `.env.example`.
4. Run `npm run docs:check` to validate local Markdown links and anchors.
5. Run `npm run docs:check-api` to prove every exported handler has one detailed contract.
6. Run `npm run format:check` or Prettier on the changed Markdown.
7. Verify repository paths written as inline code; the link checker validates Markdown links, not arbitrary code-formatted paths.

The GitHub Pages source is [index.md](index.md), configured by [\_config.yml](_config.yml), and published by the [documentation workflow](https://github.com/PiyamDev1/pt-portal/blob/main/.github/workflows/github-pages.yml).
