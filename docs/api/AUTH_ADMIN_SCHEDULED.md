# Authentication, Administration, Scheduled Jobs, and Vitals API

## Scope

This reference documents every HTTP method exported below `app/api/auth`, `app/api/admin`, and
`app/api/cron`, plus `POST /api/vitals`, as implemented in the repository. It is a field-level
contract for portal clients and operators; database rows shown as `record` or `row` retain the
columns selected by the route and should be consumed defensively as the schema evolves.

## Shared conventions

- Unless a route says otherwise, requests and responses use `application/json`.
- Successful JSON is returned directly, without a `{ data: ... }` envelope. Normalized failures
  are `{ "error": "message" }`, sometimes with documented context fields.
- Portal authentication is the Supabase session represented by the request cookies. `401` means
  no valid session; `403` means the session exists but its employee, role, factor, or target scope
  is not allowed. Active-employee checks apply to staff-role guards.
- Admin roles are `Admin`, `Master Admin`, and `Super Admin`. Maintenance roles are
  `Maintenance Admin` plus all admin roles. Where this reference says “fresh second factor,” the
  submitted code is verified at request time; accepted methods are stated per route.
- JSON limits are encoded-byte limits. A request exceeding a bounded parser's limit normally
  returns `400` with its parser error unless the route explicitly maps it to `413`.
- Rate limits apply to every listed identity at once (for example, both user and IP). A rejected
  request returns `429`, normally with rate-limit headers. “Fail open” is called out where used.
- Unsupported methods use the framework's method-not-allowed behavior. The only explicit
  `OPTIONS` handler in this scope is `/api/admin/add-employee`. None of the routes in this file is
  retired or returns `410`; legacy-named seed/migration endpoints remain active maintenance
  operations. Do not infer that `GET` is safe merely from its verb: scheduled `GET` routes mutate.
- Examples omit cookie values and secrets. Never log or persist bearer tokens, factor codes,
  temporary passwords, provisioning secrets, backup codes, WebAuthn assertions, or returned
  token hashes.

## Authentication and account security

### GET `/api/auth/backup-codes/count`

Returns the authenticated user's remaining unused backup-code count.

**Access:** Supabase session; any authenticated user. No route-level rate limit or fresh-factor
check.

**Input:** No path, query, header, or body fields beyond the session cookies.

**Success:** `200` `{ "count": number }`. A missing `backup_codes` table is treated as count `0`
for migration compatibility. Read-only and safe to repeat.

**Errors:** `401` unauthenticated; `500` missing server credentials or database/read failure.

### POST `/api/auth/consume-backup-code`

Consumes one recovery code atomically during an authenticated recovery flow.

**Access:** Supabase session; any authenticated user. Limit: 6 attempts per user and IP per 15
minutes. No separate fresh-factor check because the submitted backup code is the factor.

**Input:** JSON, maximum 2 KiB: `code` (required string, trimmed, 1–100 characters).

**Success:** `200` `{ "consumedCodeId": string }`. Marks the matched code used and records a
successful security event. Repeating the same code is not idempotent: the second use fails.

**Errors:** `400` malformed/invalid/already-used code; `401` unauthenticated; `429` limited; `503`
atomic consumption capability unavailable; `500` unexpected failure.

Example:

```json
{ "code": "AB12-CD34" }
```

### POST `/api/auth/generate-backup-codes`

Replaces all recovery codes and returns the new plaintext set once.

**Access:** Supabase session; any authenticated user; fresh TOTP or backup code required. Limit: 5
requests per user and IP per 15 minutes.

**Input:** JSON, maximum 4 KiB: `count` (optional integer/coercible number, 1–10, default `10`),
`verificationCode` (required trimmed string, 1–100 characters), and `verificationMethod`
(optional enum `totp | backup | auto`, default `auto`).

**Success:** `200` `{ "codes": string[], "generatedCount": number }`. Codes use `XXXX-XXXX`
uppercase letters/digits and are returned only here; bcrypt hashes replace the prior set in one
database transaction. Retrying creates a different set and invalidates the just-created set.

**Errors:** `400` invalid input; `401` unauthenticated; `403` factor verification failed; `429`
limited; `500` generation/storage failure.

```json
{ "count": 10, "verificationCode": "123456", "verificationMethod": "totp" }
```

### POST `/api/auth/login-guard`

Reports the shared password-failure lockout state for an email before login.

**Access:** Public. Limit: 10 checks per IP and normalized email per 15 minutes. No session or
factor required.

**Input:** JSON, maximum 2 KiB: `email` (required valid email, trimmed/lowercased, maximum 320
characters).

**Success:** `200` `{ "locked": boolean, "failedAttempts": number, "remainingSeconds": number }`.
When locked, the route also records a blocked password-login security event. Read-oriented, but
blocked checks have that audit side effect.

**Errors:** `400` invalid email/body; `429` limited; `500` security-event lookup failure.

### POST `/api/auth/password-login`

Authenticates email/password server-side and returns the short-lived Supabase token pair used by
the browser SDK to establish its local session.

**Access:** Public. Limits: 50 attempts per IP and 5 per normalized email per 15 minutes; the
separate shared login guard can also lock an email. No existing session required.

**Input:** JSON, maximum 4 KiB: `email` (required valid email, trimmed/lowercased, maximum 320
characters) and `password` (required string, 1–1,000 characters).

**Success:** `200` `{ "accessToken": string, "refreshToken": string }` with private no-store
headers. Records a successful server-authored security event. A client must pass the pair to the
Supabase client; this response does not itself set a portal cookie.

**Errors:** `400` invalid body; `401` wrong email/password; `429` rate/guard lockout (guard response
also includes `remainingSeconds` and `Retry-After`); `503` auth configuration/provider/audit
unavailable. Authentication outcomes are always no-store.

```json
{ "email": "staff@example.com", "password": "user-entered password" }
```

### GET `/api/auth/passkeys`

Lists the current user's registered passkeys without credential material.

**Access:** Supabase session; any authenticated user. No route-level rate limit.

**Input:** No path, query, header, or body fields beyond the session cookies.

**Success:** `200` `{ "passkeys": [{ "id": string, "name": string|null,
"transports": string[]|null, "device_type": string|null, "created_at": string,
"last_used_at": string|null }] }`, newest first. Read-only.

**Errors:** `401` unauthenticated; `500` database failure.

### DELETE `/api/auth/passkeys`

Deletes one passkey owned by the current user.

**Access:** Supabase session; any authenticated user. Limit: 5 requests per user and IP per 15
minutes. No fresh-factor check.

