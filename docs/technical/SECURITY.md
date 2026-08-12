# Security Architecture

> PT-Portal authentication, authorization, 2FA, abuse protection, document security, and operational logging
> Last updated: August 12, 2026

## Security boundaries

PT-Portal uses Supabase Auth for identity and PostgreSQL-backed employee records for application authorization. A valid Supabase token is only the first check: protected staff routes must also resolve an active employee record before privileged database or storage access.

The service-role key bypasses row-level security. It is server-only and never proves who the caller is. A route that uses a service-role client must authenticate and authorize the caller before performing the privileged operation.

## Authentication

### Password login

Password authentication is mediated by `POST /api/auth/password-login`:

1. The route validates a bounded email/password payload.
2. Shared PostgreSQL rate limits are applied to both the source IP and normalized email.
3. The server checks the persisted login guard and asks Supabase Auth to verify the password.
4. Only the server's verified result can update the security-event/login-failure history.
5. On success, the short-lived token pair is returned with `private, no-store` headers so the browser Supabase client can establish its cookie-backed session.
6. The login UI checks the active employee, branch assignment, temporary-password state, and required authenticator assurance before opening the dashboard.

The route returns a generic credential error for rejected passwords. It does not reveal whether an email exists.

Passkey and Microsoft SSO flows remain available, but protected API routes use the same server-side session and employee authorization boundary after login.

### Canonical staff-session guard

`requireStaffSession()` in `lib/auth/staffSession.ts` is the canonical API guard. It:

- calls Supabase `auth.getUser()` against the request's cookie-backed session;
- resolves the employee through the server-only service client;
- rejects missing and inactive employee records;
- optionally enforces normalized role and department membership allowlists; and
- derives the actor ID and email server-side instead of trusting request fields.

Use the role-scoped wrappers in `lib/adminSessionAuth.ts` for administrative routes:

| Guard                         | Allowed roles                          |
| ----------------------------- | -------------------------------------- |
| `requireAdminSession()`       | Admin, Master Admin, Super Admin       |
| `requireMaintenanceSession()` | Maintenance Admin plus all admin roles |
| `requireSuperAdminSession()`  | Master Admin, Super Admin              |

Feature-specific manager or department permissions still belong in the feature's route guard. A role grants only the capabilities explicitly checked by that route.

## Two-factor authentication

PT-Portal uses Supabase TOTP factors. Users enroll at `/login/setup-2fa` and complete an AAL2 challenge at `/login/verify-2fa`. Backup codes are a one-time fallback and are stored only as bcrypt hashes.

Sensitive account actions require a fresh TOTP or unused backup code:

| Endpoint                               | Purpose                                   | Additional proof                                                                 |
| -------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| `POST /api/auth/generate-backup-codes` | Replace the caller's backup-code set      | Fresh TOTP or backup code                                                        |
| `POST /api/auth/reset-2fa`             | Reset the caller's own factors            | Fresh TOTP or backup code                                                        |
| `POST /api/admin/recover-employee-2fa` | Break-glass recovery for another employee | Master/Super Admin session, fresh admin factor, exact target email, and a reason |

Backup-code replacement uses the `replace_backup_codes` PostgreSQL function. Deleting the old set and inserting the new hashes happens in one transaction, so a failed insert cannot erase the last valid recovery codes. Consumption performs a conditional `used = false` update, preventing concurrent requests from successfully using the same code twice.

The break-glass recovery route cannot target the current administrator. It records durable started/completed security events, removes the target's Auth factors and backup codes, and marks the employee as requiring 2FA setup again.

## Password management

`POST /api/auth/update-password` requires the current cookie-backed user, rate limiting, `currentPassword`, and `newPassword`. The route reauthenticates the current password server-side before using the Auth admin API. It enforces password strength, clears the temporary-password flag, and retains up to five best-effort password-history hashes.

Administrative password reset is a separate role-protected workflow. It requires a fresh administrator second factor, creates a temporary credential, marks the employee for a password change, and delivers the credential through the configured mail provider.

PT-Portal does not store a login-capable plaintext password. Supabase Auth owns primary password verification; the local password-history table contains bcrypt hashes used only for reuse checks.

