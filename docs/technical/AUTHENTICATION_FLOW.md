# Authentication Flow

Last updated: March 18, 2026

## Overview

PT-Portal uses Supabase Auth with cookie-based sessions for dashboard users and role-based authorization for admin-only actions.

Authentication patterns used in the codebase:

- Server route session checks via Supabase server clients.
- Dashboard route protection with middleware/session checks.
- Optional bearer-token checks for select admin recovery operations.
- Two-factor support with backup-code lifecycle endpoints.

## Login and Session Lifecycle

1. User signs in through the login flow.
2. Supabase issues session cookies.
3. Protected pages and API routes validate the active session.
4. Session metadata can be listed via API for account visibility.
5. Logout invalidates session and removes access to protected surfaces.

Related route:

- `GET /api/auth/sessions`

## Password and Recovery

- Password update flow is handled by:
  - `POST /api/auth/update-password`
- 2FA backup-code generation and consumption:
  - `POST /api/auth/generate-backup-codes`
  - `POST /api/auth/consume-backup-code`
  - `GET /api/auth/backup-codes/count`
- 2FA reset path for administrative recovery:
  - `POST /api/auth/reset-2fa`

## Authorization Model

Authorization is role-based and enforced server-side in route handlers.

Typical role levels:

- Employee/basic user
- Manager/team scope role
- Master admin/system-level role

Sensitive routes require both:

- Valid authenticated session
- Matching authorization level for requested operation

## Security Notes

- Do not trust client-provided role/user identifiers without server verification.
- Return normalized API errors for all auth failures.
- Keep admin token usage scoped only to designated recovery endpoints.
- Preserve auditability for state-changing auth operations.

## Related Documentation

- `docs/technical/SECURITY.md`
- `docs/technical/API_REFERENCE.md`
- `docs/guides/ARCHITECTURE_GUIDE.md`