**Input:** JSON parsed directly: `id` (required non-empty string; no explicit length/format
validation). Extra fields are ignored.

**Success:** `200` `{ "ok": true }`. The delete is owner-scoped; deleting a missing/non-owned ID
also produces this shape, making repeats effectively idempotent.

**Errors:** `400` missing `id`; `401` unauthenticated; `429` limited; `500` database failure.

### POST `/api/auth/passkeys/register/options`

Creates a one-time WebAuthn registration challenge for a platform authenticator.

**Access:** Supabase session with an email. Limit: 10 requests per user and IP per 15 minutes.

**Input:** No body fields. WebAuthn origin and relying-party ID are derived from the request/server
configuration.

**Success:** `200` `{ "publicKey": RegistrationOptions }`, containing base64url `challenge`, `rp`
(`name`, `id`), `user` (`id`, `name`, `displayName`), ES256 `pubKeyCredParams`, `timeout: 60000`,
`attestation: "none"`, required resident/user verification platform-authenticator selection, and
`excludeCredentials`. Stores an expiring registration challenge. Not idempotent.

**Errors:** `400` the account already has its one allowed passkey; `401` unauthenticated/no email;
`429` limited; `500` database/challenge failure.

### POST `/api/auth/passkeys/register/verify`

Verifies a WebAuthn registration attestation and stores the passkey.

**Access:** Supabase session with an email. Limit: 10 requests per user and IP per 15 minutes.

**Input:** JSON parsed directly: `challenge` (required string), `name` (optional string; trimmed,
default `Mobile passkey`), `device_type` (optional string, stored as supplied), and `credential`
(required object) whose `response.clientDataJSON` and `response.attestationObject` are required
base64url strings and `response.transports` is an optional string array. No explicit body/field
size bounds are applied by this route.

**Success:** `200` `{ "ok": true, "credential_id": string, "email": string, "name": string }`.
Upserts the credential and consumes the challenge. Reusing a consumed challenge fails.

**Errors:** `400` incomplete, expired, wrong-origin/challenge, or invalid attestation; `401`
unauthenticated; `429` limited; `500` challenge/passkey database failure.

### POST `/api/auth/passkeys/authenticate/options`

Creates a WebAuthn authentication challenge for the passkeys registered to an email.

**Access:** Public. Limit: 10 requests per IP and normalized email per 15 minutes.

**Input:** JSON parsed directly: `email` (required non-empty string after trim; lowercased; this
route does not enforce email syntax or a length bound). Extra fields are ignored.

**Success:** `200` `{ "publicKey": { "challenge": string, "timeout": 60000,
"userVerification": "required", "allowCredentials": [{ "type": "public-key", "id": string,
"transports": string[] }] } }`. Stores an expiring authentication challenge. Not idempotent.

**Errors:** `400` missing email; `404` no passkey for email; `429` limited; `500` database/challenge
failure.

### POST `/api/auth/passkeys/authenticate/verify`

Verifies a WebAuthn assertion and creates a Supabase magic-link token hash for session exchange.

**Access:** Public. Limit: 15 requests per IP per 15 minutes.

**Input:** JSON parsed directly: `challenge` (required string); `credential.id` or preferably
`credential.rawId` (one required string); and required base64url strings
`credential.response.clientDataJSON`, `authenticatorData`, and `signature`. No explicit body/field
size bounds are applied.

**Success:** `200` `{ "ok": true, "token_hash": string, "email": string, "user_id": string }`.
Updates signature count/last-used time, consumes the challenge, records success, and returns a
sensitive one-time token hash for Supabase session exchange. Not idempotent.

**Errors:** `400` incomplete, expired, or cryptographically invalid assertion; `403` credential
does not match challenge email; `404` credential missing; `429` limited; `500` database or magic
link generation failure.

### POST `/api/auth/reset-2fa`

Self-service removal of every MFA factor so the current user must enroll again.

**Access:** Supabase session; fresh TOTP or backup code required. Limit: 5 requests per user and IP
per 15 minutes.

**Input:** JSON, maximum 4 KiB: `verificationCode` (required trimmed string, 1–100 characters) and
`verificationMethod` (optional enum `totp | backup | auto`, default `auto`).

**Success:** `200` `{ "resetUserId": string, "removedFactors": number }`. Deletes all Supabase MFA
factors, clears `employees.two_factor_enabled`, and records the action. Repeating requires another
valid fresh factor and will normally be impossible after factors are removed.

**Errors:** `400` invalid input; `401` unauthenticated; `403` verification failed; `429` limited;
`500` factor/database failure.

### POST `/api/auth/security-events`

Records a bounded client-reported authentication security event; password outcomes remain
server-owned.

**Access:** Public for non-success/non-revocation events; a valid session is required when `status`
is `success` or `revoked`. Limit: 30 requests per IP per 15 minutes.

**Input:** JSON, maximum 16 KiB: `eventType` (required enum `password_login | passkey_login |
two_factor | backup_code | password_update | session_revoke | frappe_handoff`), `status` (required
enum `started | success | failed | blocked | revoked`), `email` (optional valid trimmed email,
maximum 320), and `metadata` (optional JSON object with string keys). Unknown top-level fields are
stripped.

**Success:** `200` `{ "ok": true }`; appends an audit/security-event row. Repeated calls append
repeated events.

**Errors:** `400` invalid event/body; `401` unauthenticated success/revocation; `403`
`password_login` is forbidden because only `/password-login` may author it; `429` limited; a
persistence failure may surface as `500`.

### GET `/api/auth/security-preferences`

Returns backup-code reminder preferences for the current user.

**Access:** Supabase session; any authenticated user. No route-level rate limit.

**Input:** No request fields beyond session cookies.

**Success:** `200` `{ "preferences": { "backup_codes_downloaded_at": string|null,
"backup_reminder_dismissed_until": string|null } }`. Missing preference rows produce both values
as `null`. Read-only.

**Errors:** `401` unauthenticated; `500` database/internal failure.

### PATCH `/api/auth/security-preferences`

Creates or updates backup-code reminder preferences for the current user.

**Access:** Supabase session; any authenticated user. No route-level rate limit or fresh factor.

**Input:** JSON parsed directly: `backup_codes_downloaded` (optional boolean; `true` stores current
timestamp and `false` stores `null`) and `backup_reminder_dismissed_until` (optional ISO timestamp
string or `null`, passed through without route-level format validation). Extra fields are ignored;
an empty object still upserts the user row.

**Success:** `200` `{ "success": true, "preferences": PreferenceRow }`. Upserts by `user_id`;
repeating a downloaded=`true` request changes the stored timestamp.

