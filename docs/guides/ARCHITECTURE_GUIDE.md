# Architecture Guide

Last verified against the repository: August 13, 2026.

## System shape

PT-Portal is a Next.js 16 App Router application. Server components and route handlers coordinate Supabase, S3-compatible object storage, Mailgun, Frappe HRMS, and selected infrastructure APIs. Client components provide the operational interface and call same-origin `/api/*` routes.

```text
Browser / installed PWA
  -> Next.js pages and same-origin route handlers
     -> Supabase Auth cookie verification
     -> PostgreSQL through authenticated or service-role clients
     -> MinIO / R2 / package backup storage
     -> Mailgun, Frappe HRMS, Hetzner

GitHub Actions
  -> quality checks, PostgreSQL migration tests, live smoke tests
  -> database backups, document fallback migration, docs publishing
```

The portal normally deploys to Vercel. Supabase and storage are external services; Frappe is a separate application with a small IMS bridge under `frappe_apps/piyam_ims_bridge/`.

## Repository boundaries

| Path                  | Ownership                                                                   |
| --------------------- | --------------------------------------------------------------------------- |
| `app/`                | Pages, route handlers, feature-local components, and domain types           |
| `components/`         | Shared app-native dialog/modal primitives                                   |
| `hooks/`              | Live reusable React hooks                                                   |
| `lib/`                | Shared domain, auth, security, storage, and integration logic               |
| `types/`              | Linked Supabase snapshot, pending-migration overlay, and compatibility view |
| `scripts/migrations/` | Ordered, durable database history                                           |
| `scripts/ci/`         | CI ratchets and PostgreSQL integration runners                              |
| `tests/unit/`         | Vitest route, domain, and component tests                                   |
| `tests/integration/`  | PostgreSQL fixtures and behavioral assertions                               |
| `tests/smoke/`        | Authenticated Playwright browser flows                                      |
| `docs/`               | Active guides plus labeled historical/supporting material                   |

Keep a helper feature-local until more than one consumer needs it. Shared server code should be framework-light where practical. Prefer direct `@/lib/...` imports over expanding global barrels.

## Rendering and UI

The root layout installs the progress bar, Sonner toaster, global footer, issue reporter, Web Vitals/API-latency reporters, PWA install UI, and service-worker registration. Dashboard pages are predominantly server entry points with client components for interaction.

The root layout also selects presentation from the request operating system before rendering. Android and iOS/iPadOS receive `data-device-layout="mobile"`; Windows, macOS, Linux, ChromeOS, and unknown desktop clients receive `data-device-layout="desktop"`. Both use `width=device-width`, preventing a narrow phone from shrinking a wider virtual canvas. OS-selected visibility utilities (`platform-mobile-*` and `platform-desktop-*`) control deliberately separate login and dashboard compositions as well as the header, notice presentation, safe-area spacing, touch sizing, and bottom navigation without a client-side layout flash. Mobile authentication uses a full-width surface with 56-pixel controls; the dashboard presents primary and secondary modules as single-column launch rows while retaining a compact two-column quick-action group. The mobile header orders the logo before the stable parent-directory action and omits desktop identity copy to preserve usable space. `lib/deviceLayout.ts` is the single OS-classification source; do not introduce page-local width or user-agent checks for layout selection.

Protected dashboard pages perform their own server-side session/data checks. `proxy.ts` is not the authentication boundary: it only propagates or creates `x-request-id` for API correlation. Sensitive abuse controls live in route handlers and PostgreSQL so they work across instances.

Use:

- Sonner toasts for success/error notifications;
- `AppDialog` for promise-based confirmation or text input;
- `ConfirmationDialog` for controlled destructive confirmations; and
- `ModalBase` for accessible modal shells with Escape handling, focus trap/restoration, backdrop behavior, and scroll locking.

Native `window.alert`, `window.confirm`, and `window.prompt` are not application UI. Browser-owned PWA install and permission APIs are launched from explicit app controls.

### Dashboard navigation

Dashboard return controls follow the route hierarchy, not browser history. The shared `PageHeader` uses `getDashboardParentNavigation()` from `lib/navigation/dashboardNavigation.ts` to show a parent-directory link on every non-root dashboard page. For example, Pakistani Passports returns to the Applications hub even if the user arrived from a notification, refresh, or unrelated cached page.

Deep routes whose immediate URL directory is not itself a page have explicit mappings, including application documents, passport drafts, LMS statements, package groups, and package quotation modes. New dashboard routes should either sit beneath a real index page or add an explicit parent rule and regression case. Use `backHref`/`backLabel` only when a page needs to override the central route map. Do not use `router.back()` or `window.history` for portal direction controls.

## Authentication and authorization

The browser session is stored in Supabase cookies. `getRouteSupabaseClient()` builds the request-scoped authenticated client; protected API code verifies the token with `auth.getUser()`.

`requireStaffSession()` is the canonical privileged API boundary:

1. verify the cookie-backed Supabase user;
2. load the matching employee with the server-only client;
3. reject missing or inactive employee profiles;
4. optionally enforce normalized role and department allowlists; and
5. return the server-derived actor identity.

`lib/adminSessionAuth.ts` exposes Admin, Maintenance, and Master/Super Admin wrappers. Feature-level responsibility or department rules still belong in the feature route.

