# Developer Guide

Use this guide when changing PT-Portal code or documentation.

## Ownership boundaries

- Keep page, route, and feature-local UI code under `app/`.
- Keep reusable domain, auth, security, storage, and integration logic under `lib/`.
- Keep reusable React behavior under `hooks/`; do not add speculative generic hooks.
- Keep shared modal/dialog primitives under `components/`.
- Treat `scripts/migrations/` as the durable database schema history.
- Treat `types/supabase.generated.ts` as the last linked-project schema snapshot and `types/supabase.ts` as the combined current contract plus temporary legacy-caller compatibility view.
- Keep unit, PostgreSQL integration, and browser smoke coverage under their matching `tests/` directories.

Prefer direct module imports such as `@/lib/auth/staffSession` over new wide barrel exports. Place a helper next to one consumer until reuse is demonstrated.

## API route standard

For protected routes:

1. Authenticate with `requireStaffSession()` or the narrow wrapper from `lib/adminSessionAuth.ts`.
2. Derive actor identity from the verified session, never from a body field.
3. Apply route-specific role/department and fresh-factor requirements.
4. Apply `enforceRateLimit()` to sensitive or abuse-prone work.
5. Parse bounded bodies through `lib/api/request.ts` and a Zod schema.
6. Perform service-role database/storage work only after authorization.
7. Return stable HTTP status codes and non-sensitive errors.

`auth.getSession()` is not an authorization check. Do not add service-role or generic admin Bearer-token contracts to browser APIs.

When changing a mutation route, run `npm run api:check-boundaries`. Updating the boundary baseline is an intentional review action, not a way to make CI pass.

## Database changes

Add idempotent migrations rather than runtime DDL. Revoke public access to privileged functions/tables and grant only the required service-role capability. Use a PostgreSQL function when related ledger or state writes must be atomic.

After deployment, regenerate types with `npm run types:supabase` and remove pending-overlay entries that the refreshed snapshot now contains. Add a real-PostgreSQL assertion when transaction, concurrency, or grant behavior matters.

## UI feedback and dialogs

- Use Sonner toasts for notifications.
- Use `AppDialog`, `ConfirmationDialog`, or `ModalBase` for user decisions and input.
- Do not add `window.alert`, `window.confirm`, or `window.prompt`.
- Browser-owned APIs such as the PWA install prompt and permission requests are exceptions; launch them from clear app UI.
- Preserve keyboard handling, focus restoration/trapping, labels, and button types in modals.

## High-risk areas

Review auth/session guards, fresh 2FA, rate limiting, document access, LMS ledger functions, package financial operations, timeclock device signatures, and external integration secrets carefully. Failures in these areas can affect persistent data or access control.

Never log bodies, credentials, raw rate-limit identities, tokens, backup codes, TOTP values, document contents, or service errors that embed secrets. Use `lib/observability/server.ts` for correlated, redacted server events.

## Verification

Before handing off a meaningful change:

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

Also run the database integration or browser smoke suites when those surfaces changed. Document any suite that could not run because it needs live credentials or infrastructure.

## Documentation rule

Update the closest active guide/reference in the same change. Do not silently rewrite historical plans as current; label or index them as historical. Commands must exist in `package.json`, environment variables must exist in `.env.example`, and referenced routes/files must exist in the repository.