**Errors:** `401` unauthenticated; `500` malformed JSON, database, or internal failure.

### GET `/api/auth/sessions`

Lists up to six recent sessions, deduplicated by normalized user-agent plus IP.

**Access:** Supabase session; any authenticated user. No route-level rate limit.

**Input:** No path/query/body fields. Session cookies identify both user and current session.

**Success:** `200` `{ "sessions": [{ "id": string, "created_at": string, "last_active": string,
"ip": string, "user_agent": string, "is_current": boolean, "is_active": boolean }] }`, newest
first. Direct-table results mark sessions inactive after one hour; the fallback RPC reports its
rows active. Read-only.

**Errors:** `401` unauthenticated; `500` table and fallback-RPC failure or internal error.

### DELETE `/api/auth/sessions`

Revokes one session or globally signs the current user out.

**Access:** Supabase session; any authenticated user. Limit: 10 requests per user and IP per 15
minutes. No fresh-factor requirement.

**Input:** Strict JSON, maximum 4 KiB, either `{ "type": "all" }` or `{ "type": "single", "id":
string }`; single-session `id` is trimmed, 1–200 characters. No extra fields.

**Success:** `200` `{ "message": "All devices signed out" }` or `{ "message": "Session revoked"
}`. Revokes auth sessions and records a revocation event. A repeated global revocation is generally
idempotent; a repeated single revocation depends on the database RPC.

**Errors:** `400` invalid discriminated body; `401` unauthenticated; `429` limited; `500` provider,
RPC, or audit failure.

### POST `/api/auth/update-password`

Reauthenticates the current password, enforces password strength, and changes the current user's
password.

**Access:** Supabase session; current password required. Limit: 5 requests per user and IP per 15
minutes. It does not use TOTP/backup fresh-factor verification.

**Input:** JSON, maximum 4 KiB: `currentPassword` and `newPassword` (both required strings, 1–1,000
characters). The new value must have at least 8 characters and include lowercase, uppercase,
number, and a recognized special character.

**Success:** `200` `{ "updatedUserId": string, "message": "Password updated successfully" }`.
Changes Supabase Auth, clears the temporary-password flag, best-effort records/prunes password
history to five rows, and records success. Not idempotent because the old current password stops
working.

**Errors:** `400` invalid/weak password or provider rejection; `401` unauthenticated; `403` current
password incorrect; `429` limited; `500` employee flag/database/internal failure.

## Administration

### GET `/api/admin/add-employee`

Public reachability diagnostic for the employee-onboarding route; it does not list employees.

**Access:** Public; no session, role, factor, or rate limit.

**Input:** Optional `Origin` header. There are no path/query/body fields.

**Success:** `200` `{ "route": "add-employee", "method": "GET", "note": "route is reachable" }`.
The response echoes the supplied origin in `Access-Control-Allow-Origin` (or `*`) and sets
`Vary: Origin`. No persistent side effects.

**Errors:** No route-authored error response; framework/internal failures remain possible.

### OPTIONS `/api/admin/add-employee`

Explicit CORS preflight/diagnostic response for employee onboarding.

**Access:** Public; no session, role, factor, or rate limit.

**Input:** Optional `Origin` header; no body. Requested preflight headers are not parsed.

**Success:** `200` `{ "route": "add-employee", "method": "OPTIONS" }`, with allowed methods
`POST, OPTIONS`, allowed headers `Content-Type, Authorization`, echoed origin (or `*`), and
`Vary: Origin`. No persistent side effects.

**Errors:** No route-authored error response. This is the only explicit `OPTIONS` behavior in this
document; other paths rely on framework behavior.

### POST `/api/admin/add-employee`

Provisions a Supabase identity and employee profile, assigns departments/location, initializes
password history, and emails a temporary password.

**Access:** Active staff session with `Admin`, `Master Admin`, or `Super Admin`. Assigning a target
role named `Master Admin` or `Super Admin` requires the actor to hold one of those two roles. Limit:
20 attempts per actor and IP per hour. No fresh-factor check.

**Input:** Strict JSON, maximum 16 KiB: `email` (required valid address, normalized lowercase,
maximum 320), `role_id` (required UUID), `department_ids` (required array of 1–50 unique UUIDs),
`firstName` and `lastName` (required trimmed strings, 1–100 characters, no control characters), and
`location_id` (optional UUID, empty string, or `null`; empty/null becomes `null`). Optional `Origin`
controls CORS response headers.

**Success:** `200` `{ "createdUserId": string, "message": "User created" }`. Creates the auth
user/profile/security/membership records and delivers the only temporary-password copy by email.
The route attempts containment and rollback if a later provisioning stage fails; retrying after a
success conflicts with the existing identity rather than acting idempotently.

**Errors:** `400` invalid body/assignment or identity creation conflict; `401` unauthenticated;
`403` inactive/forbidden role assignment; `429` limited; `500` configuration/profile/security/
department failure; `502` email delivery failure; `503` assignment lookup unavailable. Error
responses also carry the CORS headers.

```json
{
  "email": "new.staff@example.com",
  "role_id": "00000000-0000-4000-8000-000000000001",
  "department_ids": ["00000000-0000-4000-8000-000000000002"],
  "firstName": "New",
  "lastName": "Staff",
  "location_id": null
}
```

### POST `/api/admin/clear-lms-data`

Clears all LMS data using the atomic database reset function.

**Access:** Active `Admin`, `Master Admin`, or `Super Admin` session plus a fresh second factor.
Limit: 3 requests per actor and IP per hour.

**Input:** JSON, maximum 4 KiB: `verificationCode` (syntactically optional trimmed string, maximum
100, but a valid code is required for authorization) and `verificationMethod` (optional enum
`totp | backup | auto`). Unknown fields are stripped.

**Success:** `200` `{ "clearedTables": ["loan_installments", "loan_transactions", "loans",
"loan_customers"], "clearedTableCount": 4 }`. Destructive and not reversible; repeating against an
already empty database yields the same table summary.

**Errors:** `400` invalid body; `401` unauthenticated; `403` role/factor rejected; `429` limited;
`500` reset RPC/internal failure.

### POST `/api/admin/clear-lms`

Compatibility endpoint that invokes the same atomic full LMS reset and returns its database result.

**Access:** Active `Admin`, `Master Admin`, or `Super Admin` session plus a fresh second factor.
Limit: 3 requests per actor and IP per hour.

**Input:** JSON, maximum 4 KiB: `verificationCode` (syntactically optional trimmed string, maximum
100, semantically required) and `verificationMethod` (optional `totp | backup | auto`).

