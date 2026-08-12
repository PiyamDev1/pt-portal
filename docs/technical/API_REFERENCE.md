# API Reference

> PT-Portal API routes — methods, parameters, and security-relevant contracts
> Last updated: August 12, 2026

All routes are under `/api/`. Protected staff routes use the Supabase cookie-backed session and verify the user with `auth.getUser()`; administrative routes then apply an employee role/department guard. Do not send service-role credentials or caller-selected employee IDs as identity proof.

Sensitive routes have route-specific PostgreSQL-backed fixed-window limits. A blocked request returns `429` with `Retry-After`; a sensitive route returns `503` and fails closed when the shared limiter is unavailable. Limits are intentionally not one global “requests per IP” value.

---

## Table of Contents

1. [Documents](#documents)
2. [Authentication](#authentication)
3. [NADRA](#nadra)
4. [Pakistani Passports](#pakistani-passports)
5. [GB Passports](#gb-passports)
6. [Visas](#visas)
7. [LMS (Loan Management)](#lms-loan-management)
8. [Timeclock](#timeclock)
9. [Admin](#admin)
10. [Vitals](#vitals)

---

## Documents

All staff-facing document endpoints require a verified active staff session. Document data is private and responses containing metadata, streams, or signed URLs use `private, no-store` semantics unless noted otherwise. The scheduled migration worker is the exception: it accepts only the server-configured cron token and is not a browser API.

### GET `/api/documents`

List documents for a family with optional filtering and pagination.

**Query parameters:**

| Parameter      | Type   | Required | Default | Description                                   |
| -------------- | ------ | -------- | ------- | --------------------------------------------- |
| `familyHeadId` | string | Yes      | —       | Family head identifier                        |
| `page`         | number | No       | `1`     | Page number (1-based)                         |
| `limit`        | number | No       | `20`    | Items per page (5–100)                        |
| `category`     | string | No       | —       | `general`, `receipt`, or `application-review` |

**Response:**

```json
{
  "documents": [
    {
      "id": "doc-uuid",
      "fileName": "passport.pdf",
      "fileSize": 524288,
      "fileType": "application/pdf",
      "category": "general",
      "uploadedAt": "2026-08-12T14:00:00Z",
      "uploadedBy": "user-uuid",
      "familyHeadId": "family-id",
      "minio": {
        "bucket": "portal-documents",
        "key": "family-family-id/general/doc-uuid-passport.pdf",
        "etag": "etag"
      }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 14, "pages": 1 }
}
```

The scope must resolve to an existing applicant, application, or Pakistani-passport draft. Unknown or malformed scopes are rejected.

---

### POST `/api/documents`

Standalone metadata creation is disabled. The endpoint returns `410 Gone`; use `/api/documents/upload-direct` so the server owns both object creation and metadata persistence.

---

### POST `/api/documents/upload-direct`

Upload and persist a document in one server-owned operation. The route is limited to 20 requests per user/IP in ten minutes, tries private MinIO first, and falls back to the private R2 vault when configured.

**Body (multipart/form-data):**

| Field          | Type   | Required | Description                                                      |
| -------------- | ------ | -------- | ---------------------------------------------------------------- |
| `file`         | File   | Yes      | PDF, JPEG, PNG, or WebP; max 1.5 MB                              |
| `familyHeadId` | string | Yes      | Existing applicant/application/draft scope                       |
| `category`     | string | No       | `general`, `receipt`, or `application-review`; default `general` |

**Response:**

```json
{
  "documentId": "doc-uuid",
  "minioKey": "family-family-id/general/doc-uuid-file.pdf",
  "etag": "\"abc123\"",
  "storageProvider": "minio",
  "storageBucket": "portal-documents",
  "fileName": "file.pdf",
  "fileSize": 524288,
  "fileType": "application/pdf",
  "category": "general",
  "familyHeadId": "family-id"
}
```

The route verifies file signatures and requires the declared MIME type and extension to match the detected content. `storageProvider` is `"minio"` or `"r2"`. The client must not submit a second metadata request.

---

### GET `/api/documents/status`

Authenticated health check for the document vault. It may also run bounded storage maintenance.

**Response:**

```json
{
  "status": {
    "connected": true,
    "ping": 42,
    "timestamp": "2026-03-11T14:00:00.000Z",
    "endpoint": "https://eu49v2.piyamtravel.com",
    "mode": "primary",
    "fallback": {
      "configured": true,
      "connected": true,
      "endpoint": "https://eu45v5.piyamtravel.com",
      "bucket": "portal-fallback",
      "ping": 110
    },
    "capabilities": {
      "upload": true,
      "previewDownload": true,
      "uploadOnlyFallback": false
    }
  }
}
```

`mode` values: `"primary"` | `"fallback-upload-only"` | `"offline"`

---

### GET `/api/documents/[documentId]/preview`

Return a short-lived preview URL for a live document record.

**Response:** `{ "url": "https://signed-storage-url" }`

### GET `/api/documents/[documentId]/download`

Redirect to a short-lived download URL for a live document record.

### GET `/api/documents/preview`

Compatibility streaming endpoint. Prefer `documentId`; a legacy `key` is accepted only when it first resolves to a live, non-deleted database record.

**Query parameters:**

| Parameter    | Type   | Required | Description                                         |
| ------------ | ------ | -------- | --------------------------------------------------- |
| `documentId` | string | No       | Preferred document identifier                       |
| `key`        | string | No       | Legacy key; cannot address arbitrary stored objects |

Exactly one resolvable identifier is required. The response is a binary stream with safe content disposition, `X-Content-Type-Options: nosniff`, a sandbox CSP, and `Cache-Control: private, no-store`.

Storage selection comes from the database record; it is not chosen by the caller.

---

### GET `/api/documents/download`

Compatibility download stream with the same record-resolution rules as `/api/documents/preview` and `Content-Disposition: attachment`.

---

### DELETE `/api/documents/[documentId]`

Revoke the live database record, remove its resolved object, and restore the record if storage deletion fails.

**Response:**

```json
{ "deletedDocumentId": "doc-uuid" }
```

---

## Authentication

Authentication responses containing tokens or security material are non-cacheable. Validation failures use `{ "error": "message" }` with an appropriate `4xx` status.

### POST `/api/auth/password-login`

Server-mediated password verification and login-guard accounting.

**Body:** `{ "email": "staff@example.com", "password": "current password" }`

**Success:** `{ "accessToken": "...", "refreshToken": "..." }`

The browser passes the returned pair to the Supabase browser client to establish the cookie-backed session. Rejected credentials return a generic `401`; shared IP/email limits and the login guard return `429` with `Retry-After` when blocked.

### GET `/api/auth/sessions`

Returns active sessions for the authenticated user. Requires session cookie.

**Response:**

```json
{
  "sessions": [
    {
      "id": "session-id",
      "created_at": "2026-08-12T10:00:00Z",
      "last_active": "2026-08-12T14:00:00Z",
      "ip": "192.0.2.1",
      "user_agent": "browser user agent",
      "is_current": true,
      "is_active": true
    }
  ]
}
```

The response is deduplicated by device and limited to the six most recent sessions.

### DELETE `/api/auth/sessions`

Revoke one session or sign out all devices. Both forms require the current verified user and share a limit of ten requests per user/IP in 15 minutes.

**Body:** `{ "type": "single", "id": "session-id" }` or `{ "type": "all" }`

---

### POST `/api/auth/update-password`

Change the authenticated user's password after server-side reauthentication.

**Body:**

```json
{
  "currentPassword": "current password",
  "newPassword": "NewStrongPassword!1"
}
```

The new password must contain at least eight characters, lowercase and uppercase letters, a number, and a special character.

**Success:**

```json
{ "updatedUserId": "uuid", "message": "Password updated successfully" }
```

---

### POST `/api/auth/generate-backup-codes`

Atomically replace the authenticated user's backup-code set. Requires a fresh second factor.

**Body:**

```json
{
  "count": 10,
  "verificationCode": "123456",
  "verificationMethod": "totp"
}
```

`count` is 1–10 and `verificationMethod` is `totp`, `backup`, or `auto`.

**Response:** `{ "codes": ["XXXX-XXXX", "..."], "generatedCount": 10 }` — shown once and never stored in plaintext.

---

### GET `/api/auth/backup-codes/count`

Returns the number of unused backup codes remaining.

**Response:** `{ "count": 5 }`

---

### POST `/api/auth/consume-backup-code`

Use a single backup code for the authenticated, in-progress login session. Consumption is conditional and concurrency-safe.

**Body:** `{ "code": "XXXX-XXXX" }`

---

### POST `/api/auth/reset-2fa`

Self-service reset of the caller's own 2FA factors. Requires a fresh current TOTP or unused backup code; it cannot select another user.

**Body:**

```json
{ "verificationCode": "123456", "verificationMethod": "totp" }
```

**Success:** `{ "resetUserId": "uuid", "removedFactors": 1 }`

---

## NADRA

### POST `/api/nadra/add-application`

Create a new NADRA service application.

**Key body fields:** `applicantCnic`, `applicantName`, `familyHeadCnic`, `familyHeadName`, `serviceType`, `serviceOption`, `agentId`

---

### GET `/api/nadra/metadata`

Fetch metadata for the NADRA ledger (service types, statuses, agents).

---

### GET `/api/nadra/agent-options`

Returns available agent options for the NADRA form.

---

### POST `/api/nadra/update-status`

Update the status of a NADRA application.

**Body:** `{ "applicationId": "...", "status": "...", "notes": "..." }`

---

### GET `/api/nadra/status-history`

Returns status history for a NADRA application.

**Query:** `?applicationId=`

---

### POST `/api/nadra/manage-record`

Create, update or delete a NADRA record.

---

## Pakistani Passports

### POST `/api/passports/pak/add-application`

Add a new Pakistani passport application.

---

### GET `/api/passports/pak/metadata`

Fetch metadata for passport forms.

---

### POST `/api/passports/pak/update-status`

Update passport application status.

---

### GET `/api/passports/pak/status-history`

Status change history for a passport application.

**Query:** `?applicationId=`

---

### POST `/api/passports/pak/update-custody`

Update passport custody status (received / dispatched).

---

### GET|POST `/api/passports/pak/notes`

Get or add notes for a passport application.

---

### POST `/api/passports/pak/manage-record`

Create, update or delete a passport record.

---

## GB Passports

### POST `/api/passports/gb/add`

Add a new GB passport application.

---

### GET `/api/passports/gb/metadata`

Fetch GB passport form metadata.

---

### POST `/api/passports/gb/update`

Update a GB passport application.

---

### GET `/api/passports/gb/status-history`

Status change history for a GB passport.

---

### DELETE `/api/passports/gb/delete`

Delete a GB passport application.

---

## Visas

### POST `/api/visas/add-application`

Create a new visa application.

---

### GET `/api/visas/metadata`

Returns visa types, countries, and form metadata.

---

### POST `/api/visas/save`

Save/update a visa application.

---

### POST `/api/visas/update-status`

Update visa application status.

---

## Bookings

The bookings subsystem is still under active development. Routes include schema guards and may return warnings or setup hints when the booking schema is not fully deployed.

### GET `/api/bookings`

List bookings within a date range for a branch calendar/list view.

**Query parameters:**

| Parameter           | Type    | Required | Description                             |
| ------------------- | ------- | -------- | --------------------------------------- |
| `from`              | string  | Yes      | ISO datetime lower bound                |
| `to`                | string  | Yes      | ISO datetime upper bound                |
| `location_id`       | string  | No       | Filter to one branch location           |
| `status`            | string  | No       | Filter by booking status or `all`       |
| `source`            | string  | No       | Filter by booking source or `all`       |
| `service_id`        | string  | No       | Filter by booking service or `all`      |
| `q`                 | string  | No       | Search across name, phone, email, notes |
| `include_cancelled` | boolean | No       | Set `false` to hide cancelled bookings  |

### POST `/api/bookings`

Create a new booking.

**Key body fields:**

- `location_id`
- `customer_name`
- `customer_phone`
- `customer_email`
- `service_id`
- `start_time`
- `person_count`
- `tags`
- `notes`
- `manual_override`
- `source`
- `idempotency_key`

Creates the booking, computes effective duration from service rules, writes audit/email records, supports idempotency replay, and may reject the request if the slot conflicts or the customer is blocked by no-show penalty settings.

### PATCH `/api/bookings/[id]`

Update a booking's status or appointment details.

Supported changes include:

- `status`
- `customer_name`
- `customer_phone`
- `customer_email`
- `service_id`
- `start_time`
- `notes`
- `tags`
- `person_count`
- `idempotency_key`

Optional concurrency guard:

- `if_unmodified_since`: previous `updated_at` value; returns `409` on conflict

Notes-only or tags-only edits stay internal and do not send customer-facing email. State transitions are now validated server-side.

### GET `/api/bookings/[id]/history`

Return the booking audit timeline and email delivery log.

### POST `/api/bookings/[id]/resend`

Manual staff action to re-send booking email details. Optional body fields:

- `kind`: `confirmation` | `modification` | `cancellation`
- `reason`
- `idempotency_key`

### GET `/api/bookings/available-slots`

Return available slots for a branch/service/date combination.

**Query parameters:**

| Parameter      | Type   | Required | Description             |
| -------------- | ------ | -------- | ----------------------- |
| `date`         | string | Yes      | `YYYY-MM-DD`            |
| `service_id`   | string | Yes      | Service id              |
| `location_id`  | string | Yes      | Branch/location id      |
| `person_count` | number | No       | Group size, default `1` |

Slot generation accounts for:

- Branch opening hours
- Lunch and prayer windows
- One-off schedule overrides
- Concurrent staff capacity
- Service duration and buffer
- Extra per-person duration
- End-of-day overrun tolerance

### GET `/api/bookings/settings/branch`

Return weekly branch schedule rows from `branch_settings`.

### PATCH `/api/bookings/settings/branch`

Upsert weekly branch schedule rows for a branch.

### GET `/api/bookings/settings/overrides`

List one-off schedule overrides.

### POST `/api/bookings/settings/overrides`

Create or replace a one-off branch schedule override for a specific date.

### GET `/api/bookings/settings/services`

List booking services for a branch.

### POST `/api/bookings/settings/services`

Create a booking service with timing rules and email templates.

Service configuration currently supports:

- `duration_minutes`
- `buffer_minutes`
- `available_days`
- `service_start_time`
- `service_end_time`
- `duration_per_additional_person_minutes`
- `person_count_excludes_family_head`
- `close_overrun_tolerance_minutes`
- `confirmation_template`
- `modification_template`
- `cancellation_template`

### GET `/api/bookings/settings/reminders`

Return reminder/no-show settings for a branch. If the reminder schema is not yet deployed, this returns defaults plus a warning.

### PATCH `/api/bookings/settings/reminders`

Update reminder settings including:

- `reminders_enabled`
- `reminder_hours_before`
- `same_day_reminder_enabled`
- `same_day_reminder_hours_before`
- `reminder_subject`
- `reminder_template`
- `attendance_confirmation_required`
- `penalty_enabled`
- `penalty_threshold`
- `penalty_action`
- `penalty_note`

### GET `/api/bookings/attendance/respond`

Customer-facing response link for reminder attendance confirmation.

**Query parameters:**

- `token`
- `status=present|missed`

Marks the reminder response and, for `missed`, increments branch-scoped contact flags.

### POST `/api/bookings/telemetry`

Best-effort operational telemetry endpoint for booking UI events.

### GET `/api/cron/bookings/reminders`

Cron endpoint that sends both advance reminder emails and same-day reminder emails for upcoming bookings, writes reminder event state, appends attendance confirmation links when enabled, and records delivery attempts in `booking_email_logs`.

### GET `/api/bookings/export`

Export matching bookings as CSV.

### GET `/api/bookings/report`

Return summary metrics for the selected range, including totals by status/source/service and recently modified count.

---

## LMS (Loan Management)

### GET `/api/lms`

List loan accounts with pagination.

**Query parameters:** `filter` (`active`|`overdue`|`all`|`settled`), `accountId`, `page`, `limit` (max 100)

---

### POST `/api/lms`

Create a new loan account with installment plan.

---

### GET `/api/lms/installments`

Get installments for an account.

**Query:** `?accountId=`

---

### POST `/api/lms/installment-payment`

Record a payment against an installment.

---

### POST `/api/lms/skip-installment`

Mark an installment as skipped.

---

### POST `/api/lms/update-installments`

Bulk update installment records.

---

### GET|POST `/api/lms/notes`

Get or add notes for a loan account.

---

### GET `/api/lms/audit-logs`

Audit log for a loan account.

---

### GET `/api/lms/payment-methods`

Returns available payment methods.

---

### DELETE `/api/lms/delete-installment-plan`

Delete all installments for an account.

---

## Timeclock

### GET|POST `/api/timeclock/events`

Get or create timeclock events (clock-in/clock-out).

---

### POST `/api/timeclock/scan`

Process a QR code scan for clock-in/out.

**Body:** `{ "qrData": "...", "employeeId": "..." }`

---

### POST `/api/timeclock/manual-entry/generate`

Generate a manual entry code.

---

### POST `/api/timeclock/manual-entry/submit`

Submit a manual clock entry with a generated code.

---

### GET `/api/timeclock/manual-entry/diagnostics`

Returns diagnostics for the manual entry system.

---

## Admin

Administrative endpoints require the canonical verified staff cookie/session guard. Each route then enforces its own role scope; there is no client-supplied service-role or blanket admin Bearer-token contract. `401` means the session is missing or invalid, while `403` means the authenticated employee lacks the required role or fresh second factor.

### POST `/api/admin/add-employee`

Create a new employee record.

---

### DELETE `/api/admin/delete-employee`

Delete an employee.

---

### POST `/api/admin/disable-enable-employee`

Toggle employee active/disabled status.

---

### POST `/api/admin/reset-password`

Reset another employee's password. Requires an administrative role and a fresh administrator TOTP or backup code. The generated credential is temporary, the employee is forced through the password-change flow, and delivery uses the configured mail provider.

---

### POST `/api/admin/recover-employee-2fa`

Audited break-glass recovery for another employee. Requires a Master Admin or Super Admin session, the administrator's fresh second factor, the exact target email, and a reason of at least ten characters. Self-recovery is rejected; use `/api/auth/reset-2fa` for the current account.

**Body:**

```json
{
  "employeeId": "target-uuid",
  "confirmEmail": "target@example.com",
  "reason": "Lost access to registered device",
  "verificationCode": "123456",
  "verificationMethod": "totp"
}
```

**Success:**

```json
{
  "recoveredEmployeeId": "target-uuid",
  "employeeName": "Employee Name",
  "removedFactors": 1,
  "requiresSetup": true
}
```

---

### POST `/api/admin/create-installments`

Create installment records for an account.

---

### POST `/api/admin/create-installments-table`

Maintenance-role schema readiness check. This route does not create tables at runtime. It returns `503` until `scripts/migrations/20260812_secure_atomic_lms_operations.sql` has installed a compatible `lms` schema marker and capabilities.

---

### GET|POST `/api/admin/server-control`

Master/Super Admin only. `GET` reads the configured server status. `POST` accepts the allowlisted `start`, `stop`, or `restart` action and requires a fresh TOTP or backup code.

---

### POST `/api/admin/seed-pricing`

Seed initial pricing data.

---

### POST `/api/admin/seed-countries`

Seed country reference data.

---

### POST `/api/admin/seed-payment-methods`

Seed payment method reference data.

---

### POST `/api/admin/seed-presets`

Seed pricing presets.

---

### POST `/api/admin/migrate-installment-amounts`

Data migration: normalise installment amount fields.

---

### POST `/api/admin/migrate-names-lowercase`

Data migration: normalise name casing to lowercase.

---

### POST `/api/admin/clear-lms`

Clear all LMS data (destructive — use with caution).

---

## Vitals

### POST `/api/vitals`

Receives Web Vitals metrics (CLS, LCP, FID, etc.) from the client for logging.

Powered by the `WebVitalsReporter` component using the `web-vitals` library.
