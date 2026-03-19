# Deployment and Environment Setup

Last updated: March 18, 2026

## Runtime Model

PT-Portal is a Next.js application with App Router APIs and Supabase-backed data access.

Deployment targets commonly include:

- Vercel (configured via `vercel.json`)
- Containerized/dev-container workflows for local development

## Environment Variables

Define required secrets in your deployment environment and local `.env` files.

Typical categories:

- Supabase URL and keys (public + server role where required)
- Storage configuration (MinIO primary, optional fallback R2)
- Auth/security values for sensitive admin routes
- App runtime/public URL variables

Do not commit plaintext secrets to source control.

## Local Setup Baseline

1. Install dependencies:
   - `npm install`
2. Configure environment variables.
3. Start development server:
   - `npm run dev`

Additional onboarding references:

- `docs/guides/GETTING_STARTED.md`
- `docs/guides/WINDOWS_SETUP_GUIDE.md`

## Pre-Deploy Validation

Run these checks before promoting a release:

1. `npm run lint`
2. `npm run test:unit`
3. `npm run build`

If any command fails, fix and re-run before deploy.

## V1 Release Checklist

1. Confirm checklist items are marked complete.
2. Confirm lint/type/test/build all pass.
3. Update changelog/release notes.
4. Tag and push release commit.

## Post-Deploy Verification

1. Validate dashboard login/session behavior.
2. Validate core API route health paths.
3. Validate storage upload/preview/download flows.
4. Validate key admin operations and audit logging.

## Rollback Guidance

- Revert to the previous known-good deployment.
- Restore environment variables if a config regression occurred.
- If schema migrations are involved, follow migration rollback policy in SQL scripts.