**Success:** `200` `{ "deleted": unknown }`, where `deleted` is the exact `lms_clear_all_data` RPC
result. Destructive; safe only as an intentional environment reset.

**Errors:** `400` invalid body; `401` unauthenticated; `403` role/factor rejected; `429` limited;
`500` missing Supabase configuration, RPC, or internal failure.

### POST `/api/admin/create-installments-table`

Verifies that the migration-owned LMS schema/capability marker is current; despite its legacy name,
it does not create a table.

**Access:** Active `Maintenance Admin`, `Admin`, `Master Admin`, or `Super Admin` session. No
route-level rate limit or fresh-factor check.

**Input:** No body, query, or path fields.

**Success:** `200` `{ "tableReady": true, "tableExists": true, "schemaVersion": number,
"capabilities": unknown[] }` when schema version is at least `20260812`. Read-only and idempotent.

**Errors:** `401` unauthenticated; `403` wrong role/inactive employee; `503` schema absent/outdated,
with `migration`, `requiredVersion`, and `currentVersion`; `500` configuration/RPC/internal failure.

### POST `/api/admin/create-installments`

Backfills installment rows for LMS service transactions that do not yet have installments.

**Access:** Active maintenance-role session (`Maintenance Admin`, `Admin`, `Master Admin`, or
`Super Admin`). Limit: 3 requests per actor and IP per hour. No fresh-factor check.

**Input:** No body fields. The route reads every `service` transaction and its loan term/balance.

**Success:** `200` `{ "createdInstallmentCount": number, "skippedTransactionCount": number,
"erroredTransactionCount": number, "errorDetails"?: string[], "totalTransactions": number }`.
Existing transaction installments are skipped, so successful reruns are intended to be
idempotent. If runtime table creation is unavailable, `400` may include `requiresManualSetup: true`
and a server-generated `sql` string; operators should prefer committed migrations.

**Errors:** `400` legacy manual-schema setup condition; `401` unauthenticated; `403` wrong role;
`429` limited; `500` configuration/query/internal failure. Individual transaction failures are
reported in the successful summary rather than failing the whole request.

### POST `/api/admin/delete-employee`

Permanently deletes an employee profile and marks the corresponding auth identity as admin-deleted.

**Access:** Active `Master Admin` or `Super Admin` session; fresh TOTP/backup/auto factor required.
Limit: 3 requests per actor and IP per hour.

**Input:** Strict JSON, maximum 4 KiB: `employeeId` (required trimmed string, 1–200 characters),
`confirmEmail` (required valid email, maximum 320, must exactly equal the stored target email),
`verificationCode` (required trimmed string, 1–100), and `verificationMethod` (optional enum
`totp | backup | auto`). Self-deletion is forbidden.

**Success:** `200` `{ "message": string, "deletedEmployeeId": string, "deletedEmployeeEmail":
string, "deletedEmployeeName": string }`. Deletes the employee row; auth metadata containment is
best effort after deletion. Destructive and not idempotent—the target is `404` after success.

**Errors:** `400` invalid body/self-target/email mismatch; `401` unauthenticated; `403` wrong
role/factor; `404` target missing; `429` limited; `500` database/internal failure.

```json
{
  "employeeId": "00000000-0000-4000-8000-000000000010",
  "confirmEmail": "target@example.com",
  "verificationCode": "123456",
  "verificationMethod": "totp"
}
```

### POST `/api/admin/disable-enable-employee`

Enables or disables an employee account.

**Access:** Any active staff session, but a non-`Master Admin`/`Super Admin` actor must be in the
target's manager chain. Disabling requires a fresh `totp | backup | auto` factor; enabling does not.
Limit: 20 requests per actor and IP per hour.

**Input:** Strict JSON, maximum 4 KiB: `employeeId` (required trimmed string, 1–200), `isActive`
(required boolean), `verificationCode` (optional trimmed string, maximum 100; required when
disabling), and `verificationMethod` (optional enum `totp | backup | auto`). Self-disable is
forbidden.

**Success:** `200` `{ "updatedEmployeeId": string, "message": string, "isActive": boolean }`.
Sets `employees.is_active`; repeating the same desired state is idempotent.

**Errors:** `400` invalid body/self-disable; `401` unauthenticated; `403` target scope or factor
rejected; `429` limited; `500` database/internal failure.

### GET `/api/admin/issue-reports`

Lists up to 100 issue reports for review and returns active assignment candidates.

**Access:** Active `Master Admin` session only. No route-level rate limit.

**Input:** Optional query strings: `status`, `module`, and `assignedTo` (strings; value `all` skips
that filter); `assignedTo=me` uses the caller, `unassigned` selects null, otherwise the value is
used as an assignee ID; `search` applies a case-insensitive match to notes, page URL, and reporter
name. No explicit query-length or enum bounds are applied.

**Success:** `200` `{ "reports": IssueReportSummary[], "assignees": [{ "id": string, "name":
string }], "currentAdminId": string|null }`, reports newest first. Read-only.

**Errors:** `400` query schema rejection; `401` unauthenticated; `403` not Master Admin; `500`
report query failure.

### GET `/api/admin/issue-reports/[reportId]`

Returns a full issue ticket, artifact metadata, event history, and decoded console entries.

**Access:** Active `Master Admin` session only. No route-level rate limit.

**Input:** Path `reportId` (required string supplied by the route segment; no explicit format/length
validation). No query or body.

**Success:** `200` `{ "report": IssueReportRow, "artifacts": IssueArtifactRow[], "events":
IssueEventRow[], "screenshotUrl": string|null, "consoleEntries": unknown[] }`. Console artifact
read/JSON failure is tolerated as an empty array. Read-only except server error logging.

**Errors:** `401` unauthenticated; `403` not Master Admin; `404` report missing/query failure for
the main row; `500` artifact/event query failure.

### PATCH `/api/admin/issue-reports/[reportId]`

Changes ticket status and/or assignment and appends an administrative event.

**Access:** Active `Master Admin` session only. Limit: 60 requests per actor and IP per hour. No
fresh-factor check.

**Input:** Path `reportId` (required unvalidated route string). Strict JSON, maximum 8 KiB:
`status` (optional trimmed string, 1–50; normalized by the shared status normalizer),
`assignedToUserId` (optional trimmed string up to 200 or `null`), and `adminNote` (optional string,
maximum 2,000; trimmed before event storage). At least `status` or the assignment property must be
present.

**Success:** `200` `{ "reportId": string, "status": string, "updatedAt": string }`. Updates
lifecycle timestamps: `solved` schedules artifact purge after 30 days, `closed` sets close time,
and other statuses clear solved/purge/closed values. Appends an event; repeating creates another
event and timestamp, so it is not idempotent.

