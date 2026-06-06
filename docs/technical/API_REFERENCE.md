# API Reference

> All PT-Portal API routes — methods, parameters, responses  
> Last updated: June 2026

All routes are under `/api/`. All routes are subject to rate limiting: 60 requests/minute per IP.

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

### GET `/api/documents`

List documents for a family with optional filtering and pagination.

**Query parameters:**

| Parameter      | Type   | Required | Default | Description                                                  |
| -------------- | ------ | -------- | ------- | ------------------------------------------------------------ |
| `familyHeadId` | string | Yes      | —       | Family head identifier                                       |
| `page`         | number | No       | `1`     | Page number (1-based)                                        |
| `limit`        | number | No       | `20`    | Items per page (5–100)                                       |
| `category`     | string | No       | —       | Filter by category: `main`, `receipts`, `application-review` |

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "file_name": "passport.pdf",
      "file_size": 524288,
      "file_type": "application/pdf",
      "category": "main",
      "uploaded_at": "2026-03-11T14:00:00Z",
      "minio_key": "family-X/main/1741701600000-passport.pdf",
      "minio_bucket": "portal-documents"
    }
  ],
  "total": 14,
  "page": 1,
  "limit": 20
}
```

---

### POST `/api/documents`

Save document metadata after upload completes.

**Body (JSON):**

| Field           | Type   | Required | Description                             |
| --------------- | ------ | -------- | --------------------------------------- |
| `familyHeadId`  | string | Yes      | Family head identifier                  |
| `fileName`      | string | Yes      | Original file name                      |
| `fileType`      | string | Yes      | MIME type                               |
| `fileSize`      | number | Yes      | Bytes                                   |
| `minioKey`      | string | Yes      | Object key in storage                   |
| `minioEtag`     | string | No       | ETag from storage response              |
| `category`      | string | No       | Document category                       |
| `storageBucket` | string | No       | Bucket name (defaults to MinIO primary) |

**Response:**

```json
{ "success": true, "id": "uuid" }
```

---

### POST `/api/documents/upload-direct`

Upload a file server-side. Tries MinIO first; falls back to R2 if MinIO is unreachable.

**Body (multipart/form-data):**

| Field          | Type   | Required | Description                            |
| -------------- | ------ | -------- | -------------------------------------- |
| `file`         | File   | Yes      | The file to upload (max 1.5 MB)        |
| `familyHeadId` | string | Yes      | Family head identifier                 |
| `category`     | string | No       | Document category (default: `general`) |

**Response:**

```json
{
  "success": true,
  "key": "family-X/main/1741701600000-file.pdf",
  "etag": "\"abc123\"",
  "storageProvider": "minio",
  "storageBucket": "portal-documents"
}
```

`storageProvider` is `"minio"` or `"r2"`. Client uses `storageBucket` in the subsequent metadata POST.

---

### GET `/api/documents/status`

Health check for both storage servers. Used by the status banner.

**Response:**

```json
{
  "success": true,
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

### GET `/api/documents/preview`

Stream a document to the browser for inline display.

**Query parameters:**

| Parameter | Type   | Required | Description        |
| --------- | ------ | -------- | ------------------ |
| `key`     | string | Yes      | Object storage key |

**Response:** Binary file stream with appropriate `Content-Type`.  
**Cache:** `Cache-Control: public, max-age=31536000, immutable`

Falls back to R2 if MinIO fails. Triggers background migration on fallback read.

---

### GET `/api/documents/download`

Stream a document to the browser with `Content-Disposition: attachment` (triggers file save).

Same parameters and fallback behaviour as `/api/documents/preview`.

---

### DELETE `/api/documents/[documentId]`

Soft-delete a document. Removes the object from the appropriate store and marks `deleted = true` in Supabase.

**Response:**

```json
{ "success": true }
```

---

## Authentication

### GET `/api/auth/sessions`

Returns active sessions for the authenticated user. Requires session cookie.

**Response:**

```json
{
  "sessions": [...],
  "currentSession": { ... }
}
```

---

### POST `/api/auth/update-password`

Change the authenticated user's password.

**Body:** `{ "password": "newpassword" }`

---

### POST `/api/auth/generate-backup-codes`

Generate a new set of 2FA backup codes for the authenticated user.

**Response:** `{ "codes": ["XXXX-XXXX", ...] }` — shown once, not stored in plain text.

---

### GET `/api/auth/backup-codes/count`

Returns the number of unused backup codes remaining.

**Response:** `{ "count": 5 }`

---

### POST `/api/auth/consume-backup-code`

Use a single backup code for authentication (single-use).

**Body:** `{ "code": "XXXX-XXXX" }`

---

### POST `/api/auth/reset-2fa`

Admin-only. Disables 2FA for a specified user.

**Body:** `{ "userId": "uuid" }`  
**Auth:** Requires `Authorization: Bearer <admin-token>`

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

| Parameter     | Type   | Required | Description                   |
| ------------- | ------ | -------- | ----------------------------- |
| `from`        | string | Yes      | ISO datetime lower bound      |
| `to`          | string | Yes      | ISO datetime upper bound      |
| `location_id` | string | No       | Filter to one branch location |
| `status`      | string | No       | Filter by booking status or `all` |
| `source`      | string | No       | Filter by booking source or `all` |
| `service_id`  | string | No       | Filter by booking service or `all` |
| `q`           | string | No       | Search across name, phone, email, notes |
| `include_cancelled` | boolean | No | Set `false` to hide cancelled bookings |

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

| Parameter      | Type   | Required | Description |
| -------------- | ------ | -------- | ----------- |
| `date`         | string | Yes      | `YYYY-MM-DD` |
| `service_id`   | string | Yes      | Service id |
| `location_id`  | string | Yes      | Branch/location id |
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

> All admin endpoints require `Authorization: Bearer <admin-token>`.

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

Reset a user's password.

---

### POST `/api/admin/create-installments`

Create installment records for an account.

---

### POST `/api/admin/create-installments-table`

One-time migration: create the installments table structure.

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