Service-role clients bypass RLS and never authenticate a caller. Create/use them only after verifying the session and authorization, except for intentionally public token endpoints whose scope is established server-side.

Password login is mediated by `/api/auth/password-login`; the browser does not author password failure history. Fresh TOTP or one-time backup-code proof gates sensitive account recovery and destructive controls. See [Authentication Flow](../technical/AUTHENTICATION_FLOW.md) and [Security](../technical/SECURITY.md).

## API route pattern

New or changed mutation handlers should follow this order:

```text
request
  -> verified session and employee scope
  -> shared route-specific rate limit
  -> bounded JSON/multipart parse and Zod/content validation
  -> database/storage/integration operation
  -> structured redacted event on important outcomes
  -> stable JSON response plus request ID where applicable
```

`lib/api/request.ts` contains bounded JSON and streaming multipart parsers. `lib/api/http.ts` contains normalized JSON helpers. The API-boundary ratchet records remaining legacy direct `request.json()` use and prevents silent growth; it is migration tooling, not evidence that every old route is already modernized.

Return `401` for an invalid session, `403` for a known identity without the required staff/role/department/fresh-factor authorization, `413` for size limits, `429` for shared abuse limits, and `503` when a sensitive fail-closed dependency or required schema capability is unavailable.

## Data architecture

Supabase provides Auth and PostgreSQL. RLS remains a defense layer for authenticated clients. Server-only service clients perform privileged work only behind the route authorization boundary.

Migrations are executable source of truth. Runtime setup endpoints may report whether a schema marker/function is present; they must not create production schema. `portal_schema_versions` identifies capabilities required by newer LMS/security routes.

The checked-in `types/supabase.generated.ts` is the last linked-project schema snapshot. `types/supabase.ts` defines the current `Database` as that snapshot plus a narrow overlay for committed migrations that have not yet appeared in regeneration. `getStrictSupabaseClient()` uses this combined current contract; `getSupabaseClient()` keeps a permissive compatibility payload shape while older callers are migrated. Regenerate types after deploying migrations with `npm run types:supabase`, then remove overlay entries that the new snapshot now contains.

Use PostgreSQL functions for atomic multi-record invariants. LMS ledger writes and installment synchronization are database transactions with idempotency keys; rate-limit increments and backup-code replacement are also atomic functions.

## Feature domains

- Applications: NADRA, Pakistani passport drafts/submissions, GB passports, visas, notes, assignments, status history, complaints, refunds, custody, and receipts.
- Accounting/LMS: application reports, customer accounts, ledger entries, fees, payments, installments, notes, methods, audit, and statements.
- Bookings: branch/service schedules, availability, appointments, drafts, waitlist, reminders, attendance, no-shows, preferences, export/report, and audit history.
- Ticketing: UI-only module shell for the future Refund Calculator, Ticketing Ledger, upcoming flights, and mark/review/finalise schedule-change flow. No ticketing persistence or API integration is active yet.
- Travel packages: quote/share/selection, operational folders, groups, reservations, passengers, documents, invoices, payments/refunds/installments, vouchers, responsibilities, workflow risks, migration, and customer portals. See [Travel Packages](TRAVEL_PACKAGES_GUIDE.md).
- Staff/operations: settings, roles/departments, security, notices, issue reports, server control, timeclock devices/events/manual codes, training, and Frappe transfer.

## Storage architecture

The main document vault uses private MinIO as primary storage and optional private R2 as fallback. Database records authorize and locate objects; caller-provided keys alone never grant access. Server upload handlers validate scope, body size, safe name, MIME/extension, and file signature before writing. Metadata persistence and object cleanup are part of the same server-owned flow.

Travel-package files use the package MinIO bucket and optional `R3_*` backup storage. Package customer and third-party portals release explicit database records through scoped, expiring access; internal files remain private.

See [Document Management](DOCUMENT_MANAGEMENT_GUIDE.md) and [Storage System](../technical/STORAGE_SYSTEM.md).

## External integrations

- Mailgun sends booking, assignment, onboarding, and password-reset messages from server routes.
- Frappe HRMS supports health, provisioning, signed handoff, webhook verification, push/pull/reconcile, and cron-driven outbox/attendance work.
- Hetzner server status/power controls are Master/Super Admin-only; power actions require fresh 2FA.
- Legacy Firebase values are used only by the package migration tooling.
- The observability webhook is an optional trusted receiver for redacted high-value failures.

Integration secrets are server-only. Every integration should have bounded timeouts/errors and must not make browser-provided destinations or credentials authoritative.

## Observability and security headers

`lib/observability/server.ts` emits structured JSON with correlation IDs and recursive secret redaction. Important storage, limiter, and LMS failures can alert the configured trusted webhook without replacing the original response.

`next.config.js` sets HSTS, CSP, frame/content-type/referrer/permissions policies, compression, and no-store headers for auth routes. Document streams add private/no-store, `nosniff`, safe disposition, and sandbox/referrer controls.

## Verification architecture

The quality workflow runs npm audit, lint, TypeScript, API boundaries, documentation links, Vitest, changed-file Prettier, and the production build. The database workflow runs disposable PostgreSQL 16 checks for LMS and shared security migrations. Playwright uses an authenticated setup project and can target a live deployment or a locally started server.

For exact commands, see [Quick Reference](QUICK_REFERENCE.md). For workflow triggers and secrets, see [Deployment](DEPLOYMENT_GUIDE.md).