**Errors:** `400` invalid/no-op body; `401` unauthenticated; `403` not Master Admin; `429` limited;
`500` update failure.

```json
{
  "status": "solved",
  "assignedToUserId": "00000000-0000-4000-8000-000000000011",
  "adminNote": "Verified and resolved"
}
```

### GET `/api/admin/issue-reports/[reportId]/artifacts/[artifactId]`

Streams a live issue-report screenshot or console-log artifact.

**Access:** Active `Master Admin` session only. No route-level rate limit.

**Input:** Required path strings `reportId` and `artifactId`; neither has route-level format or
length validation. No query/body.

**Success:** `200` raw object bytes with the stored/fallback `Content-Type` and `Cache-Control:
private, max-age=60`. Read-only.

**Errors:** `401` unauthenticated; `403` not Master Admin; `404` missing, mismatched, or soft-deleted
artifact. An object-storage read failure can surface as `500`.

### POST `/api/admin/migrate-installment-amounts`

Best-effort legacy LMS backfill: paid installments receive `amount_paid` as amount and skipped
installments receive amount zero.

**Access:** Active maintenance-role session. Limit: 3 requests per actor and IP per hour. No fresh
factor.

**Input:** No path/query/body fields.

**Success:** `200` `{ "totalInstallments": number, "updatedPaidCount": number,
"updatedSkippedCount": number, "unchangedCount": number }`. Per-row update errors are ignored;
counters describe eligible rows, not guaranteed successful writes. Repeating converges on the same
amounts but still scans/updates eligible rows.

**Errors:** `401` unauthenticated; `403` wrong role; `429` limited; `500` initial query/internal
failure.

### POST `/api/admin/migrate-names-lowercase`

Lowercases existing applicant first and last names.

**Access:** Active `Admin`, `Master Admin`, or `Super Admin` session. Limit: 3 requests per actor and
IP per hour. No fresh factor.

**Input:** Strict empty JSON object `{}`, maximum 1 KiB. Any property is rejected.

**Success:** `200` `{ "updatedCount": number, "totalProcessed": number, "errors": [{
"applicantId": string, "name": string, "error": string }]|null }`. Already-lowercase rows are not
written, so reruns are convergent/idempotent; row errors are returned inside `200`.

**Errors:** `400` non-empty/invalid body; `401` unauthenticated; `403` wrong role; `429` limited;
`500` configuration/initial fetch/internal failure.

### GET `/api/admin/notice-board`

Lists all notice-board slides with aggregate seen/dismissed counts.

**Access:** Active maintenance-role session. No route-level rate limit or fresh factor.

**Input:** No path, query, header, or body fields beyond session cookies.

**Success:** `200` `{ "slides": [{ ...NoticeBoardSlideRow, "seen_count": number,
"dismissed_count": number }] }`, ordered by ascending `sort_order`, then newest first. Read-only.

**Errors:** `401` unauthenticated; `403` wrong role; `500` slide or read-metric query failure.

### POST `/api/admin/notice-board`

Creates a notice-board slide.

**Access:** Active maintenance-role session. Shared notice mutation limit: 30 requests per actor and
IP per hour. No fresh factor.

**Input:** Strict JSON, maximum 16 KiB. At least one of `title`, `body`, or `image_url` must be
non-empty. Optional fields/defaults are: `title` (string, max 120, `""`), `body` (string, max 500,
`""`), `image_url` (HTTP/HTTPS or internal path, max 1,000, `""`),
`image_storage_provider` (`"" | minio | r2`), `image_storage_bucket` (string, max 200),
`image_storage_key` (string, max 1,000), `hyperlink_url` (HTTP/HTTPS or internal path, max 1,000),
`display_seconds` (finite number, 2–60, default 6), `sort_order` (finite number,
-100,000–100,000, default 0), `is_active` (boolean, default true), `target_role` (string, max 120),
and department/location targets (`""` or UUID). A stored image must provide provider, bucket, and a
`notice-board/` key together. Empty strings are stored as `null`.

**Success:** `201` `{ "slide": NoticeBoardSlideRow }`. Stores creator/update timestamps. Not
idempotent; identical retries create additional slides.

**Errors:** `400` empty notice, unsafe URL, incomplete storage metadata, or invalid/extra field;
`401` unauthenticated; `403` wrong role; `409` stale targeting reference; `429` limited; `500`
database failure (with request ID).

```json
{
  "title": "Office update",
  "body": "The office closes at 17:00.",
  "image_url": "",
  "image_storage_provider": "",
  "image_storage_bucket": "",
  "image_storage_key": "",
  "hyperlink_url": "",
  "display_seconds": 8,
  "sort_order": 10,
  "is_active": true,
  "target_role": "",
  "target_department_id": "",
  "target_location_id": ""
}
```

### PATCH `/api/admin/notice-board`

Replaces the editable fields of one notice-board slide.

**Access:** Active maintenance-role session. Shared notice mutation limit: 30 requests per actor and
IP per hour. No fresh factor.

**Input:** Strict JSON, maximum 16 KiB: `id` (required trimmed string, 1–200) plus the create-route
fields and constraints. This is replacement-like rather than a sparse patch: omitted editable
fields receive their documented defaults, so callers should send the complete intended state.

**Success:** `200` `{ "slide": NoticeBoardSlideRow }`. Updates `updated_at`; when the stored image
key changes, the superseded private object is deleted on a best-effort basis. Repeating can change
the timestamp even when content is unchanged.

**Errors:** `400` empty notice, unsafe URL, incomplete storage metadata, or invalid/extra body;
`401` unauthenticated; `403` wrong role; `404` missing slide; `409` stale targeting reference; `429`
limited; `500` database update failure (with request ID).

### DELETE `/api/admin/notice-board`

Deletes one notice-board slide.

**Access:** Active maintenance-role session. Shared notice mutation limit: 30 requests per actor and
IP per hour. No fresh factor.

**Input:** Strict JSON, maximum 4 KiB: `id` (required trimmed string, 1–200). No extra fields.

**Success:** `200` `{ "ok": true }`. The associated managed image object is deleted on a
best-effort basis after the database row; deleting a nonexistent ID also returns success, so
repeats are effectively idempotent.

**Errors:** `400` invalid body; `401` unauthenticated; `403` wrong role; `429` limited; `500`
database failure.

### POST `/api/admin/notice-board/upload`

Uploads a notice-board image to MinIO, falling back to R2 when configured, and returns an
authenticated proxy URL.

