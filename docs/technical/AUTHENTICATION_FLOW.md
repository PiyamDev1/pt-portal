# Authentication Flow

Last verified against the repository: August 12, 2026.

PT-Portal uses Supabase Auth sessions stored in browser/server cookies. Authentication proves the Supabase user; authorization additionally resolves the corresponding active employee, role, departments, branch, resource scope, and—where required—a freshly verified second factor.

## Sign-in paths

### Password

1. The browser submits a bounded email/password body to `POST /api/auth/password-login`.
2. The route applies shared PostgreSQL-backed IP and normalized-email limits and checks the login-failure guard.
3. Supabase validates the credentials server-side. On success the browser receives the short-lived token pair needed to establish its cookie-backed Supabase session.
4. The login page verifies that the employee is active, checks an optional typed branch code against the assigned location, and redirects temporary-password users to the password-change flow.
5. If Supabase reports that AAL2 is required, the user completes TOTP or consumes a single-use backup code before entering the dashboard.

Login, 2FA, backup-code, and session-revocation outcomes are recorded as security events. Auth responses are private and non-cacheable. The shared limiter fails closed if its required database migration or secret is unavailable.

### Passkey

`/api/auth/passkeys/authenticate/options` and `/verify` implement the WebAuthn challenge/verification flow. Registration uses `/api/auth/passkeys/register/options` and `/verify`; `GET|DELETE /api/auth/passkeys` lists or removes credentials for the authenticated account. A verified passkey session can satisfy the login page's second-factor step for that session.

### Microsoft OAuth

The login page starts Supabase OAuth and the `/auth/callback` flow exchanges the callback data before running the same employee/branch/second-factor checks. OAuth is not a bypass around employee status or portal authorization.

## Session behavior

- Protected server pages read the cookie-backed Supabase session and redirect to `/login` when no session exists.
- Protected API routes must validate the user with `auth.getUser()`; sensitive staff routes should use `requireStaffSession()` to resolve the employee server-side before a service-role client is used.
- The browser Supabase client refreshes valid sessions. If refresh is no longer possible, the next protected navigation or request requires login again; there is no separate countdown-warning component.
- `GET /api/auth/sessions` returns up to six deduplicated recent sessions. `DELETE /api/auth/sessions` revokes one session or signs the account out globally, subject to rate limiting.
- Explicit logout calls Supabase sign-out and returns to `/login`.

## Two-factor and account recovery

| Route                                  | Purpose                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------- |
| `POST /api/auth/generate-backup-codes` | Replace the account's bcrypt-hashed one-use backup-code set after a fresh factor check |
| `POST /api/auth/consume-backup-code`   | Consume one code during sign-in                                                        |
| `GET /api/auth/backup-codes/count`     | Return the unused-code count                                                           |
| `POST /api/auth/reset-2fa`             | Self-service factor reset after fresh TOTP/backup verification                         |
| `POST /api/admin/recover-employee-2fa` | Admin recovery with role checks, fresh admin factor, and target restrictions           |
| `POST /api/auth/update-password`       | Update the authenticated user's password and password history                          |
| `GET                                   | PATCH /api/auth/security-preferences`                                                  | Read/update backup-code reminder preferences |

Generating a replacement backup-code set is atomic: the previous set remains valid if the database operation fails. Never store or log plaintext backup codes, TOTP values, passkey challenges, passwords, session tokens, or cookies.

## Authorization boundary

The request proxy only adds/carries an `x-request-id`; it is not an authentication middleware. Each page or route owns its access check.

For a route that uses the service-role key:

1. Validate the cookie-backed user.
2. Resolve the employee from the verified user ID, not from a body/query employee ID.
3. Reject inactive/missing employees.
4. Enforce the required role, department, branch, and record ownership/scope.
5. Require a fresh TOTP or backup code immediately before destructive security/infrastructure actions where the route contract calls for it.
6. Only then create/use the service-role client.

`401` means no valid authenticated identity. `403` means an authenticated caller lacks the required access. `429` means a security limit was exceeded. `503` is used when a required security dependency or schema capability is unavailable.

## Related documentation

- [Security Architecture](SECURITY.md)
- [API Reference](API_REFERENCE.md)
- [Architecture](../guides/ARCHITECTURE_GUIDE.md)
- [Database Schema Overview](DATABASE_SCHEMA_OVERVIEW.md)