## Session management

Supabase Auth Helpers maintain the browser session in cookies. API authorization must use `auth.getUser()`, not the unverified contents returned by `getSession()`. The latter may be decoded only after `getUser()` has authenticated the request, for example to identify the current session in the session-management view.

The Supabase browser client refreshes its cookie-backed session while refresh credentials remain valid. On a fresh login-page load, PT-Portal resumes a valid existing session and reruns employee/branch/MFA checks; logout explicitly signs out and returns to `/login`. There is no separate client countdown warning. API `401` responses mean the session is missing or no longer valid and the caller must authenticate again; `403` means the identity is known but lacks the required employee, role, department, or fresh-factor authorization.

## Shared rate limiting

Sensitive routes call `enforceRateLimit()` in `lib/security/rateLimit.ts`. Limits are fixed-window counters stored in `api_rate_limit_buckets` and incremented atomically by `check_api_rate_limit`. This makes decisions shared across application processes and serverless instances.

- Each route defines its own scope, window, limit, and applicable identities.
- Raw emails, IP addresses, tokens, and user IDs are not stored in the bucket table. Identity material is keyed with `RATE_LIMIT_HASH_SECRET` and SHA-256 before persistence.
- A blocked request returns `429 Too Many Requests`, `Retry-After`, and `private, no-store`.
- Sensitive routes fail closed with `503 Service Unavailable` if the limiter or hashing secret is unavailable.
- The request proxy adds an `x-request-id`; it does not keep an in-memory security counter.

Apply `scripts/migrations/20260812_security_rate_limits.sql` before deploying routes that use the limiter. The migration also installs atomic backup-code replacement and records the `api-security` schema version.

## Private document vault

Staff-facing document routes require a verified active staff session. The scheduled migration worker instead requires its server-configured cron token. Object-store keys supplied by a caller are never sufficient authorization: legacy key lookups must first resolve to a live, non-deleted `documents` row.

The upload boundary enforces:

- a known application/applicant/draft scope;
- a 1.5 MB file limit, including an early multipart `Content-Length` check;
- allowlisted categories and MIME types;
- sanitized single-segment filenames; and
- file-signature, declared MIME type, and filename-extension agreement.

Uploads go to private MinIO storage and can fall back to the private R2 vault. Metadata is written by the same server-side upload request; standalone metadata creation is disabled. If metadata insertion fails, the uploaded object is removed best-effort.

Preview and download routes resolve the document record first and use private/no-store responses or short-lived signed URLs. Streamed previews set `nosniff`, a sandbox content-security policy, and safe content disposition. Delete revokes the database record first and restores it if object deletion fails.

Storage credentials and service-role credentials must remain server-only. Do not add `NEXT_PUBLIC_` prefixes to them.

## Structured observability

`lib/observability/server.ts` emits JSON events with timestamps, request IDs, route/method context, bounded error details, and recursive key-based redaction. Authorization headers, cookies, passwords, secrets, tokens, verification codes, backup codes, OTP/TOTP values, API keys, and session fields are redacted.

High-value failures such as an unavailable shared limiter, LMS ledger errors, and document-storage failures can be sent to the server-only `OBSERVABILITY_ALERT_WEBHOOK_URL`. Webhook delivery has a five-second timeout and never uses a caller-provided destination. Alert failures are logged without replacing the original API response.

Do not put request bodies, credentials, raw identity values, or document contents in log context. New sensitive routes should emit stable event names and rely on the shared redaction helper.

## Operational checklist

Before deployment:

1. Configure `RATE_LIMIT_HASH_SECRET` as a long independent server-only random value.
2. Apply and verify the `api-security` schema migration.
3. Configure `OBSERVABILITY_ALERT_WEBHOOK_URL` only to a trusted operations receiver.
4. Confirm MinIO/R2 buckets are private and credentials are not browser-exposed.
5. Run unit, smoke, and PostgreSQL integration checks.
6. Verify privileged routes use a canonical cookie/session guard and a narrowly scoped role or department check.

Environment files containing real credentials must remain untracked. Security events and operational logs are evidence, not a substitute for Supabase RLS, route authorization, and storage access checks.