**Access:** Active maintenance-role session. Limit: 10 requests per actor and IP per hour. No fresh
factor.

**Input:** `multipart/form-data`, total maximum 5 MiB + 256 KiB overhead. Field `file` is required
and must be a non-empty JPEG, PNG, or WebP no larger than 5 MiB. Filename, extension, declared MIME,
and detected signature must agree; no other form field is used.

**Success:** `200` `{ "imageUrl": string, "image_storage_provider": "minio"|"r2",
"image_storage_bucket": string, "image_storage_key": string, "fileName": string, "fileType":
string }`. `imageUrl` contains only the encoded object key; the read route derives storage details
from the saved slide. Writes a unique object key; retries create additional objects and are not
idempotent.

**Errors:** `400` missing/empty/invalid form file; `401` unauthenticated; `403` wrong role; `413`
oversize; `415` unsupported/mismatched content; `429` limited; `503` storage unavailable (generic
message with request ID).

```bash
curl -X POST -b 'portal-session=...' -F 'file=@notice.webp;type=image/webp' \
  https://portal.example/api/admin/notice-board/upload
```

### GET `/api/admin/receipt-metrics`

Returns generation, sharing, channel, recent-receipt, and backfill-health metrics.

**Access:** Active maintenance-role session. No route-level rate limit or fresh factor.

**Input:** No path/query/body fields.

**Success:** `200` with either `{ "supported": false, "message": string, "summary": null,
"byService": [], "byChannel": [], "recent": [], "backfill": null }` when the table is absent, or
`{ "supported": true, "summary": { "totalReceipts": number, "sharedReceipts": number,
"totalShares": number, "shareRate": number }, "byService": [{ "serviceType": string,
"receipts": number }], "byChannel": [{ "channel": string, "shares": number }], "recent": [{
"id": string, "serviceType": string, "receiptType": string, "generatedAt": string|null,
"isShared": boolean, "sharedVia": string|null, "shareCount": number }], "backfill": {
"nullShareCountRows": number, "nullSharedViaRows": number, "healthy": boolean } }`. Aggregations
use at most the 1,000 newest rows, while `totalReceipts` uses the exact table count. Read-only.

**Errors:** `401` unauthenticated; `403` wrong role; `500` non-missing-table query/internal failure.

### POST `/api/admin/recover-employee-2fa`

Audited break-glass recovery that removes another employee's MFA factors and backup codes.

**Access:** Active `Master Admin` or `Super Admin` session plus the actor's fresh second factor.
Limit: 5 requests per actor, target, and IP per hour.

**Input:** JSON, maximum 8 KiB: `employeeId` (required UUID), `confirmEmail` (required valid trimmed
email and must case-insensitively match target), `reason` (required trimmed string, 10–1,000
characters), `verificationCode` (required trimmed string, 1–100), and `verificationMethod`
(optional `totp | backup | auto`, default `auto`). Self-targeting is forbidden.

**Success:** `200` `{ "recoveredEmployeeId": string, "employeeName": string, "removedFactors":
number, "requiresSetup": true }`. Strictly audits start/revocation, deletes factors and backup
codes, and clears the 2FA flag. Destructive; not normally repeatable with the same target state.

**Errors:** `400` invalid/self-target/email mismatch; `401` unauthenticated; `403` wrong role/factor;
`404` employee missing; `429` limited; `500` strict audit/provider/database failure.

### POST `/api/admin/reset-password`

Sets an employee's temporary password and emails it to the employee.

**Access:** Active `Admin`, `Master Admin`, or `Super Admin` session plus a fresh
`totp | backup | auto` factor. Limit: 5 requests per actor and IP per 15 minutes.

**Input:** Strict JSON, maximum 8 KiB: at least one of `employee_id` (optional UUID) or `email`
(optional valid trimmed email, maximum 320); `verificationCode` (syntactically optional trimmed
string, maximum 100, semantically required); `verificationMethod` (optional enum
`totp | backup | auto`). If both identity fields are present, `employee_id` wins while supplied
`email` is used as the notification address.

**Success:** `200` `{ "resetUserId": string, "message": "Password reset and emailed" }`. Changes
Supabase Auth, best-effort sets the temporary flag and password history, then emails the one-time
password. Not idempotent; each retry generates and sets a new password.

**Errors:** `400` invalid input/history collision; `401` unauthenticated; `403` wrong role/factor;
`404` email does not resolve; `429` limited; `500` configuration/auth/database/missing target email;
`502` email delivery failed. A `502` occurs after the password has already changed.

### GET `/api/admin/seed-countries`

Public health hint for the country-seeding path; it does not inspect or seed data.

**Access:** Public; no session, role, factor, or rate limit.

**Input:** No path/query/body fields.

**Success:** `200` `{ "route": "seed-countries", "note": "Use POST with proper authentication" }`.
No side effects.

**Errors:** No route-authored error response; framework/internal failures remain possible.

### POST `/api/admin/seed-countries`

Upserts the route's built-in visa destination country/code list by country name.

**Access:** Active `Admin`, `Master Admin`, or `Super Admin` session. Limit: 5 requests per actor and
IP per hour. No fresh factor.

**Input:** Strict empty JSON object `{}`, maximum 1 KiB.

**Success:** `200` `{ "seededCountryCount": number }`. Counts upserts without errors; individual
row errors are skipped. Upsert semantics make reruns convergent/idempotent for the built-in list.

**Errors:** `400` invalid/non-empty body; `401` unauthenticated; `403` wrong role; `429` limited;
`500` configuration/internal failure.

### POST `/api/admin/seed-payment-methods`

Seeds the built-in LMS methods `Cash`, `Bank Transfer`, and `Card Payment` when the table is empty.

**Access:** Active maintenance-role session. Limit: 3 requests per actor and IP per hour. No fresh
factor.

**Input:** No body/query/path fields.

**Success:** If any row exists, `200` `{ "message": "Payment methods already exist", "skipped":
true }`; otherwise `200` `{ "createdCount": number, "methods": LoanPaymentMethodRow[] }`. The
emptiness guard makes successful reruns idempotent but does not repair a partially populated table.

**Errors:** `401` unauthenticated; `403` wrong role; `429` limited; `500` database/internal failure.

### GET `/api/admin/seed-presets`

Mutating legacy-verb endpoint that upserts the built-in visa countries/types and nationality rules.

**Access:** Active maintenance-role session. Limit: 3 requests per actor and IP per hour. No fresh
factor.

**Input:** No path/query/body fields; the `request` is used only for rate-limit identity.

