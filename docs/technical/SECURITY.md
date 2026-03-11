# Security Architecture

> PT-Portal security layers: auth, 2FA, sessions, rate limiting, admin access  
> Last updated: March 2026

---

## Table of Contents

1. [Authentication](#authentication)
2. [Two-Factor Authentication (2FA)](#two-factor-authentication-2fa)
3. [Session Management](#session-management)
4. [Admin Authorization](#admin-authorization)
5. [Rate Limiting](#rate-limiting)
6. [Password Management](#password-management)
7. [Security Headers & CORS](#security-headers--cors)
8. [OWASP Considerations](#owasp-considerations)

---

## Authentication

PT-Portal uses **Supabase Auth** (PostgreSQL-backed JWT sessions).

### Login Flow

```
1. User submits email + password on /login
2. Supabase validates credentials → issues JWT access token + refresh token
3. Tokens stored as httpOnly cookies by Supabase Auth Helpers
4. Middleware checks session cookie on all /dashboard/** requests
5. If 2FA is enabled for the account:
   → Redirect to /login/verify-2fa
   → User submits TOTP code or backup code
   → On success: session fully established, redirect to /dashboard
```

### Session Cookie Properties

- **httpOnly**: not accessible via JavaScript
- **Secure**: only sent over HTTPS (enforced by Vercel)
- **SameSite**: handled by Supabase Auth Helpers default policy
- **Expiry**: configurable; Supabase default is 1 hour (access) / 1 week (refresh)

---

## Two-Factor Authentication (2FA)

### Setup (`/login/setup-2fa`)

1. Server generates a TOTP secret
2. QR code displayed to user for scanning with authenticator app (Google Authenticator, Authy, etc.)
3. User confirms with first code to verify setup is correct
4. Secret stored against the user's profile in Supabase

### Verification (`/login/verify-2fa`)

- User enters 6-digit TOTP code
- Server validates against stored secret using time-window comparison
- Falls through to backup code path if TOTP unavailable or fails

### Backup Codes

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/generate-backup-codes` | POST | Generate a fresh set of backup codes |
| `/api/auth/backup-codes/count` | GET | How many unused codes remain |
| `/api/auth/consume-backup-code` | POST | Use one backup code (single-use) |

Backup codes are stored hashed in Supabase. Each code is consumed on use — once all are used, the user must regenerate.

### Admin 2FA Reset

`POST /api/auth/reset-2fa` — Admin-only. Disables 2FA for a user (e.g., locked out). Requires admin Bearer token.

---

## Session Management

### Active Sessions

`GET /api/auth/sessions`

Returns a list of active sessions for the authenticated user. Useful for detecting concurrent logins or stale sessions.

### Session Warning

`useSessionTimeout` hook monitors token expiry time.

- Computes time remaining from the JWT `exp` claim
- When below a threshold (default: ~5 minutes), triggers a warning
- `SessionWarningHeader` displays a countdown banner in the layout
- User can refresh their session before automatic logout

### Session Expiry Handling

- `useMinioConnection` and other polling hooks include session-aware error handling
- 401 responses from any API route return the user to `/login`

---

## Admin Authorization

Protected admin routes (under `/api/admin/**`) use `verifyAdminAccess()` from `lib/adminAuth.ts`.

### How it works

```
Request → API route handler
→ verifyAdminAccess(request)
  1. Read Authorization: Bearer <token> header
  2. Validate token via Supabase getUser(token)
  3. Query profiles table: role = 'admin' for this user
  4. Return { authorized: true, user: { id, email, provider } }
  5. On any failure: return { authorized: false, error, status: 401|403|500 }
```

### Roles

| Role | Access |
|---|---|
| `admin` | All admin endpoints, staff management, LMS seeding, data migrations |
| (standard) | Dashboard, documents, applications — scoped to own data |
| `super_admin` | Implied by Supabase service role — used server-side only |

### Usage in a Route

```typescript
const { authorized, error, status } = await verifyAdminAccess(request)
if (!authorized) {
  return NextResponse.json({ error }, { status })
}
```

---

## Rate Limiting

Implemented in `middleware.ts` applied to all `/api/**` routes.

### Algorithm: Token Bucket (per IP + User-Agent)

| Parameter | Value |
|---|---|
| Window | 60 seconds |
| Max requests | 60 per window |
| Key | `{x-forwarded-for}:{user-agent}` |
| Response on breach | `429 Too Many Requests` |
| `Retry-After` header | `60` (seconds) |

### Behaviour

- First request in a new window: bucket initialised with 59 remaining tokens
- Each subsequent request: decrements token count by 1
- After window expires: bucket reset to 60
- When tokens exhausted: request rejected with 429

### Limitations

- Token buckets are **in-memory** — they do not persist across Vercel serverless worker cold starts or restarts
- Suitable for **brute-force and abuse prevention** on a per-connection basis
- Not suitable for strict per-user quota enforcement across multiple Vercel edge workers
- For stricter rate limiting at scale, Vercel's Edge Config or an external Redis store would be needed

### Login Protection

The `/api/auth/**` path is within the rate-limited scope, providing protection against:
- Password brute-force attacks
- 2FA code enumeration
- Backup code stuffing

---

## Password Management

| Endpoint | Purpose |
|---|---|
| `/api/auth/update-password` | Authenticated user changes their own password |
| `/api/admin/reset-password` | Admin resets another user's password |
| `/app/auth/new-password` | Page for password reset via email link (Supabase magic link flow) |

Passwords are not stored by PT-Portal — all password hashing is handled by Supabase Auth (bcrypt internally).

---

## Security Headers & CORS

### CORS for MinIO

When MinIO is online, the status endpoint sends `PutBucketCorsCommand` to ensure the MinIO bucket allows browser requests:

```json
{
  "AllowedOrigins": ["*"],
  "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag", "Content-Length"],
  "MaxAgeSeconds": 3600
}
```

This runs non-blocking on every status check that finds MinIO online.

### Next.js / Vercel Headers

Standard Next.js security headers apply. For production hardening, `next.config.js` can be extended with `headers()` to add:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security`
- `Content-Security-Policy`

These are not currently explicitly set — Vercel's platform provides some defaults.

---

## OWASP Considerations

| Threat | Mitigation in PT-Portal |
|---|---|
| **Broken Access Control** | Supabase RLS policies on all tables; `verifyAdminAccess` on admin routes; session middleware on all dashboard pages |
| **Cryptographic Failures** | HTTPS enforced by Vercel; Supabase manages password hashing; JWT tokens signed by Supabase |
| **Injection (SQL)** | Supabase client uses parameterised queries; no raw SQL string interpolation in routes |
| **Injection (XSS)** | React's JSX auto-escapes output; no `dangerouslySetInnerHTML` usage |
| **Insecure Design** | Soft deletes preserve audit trail; migration logic is copy-first-then-delete |
| **Security Misconfiguration** | `.env.local` is gitignored; service role key never exposed to client; `NEXT_PUBLIC_` prefix only on intentionally public vars |
| **Vulnerable Components** | `npm audit` run after each install; `npm audit fix` used to patch dependencies |
| **Auth Failures** | 2FA enforced; backup codes single-use; session expiry warnings; rate limiting on auth endpoints |
| **SSRF** | Storage endpoints use fixed server-side env var URLs — no user-supplied URLs are fetched |
| **Logging Failures** | Server errors logged to Vercel; `[PdfThumbnail]` errors logged client-side for debugging |
