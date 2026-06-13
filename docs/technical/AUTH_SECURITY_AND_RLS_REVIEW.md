# Auth Security and RLS Review

This note documents the current IMS authentication hardening model and what developers should verify before changing auth-sensitive code.

## Current Model

- IMS remains the primary access door.
- Supabase Auth owns the user session.
- Frappe HRMS is reached through IMS handoff rather than direct user navigation.
- Sensitive server routes derive identity from the session cookie instead of trusting `userId` values from the browser.
- Auth telemetry is append-only in `auth_security_events`.
- Login cooldown is enforced in the IMS login flow and backed by server-recorded failed attempts.
- API auth routes also have stricter rate limiting in `proxy.ts`.

## Security Event Coverage

The `auth_security_events` table records:

- `password_login`
- `passkey_login`
- `two_factor`
- `backup_code`
- `password_update`
- `session_revoke`
- `frappe_handoff`

Use this table for investigations, suspicious login review, and future admin dashboards.

## RLS Checklist

When adding or changing Supabase tables:

- Enable RLS by default.
- Prefer `auth.uid() = user_id` or `auth.uid() = employee_id` for employee-owned rows.
- Use service-role-only policies for audit/event tables that are written by server routes.
- Avoid broad `using (true)` policies unless the table is genuinely shared operational data.
- Never expose secrets, password hashes, passkey public-key internals, or API tokens through authenticated client policies.
- Keep writes to audit/event/security tables append-only from app code.

## Sensitive Route Checklist

For new auth/security routes:

- Use `getRouteSupabaseClient()` to verify the current user.
- Use `getSupabaseClient()` only after the user/session has been checked.
- Do not accept `userId` from browser payloads for self-service actions.
- Return generic errors for login and recovery flows where possible.
- Record a security event for important success/failure paths.
- Add or update unit tests for unauthorized, invalid, and success cases.

## Known Tradeoff

Standard password verification still uses Supabase client auth directly from the browser. IMS now checks a server-side login guard before attempting sign-in and records failures afterwards. This is useful defence in depth, but a stricter future version would proxy password login through an IMS API route so cooldown can be enforced as the only password entry path.