**Success:** `200` `{ "syncedPresetCount": number, "logs": string[] }`. Each log reports a synced
or failed country/type. Country/type upserts make reruns convergent, although country creation can
still race with another request. This `GET` has database side effects and must not be prefetched.

**Errors:** `401` unauthenticated; `403` wrong role; `429` limited; `500` configuration/internal
failure. Per-type database errors are represented in `logs` inside `200`.

### POST `/api/admin/seed-pricing`

Inserts the built-in NADRA, Pakistani-passport, and GB-passport zero-value pricing catalogs.

**Access:** Active maintenance-role session. Limit: 3 requests per actor and IP per hour. No fresh
factor.

**Input:** No body/query/path fields.

**Success:** `200` `{ "nadraCount": number, "pkCount": number, "gbCount": number }`, reporting
exact post-insert table counts. This route uses plain inserts, not upserts; it is not idempotent and
may create duplicates or fail on constraints when repeated.

**Errors:** `401` unauthenticated; `403` wrong role; `429` limited; `500` configuration/insert/count
failure.

### GET `/api/admin/server-control`

Reads the configured Hetzner server's status and portal service health.

**Access:** Active `Master Admin` or `Super Admin` session. No route-level rate limit or fresh
factor for status reads.

**Input:** No path/query/body fields.

**Success:** `200` with the `ServerControlStatus` object returned by `getServerControlStatus()`;
fields include the configured server/provider status and derived service health as defined in
`lib/serverControl`. Read-only against the server, though it performs provider/network probes.

**Errors:** `401` unauthenticated; `403` wrong role; `502` provider/status probe failure.

### POST `/api/admin/server-control`

Runs one whitelisted Hetzner power action.

**Access:** Active `Master Admin` or `Super Admin` session plus fresh TOTP or backup code. Limit: 5
requests per actor and IP per hour.

**Input:** JSON, maximum 4 KiB: `action` (required enum `start | stop | restart`),
`verificationCode` (required non-empty trimmed string), and `verificationMethod` (required enum
`totp | backup`; `auto` is not accepted).

**Success:** `200` with the action/result object returned by `runServerControlAction()`. It changes
external server power state and is not idempotent in the general case, especially `restart`.

**Errors:** `400` invalid body/action; `401` unauthenticated; `403` wrong role/factor; `429` limited;
`503` server control not configured; `502` provider/action failure.

```json
{ "action": "restart", "verificationCode": "123456", "verificationMethod": "totp" }
```

### GET `/api/admin/timeclock/devices`

Lists physical timeclock devices and calculated online state.

**Access:** Active `Admin`, `Master Admin`, or `Super Admin` session. No route-level rate limit or
fresh factor.

**Input:** No path/query/body fields.

**Success:** `200` `{ "devices": [{ "id": string, "name": string, "location": string|null,
"location_id": string|null, "qr_interval_sec": number, "is_active": boolean,
"last_seen_at": string|null, "firmware_version": string|null, "ip": string|null, "wifi_rssi":
number|null, "free_heap": number|null, "uptime_sec": number|null, "created_at": string,
"updated_at": string, "online": boolean }] }`, ordered by name. `online` requires active plus a
last-seen timestamp within 180 seconds. Read-only.

**Errors:** `401` unauthenticated; `403` wrong role; `500` device query failure.

### POST `/api/admin/timeclock/devices`

Creates and provisions a physical timeclock device.

**Access:** Active `Admin`, `Master Admin`, or `Super Admin` session. Limit: 10 device mutations per
actor and IP per hour. No fresh factor for initial creation.

**Input:** Strict JSON, maximum 8 KiB: `name` (required string after runtime parsing, trimmed and
truncated to 120, non-empty), `location_id` (optional UUID, `null`, or empty string; null/empty means
unassigned), `qr_interval_sec` (optional integer/coercible number 5–300, default `30`), and
`is_active` (accepted but ignored; new devices are always active). Unknown fields are rejected.

**Success:** `201` `{ "device": TimeclockDeviceWithOnline, "provisioning_secret": string }` with
`Cache-Control: no-store`. Writes a random device ID and 32-byte hex secret. The secret is returned
only for provisioning; retrying creates another device or a name conflict and is not idempotent.

**Errors:** `400` invalid name/location/interval or location missing; `401` unauthenticated; `403`
wrong role; `409` duplicate device name; `429` limited; `500` database failure.

### PATCH `/api/admin/timeclock/devices`

Updates a physical device or rotates its provisioning secret.

**Access:** Active `Admin`, `Master Admin`, or `Super Admin` session. Limit: 10 device mutations per
actor and IP per hour. Normal edits need no fresh factor; `action=rotate_secret` requires a fresh
factor.

**Input:** Strict JSON, maximum 8 KiB. `id` is required and must be a UUID. For normal updates,
required runtime fields are `name` (non-empty string, trimmed/truncated to 120), `location_id`
(UUID/null/empty), `qr_interval_sec` (integer/coercible 5–300), and `is_active` (boolean). For
rotation, send `action: "rotate_secret"`, `confirmation` exactly equal to the current device name,
`verificationCode`, and optional `verificationMethod`; update fields may be omitted. The factor
helper accepts `totp | backup | auto` values, though this route's outer schema initially treats
them as unknown.

**Success:** Normal edit: `200` `{ "device": TimeclockDeviceWithOnline }`. Rotation: `200` `{ "id":
string, "provisioning_secret": string }` with no-store headers. Normal desired-state edits are
convergent; rotation always replaces the secret and is not idempotent.

**Errors:** `400` invalid ID/update fields/confirmation; `401` unauthenticated; `403` wrong
role/factor; `404` device missing; `409` duplicate name; `429` limited; `500` query/update failure.

```json
{
  "id": "00000000-0000-4000-8000-000000000012",
  "action": "rotate_secret",
  "confirmation": "Front Desk Clock",
  "verificationCode": "123456",
  "verificationMethod": "totp"
}
```

### POST `/api/admin/wipe-installments`

Deletes every LMS installment row through the atomic maintenance RPC.

**Access:** Active maintenance-role session plus a fresh second factor. Limit: 3 requests per actor
and IP per hour.

**Input:** JSON, maximum 4 KiB: `verificationCode` (syntactically optional trimmed string, maximum
100, semantically required) and `verificationMethod` (optional `totp | backup | auto`).

**Success:** `200` `{ "deletedInstallmentCount": number }`. Destructive; repeating after success is
effectively idempotent and returns zero when no rows remain.

**Errors:** `400` invalid body; `401` unauthenticated; `403` wrong role/factor; `429` limited; `500`
RPC/internal failure.

## Scheduled jobs

Every route in this section requires the exact header `Authorization: Bearer <CRON_SECRET>`.
`CRON_SECRET` is trimmed server-side; missing/blank configuration fails closed with `503`,
`Retry-After: 60`, and no-store headers. A missing or mismatched bearer value returns `401` with
no-store headers. The client-supplied `x-vercel-cron` header is never trusted as authentication.

### GET `/api/cron/bookings/reminders`

Finds due advance/same-day booking reminders, emails customers, and stores reminder/event delivery
state.

**Access:** Cron bearer header only. No cookie role, fresh factor, or route-level rate limit.

**Input:** Header `Authorization` as described above. No path/query/body fields. Configuration
controls the absolute attendance-link base URL and lookback window; the lookback is clamped to
15–1,440 minutes.

**Success:** `200` `{ "success": true, "sent": number, "considered": number }`. If reminder tables
are not migrated, returns `200` `{ "success": true, "warning": string, "sent": 0, "considered": 0
}`. For each enabled location/window it queries pending/confirmed bookings, skips already-sent
window markers, emails customers, upserts attendance tokens/reminder metadata, and records email
attempts. Successfully marked windows are repeat-safe; failed delivery can be retried. Candidate or
event-write errors can be logged/skipped without failing the overall job.

**Errors:** `401` bearer missing/invalid; `503` cron auth unconfigured; `500` base URL missing,
settings query failure, or unexpected job failure.

```bash
curl -H 'Authorization: Bearer <cron secret>' \
  https://portal.example/api/cron/bookings/reminders
```

### GET `/api/cron/integrations/frappe/outbox`

Dispatches up to 50 due integration-outbox events to Frappe.

**Access:** Cron bearer header only. No cookie role, fresh factor, or route-level rate limit.

**Input:** Header `Authorization`; no path/query/body fields.

**Success:** `200` `{ "ok": true, "fetched": number, "processed": number, "failed": number }`.
Rows are conditionally reserved, sent with their dedupe key as downstream idempotency key, then
marked processed or scheduled for retry/dead-letter. Concurrent runs skip rows another worker has
reserved. Repeating is safe for processed rows; downstream behavior also relies on the idempotency
key.

**Errors:** `401` bearer missing/invalid; `503` cron auth unconfigured; `500` batch query or
dispatcher failure. Individual downstream failures count in `failed` inside `200`.

### GET `/api/cron/integrations/frappe/timeclock-attendance`

Builds recent employee/day attendance summaries and queues them in the Frappe outbox.

**Access:** Cron bearer header only. No cookie role, fresh factor, or route-level rate limit.

**Input:** Header `Authorization`; optional query `daysBack` is converted with `Number`, defaults to
`3` when absent/empty, and is clamped to `0`–`14`. It has no explicit integer validation; use an
integer. No body.

**Success:** `200` `{ "ok": true, "queued": number }`. Each employee/day summary is upserted with a
stable `attendance:<employee>:<date>` dedupe key, so reruns replace/reset the pending summary rather
than creating duplicates.

**Errors:** `401` bearer missing/invalid; `503` cron auth unconfigured; `500` invalid numeric date
calculation, event query, summary, or outbox failure.

### GET `/api/cron/issue-reports/cleanup`

Purges retained issue-report artifacts after 30 days and solved/closed tickets after 60 days.

**Access:** Cron bearer header only. No cookie role, fresh factor, or route-level rate limit.

**Input:** Header `Authorization`; no path/query/body fields. Retention periods are fixed in source.

**Success:** `200` `{ "deletedArtifactCount": number, "deletedTicketCount": number, "retention": {
"artifactDays": 30, "ticketDays": 60 } }`. Storage deletes are best effort: artifact rows are
soft-marked when an object delete succeeds, and old tickets are deleted after best-effort remaining
object cleanup. Repeating converges on remaining eligible records.

**Errors:** `401` bearer missing/invalid; `503` cron auth unconfigured; `500` unhandled database or
storage failure. Some per-object/delete-query failures are deliberately tolerated and may make
counts lower than the eligible set.

### GET `/api/cron/passports/pak/drafts-cleanup`

Deletes up to 100 cancelled, unconverted, non-paid/refunded Pakistani-passport drafts older than 30
days and soft-deletes their associated documents.

**Access:** Cron bearer header only. No cookie role, fresh factor, or route-level rate limit.

**Input:** Header `Authorization`; no path/query/body fields. Retention is fixed at 30 days.

**Success:** `200` `{ "deletedDraftCount": number, "deletedDocumentCount": number,
"retentionDays": 30 }`. Object deletion is best effort across the recorded/default MinIO bucket and
optional R2 fallback; a document counts only when its database soft-delete succeeds. Draft rows are
then deleted. Reruns process only still-eligible records and are convergent.

**Errors:** `401` bearer missing/invalid; `503` cron auth unconfigured; `500` draft/document query or
draft deletion failure. Individual object/soft-delete failures do not necessarily fail the job.

## Performance telemetry

### POST `/api/vitals`

Accepts bounded browser Core Web Vitals or API-latency metrics. Browser metrics are acknowledged;
API-latency metrics are emitted to structured server logs with only allowlisted fields.

**Access:** Public. Fail-open rate-limit storage with a limit of 120 metrics per IP per minute: if
the limiter backend is unavailable, ingestion continues. No session or factor.

**Input:** JSON, maximum 8 KiB, matching one of two variants. Browser vital: `name` (required enum
`CLS | FCP | INP | LCP | TTFB`), `value` (required finite nonnegative number), `id` (optional trimmed
string, 1–256), `delta` (optional finite number), `rating` (optional enum `good |
needs-improvement | poor`), `navigationType` (optional trimmed string, max 64), and `entries`
(optional array, max 100; accepted but not retained). API latency: `name` must be `api-latency`,
`value` is a required finite nonnegative duration, `path` is a required trimmed string beginning
`/api/` and at most 2,000 characters, `status` is a required integer 0–599, `rating` is required
from the same rating enum, `navigationType` optionally equals `fetch`, and `timestamp` is an
optional finite number. Unknown fields are stripped.

**Success:** `200` `{ "received": true }`. API-latency calls write one structured warning log;
browser-vital payloads are not persisted by this route. Repeated metrics are accepted independently
and are not deduplicated.

**Errors:** `400` invalid metric; `413` body exceeds 8 KiB; `429` rate limit exceeded. Logging or an
unexpected limiter failure outside its fail-open handling can surface as `500`.

```json
{
  "name": "api-latency",
  "value": 842.5,
  "path": "/api/bookings",
  "status": 200,
  "rating": "needs-improvement",
  "navigationType": "fetch"
}
```
