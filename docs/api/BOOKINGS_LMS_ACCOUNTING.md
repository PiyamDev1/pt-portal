# Bookings, LMS, Accounting, and Receipts API

Last verified against the route implementations, shared schemas, database types,
and focused tests on August 12, 2026.

This reference covers every exported HTTP method below `app/api/bookings`,
`app/api/lms`, `app/api/accounting`, and `app/api/receipts`. Unless stated
otherwise, request bodies and responses use `application/json`; JSON failures
have the shape `{ "error": string, ...details }`.

## Shared data shapes

### Booking records

A `Booking` is the complete stored row:

- `id: string`; `location_id: string | null`; `service_id: string`.
- `customer_name: string`; `customer_phone: string`;
  `customer_email: string | null`.
- `person_count: number`; `tags: string[]`; `notes: string | null`.
- `start_time: string`; `end_time: string`; both are ISO 8601 timestamps.
- `status: "pending" | "confirmed" | "cancelled" | "completed"`.
- `source: "portal" | "whatsapp" | "website"`.
- `manual_override: boolean`;
  `attendance_status: "unknown" | "present" | "missed" | "manual_no_show"`.
- `created_at`, `updated_at`, and `last_rescheduled_at`: ISO strings or `null`;
  `reschedule_count: number`.
- Email-delivery state: `last_email_sent_at`, `last_email_kind`,
  `last_email_status`, `last_email_error`, `last_email_subject`, and
  `last_email_recipient`, each a string or `null`.

List responses can add `booking_services: { name: string,
duration_minutes?: number } | null`.

### Booking service, schedule, and waitlist records

A `BookingService` contains `id`, `location_id`, `name`, `duration_minutes`,
`buffer_minutes`, `available_days: number[] | null`,
`service_start_time: string | null`, `service_end_time: string | null`,
`confirmation_template`, `modification_template`, and
`cancellation_template` (strings or `null`),
`duration_per_additional_person_minutes: number`,
`person_count_excludes_family_head: boolean`,
`close_overrun_tolerance_minutes: number`, `slot_interval_minutes: number |
null`, `is_active: boolean`, and `created_at: string | null`.

A `BranchSetting` contains `id`, `location_id`, `day_of_week` (`0` Sunday
through `6` Saturday), `open_time`, `close_time`, nullable lunch/prayer start
and end times, `is_closed`, `concurrent_staff`, and `slot_interval_minutes`.
Times are database time strings, normally `HH:MM:SS`.

A `ScheduleOverride` contains the same hours, break, closure, capacity, and slot
fields for one `date: YYYY-MM-DD`, plus `id`, `location_id`, and nullable
`notes`. Its open/close values may also be `null`.

A `WaitlistEntry` contains `id`, `location_id`, nullable `service_id`, customer
name/phone and nullable email, `person_count`, nullable preferred date/start/end
times, `source`, string `status`, nullable `notes` and `linked_booking_id`, JSON
`metadata`, and nullable creation/update timestamps. Joined responses add
`booking_services: { name: string } | null`.

### LMS account records

An LMS account item contains `id`, `name`, `firstName`, `lastName`, `phone`,
`email`, `address`, numeric `balance`, `activeLoans`, `totalLoans`, nullable
`nextDue` and `lastTransaction`, booleans `isOverdue` and `isDueSoon`, plus
`transactions` and `loans` arrays containing their complete database rows.
Transaction rows include `loan_payment_methods: { name: string } | null`.

A loan row has `id`, `loan_customer_id`, `employee_id`, numeric
`total_debt_amount` and `current_balance`, nullable `term_months` and
`next_due_date`, `status: "Active" | "Defaulted" | "Paid Off" | "Written
Off"`, and `created_at`. A transaction row has `id`,
`loan_id`, `employee_id`, `transaction_type`, numeric `amount`, nullable
`payment_method_id`, `remark`, `due_date`, `installment_id`,
`service_transaction_id`, `service_category_id`, `payer_name`,
`package_ref_status`, plus `transaction_timestamp` and `created_at`.
`transaction_type` is one of `DEBT`, `PAYMENT`, `service`, `payment`, or `fee`;
`package_ref_status` is `Not Applicable`, `Linked`, or `Warning: Missing PNR`.
An
installment row has `id`, `loan_transaction_id`, `installment_number`,
`due_date`, numeric `amount`, nullable numeric `amount_paid`, string `status`,
and `created_at`. A payment-method row is `{ id: string, name: string }`.

LMS endpoints require an authenticated Supabase user whose matching employee
profile exists and is not inactive unless a route says otherwise. `401` means
there is no valid session; `403` means the employee profile is missing,
inactive, or lacks the required role. Rate-limited endpoints use shared
Postgres-backed user and IP buckets, return `429` with `Retry-After`, and fail
closed with `503` if request protection is unavailable.

## Bookings

### GET `/api/bookings`

Lists bookings in a half-open start-time interval and optionally filters the
dashboard result.

**Access:** No explicit route guard. The query uses the caller's cookie-scoped
Supabase client, so database RLS is the authorization boundary. No route-level
rate limit or fresh 2FA.

**Input:** Query parameters `from` and `to` are required timestamp strings and
are applied as `start_time >= from` and `start_time < to`. Optional
`location_id`, `status`, `source`, and `service_id` are exact database filters;
the literal `all` disables each corresponding filter. Optional `q` is trimmed
and performs a case-insensitive substring search over customer name, phone,
email, and notes. Optional `modified_since` applies `updated_at >= value`.
`include_cancelled` defaults to `true`; only the exact string `false` excludes
cancelled rows, and an explicit non-`all` `status` takes precedence.

**Success:** `200 { "bookings": Booking[] }`, ordered by `start_time`
ascending; every item includes joined `booking_services.name` and
`booking_services.duration_minutes`. If booking schema objects are absent, the
route deliberately returns `200 { "bookings": [], "warning": string }`.

**Errors:** `400` when `from` or `to` is missing; `500` for query or unexpected
failures. Supabase validates timestamp/filter values that the route itself does
not parse.

### POST `/api/bookings`

Creates a pending appointment, reserves one unit of branch capacity, sends a
confirmation email best-effort, and writes email/audit records.

**Access:** No explicit route guard. All reads and writes use the caller's
cookie-scoped Supabase client and therefore rely on RLS. No route-level rate
limit or fresh 2FA.

**Input:** JSON object:

- Required `location_id`, `customer_name`, `customer_phone`, `customer_email`,
  `service_id`, and `start_time`, all strings. `customer_email` must match a
  basic `local@domain.tld` check. Phone must start with `+`, contain a 1-4 digit
  country code followed by a space, and then 6-20 digits/space/parenthesis/hyphen
  characters. `start_time` must parse as ISO 8601.
- Optional `end_time: string`. It is required, valid, and later than
  `start_time` when `manual_override === true`; otherwise the server computes
  the end from service duration and group size.
- Optional `manual_override: boolean`, default `false`. It permits past dates
  and bypasses normal opening-hours/break checks, but still enforces concurrent
  staff capacity and requires `end_time`.
- Optional `person_count: number | numeric string`, coerced to an integer with
  minimum/default `1`. Optional `tags: string[]` are trimmed, lowercased,
  whitespace-to-hyphen normalized, deduplicated, and non-string values dropped.
- Optional `notes: string | null`; strings are trimmed and empty strings become
  `null`. Optional `source` is intended to be `portal`, `whatsapp`, or
  `website`; a missing/falsy value defaults to `portal`, but the route does not
  runtime-reject other truthy values.
- Optional `idempotency_key: string`, or an `Idempotency-Key` header. The header
  wins. A previously recorded key for `booking.create` returns its stored
  booking instead of creating another.

Example:

```http
POST /api/bookings
Content-Type: application/json
Idempotency-Key: booking-2026-08-12-jane-1430

{
  "location_id": "branch-uuid",
  "customer_name": "Jane Ahmed",
  "customer_phone": "+44 7123456789",
  "customer_email": "jane@example.com",
  "service_id": "service-uuid",
  "start_time": "2026-08-20T14:30:00.000Z",
  "person_count": 2,
  "tags": ["Family Booking", "priority"],
  "source": "portal"
}
```

**Success:** `201 { "success": true, "booking": Booking,
"email_warning"?: string }`. The booking is persisted even if email delivery
fails. An idempotent replay returns the stored response code (normally `201`)
and adds `idempotent_replay: true`.

**Errors:** `400` for missing/invalid contact or timestamps, a past non-manual
date, inactive/unavailable service, closure, service-day/hour/break violations,
or an invalid manual interval; `404` when the service is not found; `409` for
contact penalties or exhausted concurrent capacity; `503` for an outdated
booking schema; `500` for eligibility/settings/query/insert failures.
Capacity reservation is atomic after insert; on reservation conflict the newly
inserted booking is deleted. Creating with the same business data but no
idempotency key is not idempotent.

### PATCH `/api/bookings/[id]`

Amends, reschedules, or changes a booking's workflow status.

**Access:** No explicit route guard; the cookie-scoped Supabase client and RLS
are the authorization boundary. No route-level rate limit or fresh 2FA. Path
`id` is the booking identifier.

**Input:** JSON object with at least one of: `status` (`pending`, `confirmed`,
`cancelled`, or `completed`), `customer_name`, `customer_phone`,
`customer_email`, `service_id`, `start_time`, `end_time`,
`manual_override: boolean`, `notes: string | null`, `tags: string[]`, or
`person_count: number | numeric string`. Email, phone, group-size, tag,
availability, timing, and manual-override rules match booking creation.
`if_unmodified_since?: string` is an optimistic-concurrency token that must
exactly equal the current `updated_at`. `idempotency_key?: string` or the
`Idempotency-Key` header scopes replay protection to `booking.update:[id]`.

Allowed status transitions are: pending to pending/confirmed/cancelled;
confirmed to confirmed/pending/completed/cancelled; cancelled to
cancelled/pending/confirmed; completed to completed/confirmed.

```json
{
  "status": "confirmed",
  "start_time": "2026-08-22T10:00:00.000Z",
  "person_count": 3,
  "if_unmodified_since": "2026-08-12T09:15:00.000Z",
  "idempotency_key": "reschedule-booking-42-v2"
}
```

**Success:** `200 { "success": true, "booking": Booking,
"email_resent": boolean, "email_sent": boolean, "rescheduled": boolean,
"email_warning"?: string }`; a replay adds `idempotent_replay: true`. Customer
visible/contact/status changes can send confirmation, modification, or
cancellation email. The route records audit history, increments reschedule
metadata, and releases/reserves capacity as appropriate.

**Errors:** `400` for no changes, invalid status/contact/timestamps,
disallowed status transitions, service-day/hour/break violations, or invalid
manual intervals; `404` for a missing booking/service; `409` for stale
`if_unmodified_since` (with `latest_updated_at`) or exhausted capacity; `503`
for outdated schema; `500` otherwise. If post-update capacity reservation
fails, the route attempts to restore the prior booking values before returning
`409`.

### GET `/api/bookings/available-slots`

Computes candidate appointment starts in five-minute increments, respecting
service duration, per-person duration, buffer, branch/service hours, breaks,
one-off overrides, tolerance, and concurrent capacity.

**Access:** No explicit route guard; uses the cookie-scoped Supabase client and
RLS. No route-level rate limit or fresh 2FA.

**Input:** Required query `date: YYYY-MM-DD`, `service_id: string`, and
`location_id: string`. Optional `person_count` is integer-coerced with
minimum/default `1`.

**Success:** `200 { "date": string, "service_id": string, "slots": Array<{
"time": "HH:MM", "isoString": string }> }`. Closed days, inactive services,
or days outside `available_days` return an empty array. Missing branch schema
may instead return the same shape plus `warning`.

**Errors:** `400` for missing parameters or malformed date; `404` for a missing
service; `503` for required schema drift; `500` for settings, override, booking,
or unexpected failures.

### GET `/api/bookings/drafts`

Loads the current user's saved appointment-form draft.

**Access:** Valid Supabase session required; the query is additionally scoped
to `auth.user.id`. No rate limit or fresh 2FA.

**Input:** Required query `location_id: string`; optional `draft_key: string`
defaults to `appointment-form` (an explicitly empty value also defaults).

**Success:** `200 { "payload": object | null, "updated_at": string | null }`.

**Errors:** `400` missing location; `401` unauthenticated; `500` database error.

### PATCH `/api/bookings/drafts`

Creates or replaces one user/location/key draft.

**Access:** Valid Supabase session required; no rate limit or fresh 2FA.

**Input:** JSON `location_id: string` and `payload: object` are required.
`draft_key?: string` is trimmed and defaults to `appointment-form`. Arrays and
`null` are technically JavaScript objects; because the route checks both
`typeof payload === "object"` and truthiness, arrays are accepted but `null` is
rejected.

**Success:** `200 { "success": true }`. Upsert conflict key is
`user_id,location_id,draft_key`, so retrying replaces the same draft.

**Errors:** `400` invalid/missing fields; `401` unauthenticated; `500` database
error.

### DELETE `/api/bookings/drafts`

Deletes one current-user draft; deleting a nonexistent row is a successful
no-op.

**Access:** Valid Supabase session required; no rate limit or fresh 2FA.

**Input:** Required query `location_id: string`; optional `draft_key` defaults
to `appointment-form`.

**Success:** `200 { "success": true }`.

**Errors:** `400` missing location; `401` unauthenticated; `500` database error.

### GET `/api/bookings/export`

Exports matching appointments as CSV.

**Access:** No explicit route guard; the cookie-scoped Supabase client and RLS
control visible rows. No rate limit or fresh 2FA.

**Input:** Required query `from` and `to` timestamp strings define
`start_time >= from` and `< to`. Optional exact filters are `location_id`,
`status`, and `source`; `all` disables the status/source filters.

**Success:** `200 text/csv; charset=utf-8` with attachment filename
`bookings-{from-date}-{to-date}.csv`. Columns are Customer Name, Customer
Phone, Customer Email, Service, Status, Source, Person Count, Tags, Start Time,
End Time, Last Email Status, Last Email Subject, and Notes. Values are
quote-escaped; bookings are ordered by start time.

**Errors:** JSON `400` when either date bound is missing; JSON `500` for query
or unexpected errors.

### GET `/api/bookings/preferences`

Gets the signed-in user's saved booking-dashboard views for one branch.

**Access:** Valid Supabase session required; data is scoped to user and
location. No rate limit or fresh 2FA.

**Input:** Required query `location_id: string`.

**Success:** `200 { "saved_views": SavedView[] }`. Each view has `name`,
`source: "all" | "portal" | "whatsapp" | "website"`,
`status: "all" | "pending" | "confirmed" | "completed" | "cancelled"`,
`serviceId: string`, `searchQuery: string`, and `showCancelled: boolean`.
Stored data is sanitized before returning.

**Errors:** `400` missing location; `401` unauthenticated; `500` database or
unexpected failure.

### PATCH `/api/bookings/preferences`

Replaces the current user's saved views for one branch.

**Access:** Valid Supabase session required; no rate limit or fresh 2FA.

**Input:** JSON `location_id: string` is required. `saved_views` may be any
value; non-arrays become `[]`. Array entries without a nonblank `name` are
dropped. Unknown source/status values become `all`; `serviceId` and
`searchQuery` stringify with empty defaults; `showCancelled` defaults to true
unless exactly false. At most the first 20 valid entries are stored.

**Success:** `200 { "success": true, "saved_views": SavedView[] }`. Upsert is
idempotent for `user_id,location_id` and replaces the full array.

**Errors:** `400` missing location; `401` unauthenticated; `500` database or
unexpected failure.

### GET `/api/bookings/report`

Aggregates appointment counts for a date interval.

**Access:** No explicit route guard; cookie-scoped Supabase plus RLS. No rate
limit or fresh 2FA.

**Input:** Required query `from` and `to` timestamp strings use the same
half-open start-time range as booking lists. Optional `location_id` filters one
branch.

**Success:** `200` JSON:

```json
{
  "totals": {
    "total": 18,
    "cancelled": 2,
    "completed": 7,
    "pending": 3,
    "confirmed": 6,
    "recently_modified": 4
  },
  "by_status": { "confirmed": 6 },
  "by_source": { "portal": 12 },
  "by_service": { "Passport appointment": 8 }
}
```

`recently_modified` means `updated_at` (falling back to `start_time`) is within
24 hours of server execution.

**Errors:** `400` missing bounds; `500` query or unexpected failure.

### GET `/api/bookings/[id]/history`

Returns audit and email-delivery history for one booking, newest first.

**Access:** No explicit route guard; cookie-scoped Supabase and RLS. No rate
limit or fresh 2FA. Path `id` is the booking identifier.

**Input:** No query or body.

**Success:** `200 { "audit_logs": BookingAuditLog[], "email_logs":
BookingEmailLog[] }`. Audit fields are `id`, `booking_id`, `location_id`,
`action_type`, nullable `actor_identifier`, `before_data`, `after_data`, and
`metadata`, plus `created_at`. Email fields are `id`, `booking_id`, nullable
`location_id`, `customer_email`, `sender_email`, `email_kind`, `email_subject`,
`status`, nullable `failure_reason`, JSON `metadata`, and nullable `created_at`.
Schema drift instead returns `200 { "history": [], "warning": string }` (note
the compatibility response uses `history`, not the two normal arrays).

**Errors:** `500` if either history query or the handler fails.

### POST `/api/bookings/[id]/no-show`

Marks an appointment as a manual no-show, updates contact penalties, and
records an audit event.

**Access:** No explicit route guard; cookie-scoped Supabase and RLS. No rate
limit or fresh 2FA. Path `id` is required.

**Input:** Optional JSON `{ "reason": string }`. The value is trimmed; missing
or blank becomes `Marked as no-show by staff`. Malformed JSON is treated as an
empty body.

**Success:** `200 { "success": true, "booking": Booking }`. Attendance becomes
`manual_no_show`; status becomes `completed` unless already `cancelled`.
Contact missed-count/penalty state is incremented and audit metadata stores the
reason and prior attendance state. Repeating the request can increment the
penalty again; it is not idempotent.

**Errors:** `404` missing booking; `500` booking update failure. Penalty/audit
writes are awaited but their returned errors are not promoted by this route.

### POST `/api/bookings/[id]/resend`

Manually resends a booking email and records the attempt and audit event.

**Access:** No explicit route guard; cookie-scoped Supabase and RLS. No rate
limit or fresh 2FA. Path `id` is required.

**Input:** Optional JSON fields `kind: "confirmation" | "modification" |
"cancellation"`, `reason: string`, and `idempotency_key: string`; malformed JSON
becomes `{}`. The `Idempotency-Key` header overrides the body key. If `kind` is
omitted, cancelled bookings choose cancellation, confirmed bookings choose
confirmation, and all others choose modification. The enum is TypeScript-only;
the route does not runtime-validate a supplied value.

```json
{
  "kind": "confirmation",
  "reason": "Customer requested another copy",
  "idempotency_key": "resend-booking-42-confirmation-2"
}
```

**Success:** `200 { "success": true, "sent": boolean, "email_warning"?:
string }`. Email failure is a successful HTTP response with `sent: false`.
Replay returns `{ "success": true, "booking_id": string,
"idempotent_replay": true }` without sending again. Every original attempt
writes email and audit logs before its idempotency record.

**Errors:** `404` missing booking or service; `503` booking schema missing;
`500` unexpected failure.

### GET `/api/bookings/attendance/respond`

Public reminder-link endpoint that records whether a customer will attend.

**Access:** Public bearer-by-query-link. The opaque `token` is matched against
`booking_reminder_events.response_token`; no staff cookie, rate limit, or fresh
2FA. Treat the URL as a secret.

**Input:** Required query `token: string` and
`status: "present" | "missed"`.

**Success:** `200 text/html; charset=utf-8` confirmation page. The reminder
event receives `response_status`, `responded_at`, and
`confirmation_source: "customer_link"`; the booking attendance state becomes
`present` or `missed`. A missed response also increments the contact penalty.
The first valid response atomically claims an `unknown` event. Later visits
return an already-recorded page without changing attendance or incrementing a
penalty again. Concurrent requests therefore have only one side-effect winner.

**Errors:** HTML `400` invalid/incomplete input; HTML `404` unknown/expired
token; HTML `500` unexpected failure.

### GET `/api/bookings/settings/branch`

Lists weekly branch schedule rows.

**Access:** No explicit route guard; cookie-scoped Supabase and RLS. No rate
limit or fresh 2FA.

**Input:** Optional query `location_id: string`; omitting it requests all
visible branches.

**Success:** `200 { "settings": BranchSetting[] }`, ordered by day of week.
Missing schema returns `200 { "settings": [], "warning": string }`.

**Errors:** `500` query or unexpected failure.

### PATCH `/api/bookings/settings/branch`

Replaces/upserts one or more weekly schedule rows for a branch.

**Access:** Active staff session with role `Admin`, `Master Admin`, or `Super
Admin`; the write then uses the service-role client. No rate limit or fresh
2FA. These are organization-wide booking administrators, matching the settings
UI's global branch selector.

**Input:** JSON `location_id: string` and nonempty
`settings: BranchSettingInput[]` are required. The intended row shape contains
`id` and `location_id` (accepted but ignored during persistence),
`day_of_week`, `open_time`, `close_time`, nullable lunch/prayer times,
`is_closed`, `concurrent_staff`, and `slot_interval_minutes`. The route only
explicitly checks `concurrent_staff >= 1` and `slot_interval_minutes >= 5`;
missing fields and day/time formats are otherwise delegated to the database.
The outer `location_id` is written to every row.

```json
{
  "location_id": "branch-uuid",
  "settings": [
    {
      "id": "ignored",
      "location_id": "ignored",
      "day_of_week": 1,
      "open_time": "09:00:00",
      "close_time": "17:30:00",
      "lunch_start_time": "13:00:00",
      "lunch_end_time": "14:00:00",
      "prayer_start_time": null,
      "prayer_end_time": null,
      "is_closed": false,
      "concurrent_staff": 3,
      "slot_interval_minutes": 15
    }
  ]
}
```

**Success:** `200 { "success": true }`. Upsert conflict key is
`location_id,day_of_week`, so retrying replaces those days.

**Errors:** `400` missing/empty input or values below the two numeric minima;
`401` unauthenticated; `403` missing/inactive/non-admin employee; `503`
outdated schema; `500` otherwise.

### GET `/api/bookings/settings/overrides`

Lists one-off schedule overrides for a branch.

**Access:** No explicit route guard; cookie-scoped Supabase and RLS. No rate
limit or fresh 2FA.

**Input:** Required query `location_id`; optional `from` and `to` are inclusive
date bounds (`date >= from`, `date <= to`) and are passed to Supabase without
route-level format validation.

**Success:** `200 { "overrides": ScheduleOverride[] }`, ascending by date.
Missing schema returns an empty list plus `warning`.

**Errors:** `400` missing location; `500` query/unexpected failure.

### POST `/api/bookings/settings/overrides`

Creates or replaces a one-day branch override.

**Access:** Active staff session with role `Admin`, `Master Admin`, or `Super
Admin`; cookie-scoped Supabase and RLS still constrain the write. No rate limit
or fresh 2FA.

**Input:** JSON required `location_id: string` and `date: string`. Accepted
schedule fields are nullable `open_time`, `close_time`, `lunch_start_time`,
`lunch_end_time`, `prayer_start_time`, `prayer_end_time`; plus
`is_closed: boolean`, `concurrent_staff: number`,
`slot_interval_minutes: number`, and optional `notes: string | null` (default
`null`). Apart from location/date presence, runtime validation is delegated to
the database.

**Success:** `201 { "success": true, "override": ScheduleOverride }`. Upsert
conflict key `location_id,date` makes retrying replacement-idempotent.

**Errors:** `400` missing location/date; `401` unauthenticated; `403`
missing/inactive/non-admin employee; `503` outdated schema; `500` database or
unexpected failure.

### DELETE `/api/bookings/settings/overrides/[id]`

Deletes one schedule override. A nonexistent identifier is a successful no-op.

**Access:** Active staff session with role `Admin`, `Master Admin`, or `Super
Admin`; cookie-scoped Supabase and RLS still constrain the delete. No rate
limit or fresh 2FA.

**Input:** Path `id: string`; no body or query.

**Success:** `200 { "success": true }`.

**Errors:** `401` unauthenticated; `403` missing/inactive/non-admin employee;
`500` database or unexpected failure.

### GET `/api/bookings/settings/reminders`

Gets appointment-reminder and no-show penalty configuration for one branch.

**Access:** Valid Supabase session required; no role check, rate limit, or fresh
2FA.

**Input:** Required query `location_id: string`.

**Success:** `200 { "settings": ReminderSettings, "warning"?: string }`.
`ReminderSettings` has `location_id`; booleans `reminders_enabled`,
`same_day_reminder_enabled`, `attendance_confirmation_required`, and
`penalty_enabled`; integer hour fields `reminder_hours_before` and
`same_day_reminder_hours_before`; strings `reminder_subject` and
`reminder_template`; integer `penalty_threshold`;
`penalty_action: "warn_only" | "block_until_manual_review"`; and nullable
`penalty_note`. Database rows also contain `created_at` and `updated_at`.
Absent settings, or missing schema, returns branch-specific defaults; schema
drift adds `warning`.

**Errors:** `400` missing location; `401` unauthenticated; `500` database or
unexpected failure.

### PATCH `/api/bookings/settings/reminders`

Creates or replaces reminder/penalty configuration for one branch.

**Access:** Active staff session with role `Admin`, `Master Admin`, or `Super
Admin`. The route then uses the service-role client; no rate limit or fresh
2FA.

**Input:** JSON `location_id: string` is required; `settings` is an optional
partial `ReminderSettings`. Missing values start from defaults. Boolean values
default to enabled unless exactly false. `reminder_hours_before` is rounded and
clamped to `1..168` (default 24); same-day hours to `1..12` (default 2);
`penalty_threshold` to `1..20` (default 3). Only `warn_only` is preserved;
other penalty actions become `block_until_manual_review`. Blank subject and
template become defaults; blank penalty note becomes `null`. The body
`settings.location_id`, if supplied, is overridden by the outer location.

**Success:** `200 { "success": true, "settings": ReminderSettings }`. Upsert
conflict key is `location_id`.

**Errors:** `400` missing location; `401` unauthenticated; `403`
missing/inactive/non-admin employee; `503` outdated schema; `500` otherwise.

### GET `/api/bookings/settings/services`

Lists booking services for one branch.

**Access:** No explicit route guard; cookie-scoped Supabase and RLS. No rate
limit or fresh 2FA.

**Input:** Required query `location_id: string`.

**Success:** `200 { "services": BookingService[] }`, ordered by name. Missing
schema returns an empty list plus `warning`.

**Errors:** `400` missing location; `500` query or unexpected failure.

### POST `/api/bookings/settings/services`

Creates a booking service and its scheduling/email rules.

**Access:** Active staff session with role `Admin`, `Master Admin`, or `Super
Admin`. The write then uses the service-role client; no rate limit or fresh
2FA.

**Input:** JSON:

- Required `location_id: string`, `name: string`, and
  `duration_minutes: number`; duration must be at least 5. Because presence is
  tested by truthiness, zero is reported as missing.
- Optional `buffer_minutes: number` defaults to 15;
  `duration_per_additional_person_minutes: number` defaults to 0;
  `person_count_excludes_family_head: boolean` defaults to true; and
  `close_overrun_tolerance_minutes: number` defaults to 15 and is clamped to a
  minimum of zero.
- Optional `available_days: number[] | null`; every supplied value must be
  between 0 and 6. Optional `service_start_time` and `service_end_time` are
  strings or `null`.
- Optional confirmation/modification/cancellation templates are strings or
  `null`. Nonblank templates may use only `[Customer Name]`, `[date booked]`,
  `[time booked]`, `[service booked]`, `[branch name]`, `[branch address]`, and
  `[branch contact number]` tokens.

**Success:** `201 { "success": true, "service": BookingService }`. While the
latest timing-rule columns are pending in a deployment, the route retries once
without those three columns; the compatibility row then uses database defaults.

**Errors:** `400` missing fields, short duration, invalid day, or unsupported
template token (with `template_errors: [{ field, invalidTokens }]`); `401`
unauthenticated; `403` missing/inactive/non-admin employee; `503` schema
unavailable; `500` otherwise. No idempotency key is supported, so retrying may
create duplicate services.

### PATCH `/api/bookings/settings/services/[id]`

Partially updates one booking service.

**Access:** Active staff session with role `Admin`, `Master Admin`, or `Super
Admin`; service-role write after the check. No rate limit or fresh 2FA. Path
`id` is the service identifier.

**Input:** Any subset of `name: string`, `duration_minutes: number` (minimum 5),
`buffer_minutes: number`, `is_active: boolean`, `available_days: number[] |
null` (values `0..6`), `service_start_time: string | null`,
`service_end_time: string | null`, the three nullable templates described by
the create route, `duration_per_additional_person_minutes: number` (clamped to
minimum zero), `person_count_excludes_family_head: boolean`, and
`close_overrun_tolerance_minutes: number` (clamped to minimum zero). The route
accepts an empty update object and leaves database behavior to Supabase.

**Success:** `200 { "success": true, "service": BookingService }`. It has the
same pending-schema fallback as creation.

**Errors:** `400` invalid duration/day/template; `401` unauthenticated; `403`
missing/inactive/non-admin employee; `503` schema unavailable; `500`
missing/malformed row, database, or unexpected failure. A nonexistent ID is
currently surfaced as `500`, not `404`.

### DELETE `/api/bookings/settings/services/[id]`

Deletes a service only when no non-cancelled booking references it.

**Access:** Active staff session with role `Admin`, `Master Admin`, or `Super
Admin`; service-role count/delete after the check. No rate limit or fresh 2FA.

**Input:** Path `id: string`; no body or query.

**Success:** `200 { "success": true }`; deleting a nonexistent service can be a
successful no-op.

**Errors:** `401` unauthenticated; `403` missing/inactive/non-admin employee;
`409 { error }` when active bookings exist,
including the count in the message; `500` count/delete/unexpected failure.

### GET `/api/bookings/waitlist`

Lists waitlist entries for one branch.

**Access:** No explicit route guard; cookie-scoped Supabase and RLS. No rate
limit or fresh 2FA.

**Input:** Required query `location_id: string`.

**Success:** `200 { "entries": WaitlistEntry[] }`, ordered by preferred date
(nulls last) and then creation time ascending.

**Errors:** `400` missing location; `500` database error.

### POST `/api/bookings/waitlist`

Adds a waiting customer.

**Access:** No explicit route guard; cookie-scoped Supabase and RLS. No rate
limit or fresh 2FA.

**Input:** Required JSON strings `location_id`, `customer_name`, and
`customer_phone`; names/phones are trimmed. Optional `service_id` becomes
`null` when absent/empty; `customer_email` and `notes` are trimmed with blank
to `null`; `person_count` is number-coerced with minimum/default 1;
`preferred_date`, `preferred_time_start`, and `preferred_time_end` are strings
or `null`. `source` preserves only `whatsapp` or `website`; every other value
defaults to `portal`. New status is always `waiting`.

**Success:** `200 { "success": true, "entry": WaitlistEntry }` with joined
service name. The route has no idempotency key; retries can add duplicates.

**Errors:** `400` missing required fields; `500` database error.

### PATCH `/api/bookings/waitlist`

Updates the mutable workflow fields of a waitlist entry.

**Access:** No explicit route guard; cookie-scoped Supabase and RLS. No rate
limit or fresh 2FA.

**Input:** JSON `id: string` required. Optional `status: string` is accepted
without enum validation; `notes` and `linked_booking_id` accept string or
`null`. Other fields are ignored. An ID-only body performs an empty update and
delegates behavior to Supabase.

**Success:** `200 { "success": true, "entry": WaitlistEntry }` with joined
service name.

**Errors:** `400` missing ID; `500` missing row/database error.

### POST `/api/bookings/telemetry`

Writes bounded, structured booking-UX telemetry to container standard output.

**Access:** Public at the HTTP layer; no session or fresh 2FA. Limit 120 events
per IP per minute. Because this is noncritical telemetry, limiter outages fail
open and are logged rather than interrupting the booking UI.

**Input:** JSON up to 8 KiB. Required `event` is one of
`booking_status_conflict`, `booking_status_error`, `booking_status_updated`,
`booking_reschedule_conflict`, `booking_reschedule_error`,
`booking_rescheduled`, `booking_amend_conflict`, `booking_amend_error`,
`booking_amended`, `booking_create_error`, or `booking_created`. Optional
`metadata` is stripped to allowlisted fields: `bookingId: string` (1..200),
`nextStatus: "pending" | "confirmed" | "cancelled" | "completed"`,
`statusCode: integer` (100..599), and `manual_override: boolean`. Unknown
metadata and top-level fields are discarded so arbitrary personal data is not
logged.

**Success:** `200 { "success": true }` after one redacted structured log line.
The event is non-durable and not idempotent.

**Errors:** `400` malformed/invalid JSON; `413` body over 8 KiB; `429` rate
limit. Limiter unavailability does not return `503` for this telemetry route.

## Application accounting

### GET `/api/accounting/applications`

Builds a calendar-year application-count report across NADRA, Pakistani
passport, GB passport, and visa records.

**Access:** Valid Supabase session required; no employee role/department check,
route-level rate limit, or fresh 2FA. Queries use the authenticated client and
remain subject to RLS.

**Input:** Optional query `year: integer` defaults to the current UTC year and
must be between 2000 and current UTC year + 1. Optional
`service: "all" | "nadra" | "pak_passport" | "gb_passport" | "visa"`
defaults to `all`.

**Success:** `200 AccountingApplicationsReport`:

- `year` and selected `service`.
- `totals`: `applications` and `recordedApplications` (all source rows),
  `netApplications` (excluding cancelled/refunded), `cancelledOrRefunded`,
  `combinations` (unique source/application/category groups),
  `averagePerMonth`, and nullable `busiestMonth`.
- `months`: 12 objects with 1-based `month`, `key: YYYY-MM`, long/short labels,
  `total` net count, `recorded` count, and `cancelledOrRefunded`.
- `sections`: one per selected source, each with `source`, display `label`,
  totals, and grouped `rows`. Each row contains `application`, `category`, net,
  recorded, and deduction totals; 12-element `monthlyCounts` and
  `monthlyCancelledOrRefunded`; and `applications` newest first. Detail objects
  contain `id`, `applicantName`, `trackingNumber`, `status`, `appliedAt`, and
  `deductionReason: "Cancelled" | "Refunded" | null`.
- `warnings: Array<{ label: string, message: string }>`.

Source-specific labels are derived from the underlying service/category data.
GB tracking prefers uppercase `pex_number`; visa uses internal tracking.
Each source is independently paged in batches of 1,000 up to 100 pages. A
source failure does not fail the whole report: successful sources remain in
the response and the failed source is described in `warnings`.

**Errors:** `400` invalid year/service; `401` unauthenticated; `500` missing
Supabase configuration or an unexpected top-level failure. A single source
query failure is a `200` partial report, not an HTTP error.

## Loan management system

### GET `/api/lms`

Returns globally calculated LMS account statistics plus a filtered page of
customer accounts.

**Access:** Active LMS staff session required. No route-level rate limit or
fresh 2FA.

**Input:** Optional query `filter` defaults to `active`; recognized behavior is
`active` (positive balance), `overdue`, `settled` (balance <= 0 with a loan), or
`all`. Unrecognized strings behave like `all` in the database function.
Optional `accountId: string` returns only that customer regardless of filter.
`page` defaults/minimums to 1. `limit` defaults to 50 and is clamped to 1..100.

**Success:** `200`:

```json
{
  "accounts": [],
  "stats": {
    "totalOutstanding": 0,
    "activeAccounts": 0,
    "overdueAccounts": 0,
    "dueSoonAccounts": 0,
    "totalAccounts": 0
  },
  "pagination": { "page": 1, "limit": 50, "total": 0, "pages": 0 }
}
```

Account items use the shared LMS shape above. Stats always describe the full
account population, not the selected page/filter. `dueSoon` means due within
seven days with positive balance. Transactions are newest first. The route
normally uses atomic `lms_list_accounts`; it retains a null-result fallback
that computes the equivalent model in application code.

**Errors:** `401`/`403` session or employee failure; `500` missing Supabase
configuration or RPC/query failure. Operational failures include an
`x-request-id` response header for correlation.

### POST `/api/lms`

Dispatches one of six LMS account actions. All mutations use the authenticated
employee ID resolved server-side; caller-supplied employee identity is ignored.

**Access:** Active LMS staff session required. Shared limit: 120 requests per
15 minutes for both user and IP. `delete_customer` additionally requires fresh
TOTP or one-time backup-code verification; other actions do not.

**Input:** JSON up to 256 KiB with required discriminator `action`. Unknown
extra fields are accepted. For idempotent actions, `Idempotency-Key` header
wins over body `idempotencyKey`; keys are truncated to 200 characters by the
route. Supported action payloads are:

#### `record_payment`

- `loanId: string` and `amount: number | nonblank numeric string` are required
  in practice; amount must be finite and greater than zero.
- Optional `paymentMethodId: string | null`, `notes: string`, and
  `transactionDate: string` parseable by `Date`; missing date means now.
- Optional `idempotencyKey`. The atomic RPC scopes it by employee and action;
  replaying the same payload returns the original ledger result, while reuse
  for a different payload is `400`.
- Success: `200 { "recordedPaymentLoanId": string }`. The RPC atomically adds
  a payment transaction and recalculates the loan; its richer transaction and
  balance result is intentionally reduced by the route.

#### `add_service`

- `customerId: string` and `serviceAmount: number | numeric string` are
  required in practice; service amount must be positive.
- `initialDeposit` accepts a number/string, defaults to zero, and must be
  between zero and the service amount.
- `installmentTerms` accepts number/string and defaults effectively to 3; the
  database clamps it to 1..120. Optional `installmentPlan` is an array of
  `{ dueDate: nonblank string, amount: number | nonblank string, ...extra }`.
  Every amount must be positive; the database validates dates and requires the
  plan total to equal remaining balance within 0.01. With no explicit plan,
  equal monthly installments start at the first due date (today in this route).
- Optional `paymentFrequency: string` affects only generated remarks;
  `notes: string` overrides that summary. Optional parseable
  `transactionDate` defaults to now. Optional `idempotencyKey` has atomic
  same-payload replay semantics.
- Success: `200 { "createdLoanId": string | undefined }`. The RPC atomically
  creates the loan, service transaction, installment plan, and optional initial
  payment.

#### `add_fee`

- Positive `amount: number | numeric string` is required. At least one of
  `loanId: string` or `customerId: string` is required; when only customer is
  supplied, the database finds or creates the applicable loan according to the
  RPC contract.
- Optional `notes` defaults to `Additional fee`; optional parseable
  `transactionDate` defaults now; optional `idempotencyKey` has atomic
  same-payload replay semantics.
- Success: `200 { "loanId": string | undefined, "feeAdded": number }`.

#### `create_customer`

- Required nonblank `firstName: string` and `lastName: string`; optional
  `phone`, `email`, and `address` strings. This route does not independently
  validate contact formats.
- Optional `initialTransaction: null | { type: "service" | "fee" |
"payment", amount: number | numeric string, paymentMethodId?: string,
notes?: string, ...extra }`. `payment` is schema-accepted but explicitly
  rejected; service/fee amount must be finite and positive. `paymentMethodId`
  is accepted by the parser but the customer-creation RPC does not use it.
- Optional `idempotencyKey` has atomic same-payload replay semantics.
- Success: `200 { "customerId": string | undefined }`; customer and initial
  service/fee are created atomically.

#### `update_customer`

- Required-in-practice `customerId: string`.
- Optional `phone`, `email`, `address`, and `dateOfBirth` strings. Date of birth
  must be absent/empty or a real `YYYY-MM-DD`; supplied contact values have no
  additional route validation. Optional `notes: string` adds the RPC note.
- No idempotency key is used for this action.
- Success: `200 { "updatedCustomerId": string }`.

#### `delete_customer`

- Required-in-practice `customerId: string`.
- Fresh verification code may be supplied as `verificationCode: string` or
  legacy `authCode: string`; `verificationCode` wins. Optional
  `verificationMethod: "totp" | "backup" | "auto"`; omitted behaves as auto.
- No idempotency key is used. Success: `200 { "deletedCustomerId": string }`;
  the atomic database function removes the customer's LMS graph according to
  its foreign-key rules.

Nontrivial example:

```http
POST /api/lms
Content-Type: application/json
Idempotency-Key: service-customer-123-20260812

{
  "action": "add_service",
  "customerId": "customer-uuid",
  "serviceAmount": 900,
  "initialDeposit": 300,
  "installmentPlan": [
    { "dueDate": "2026-09-01", "amount": 300 },
    { "dueDate": "2026-10-01", "amount": 300 }
  ],
  "paymentFrequency": "monthly",
  "notes": "Two-month balance plan"
}
```

**Success:** Each action returns the direct `200` object described above.
Idempotent database actions prevent duplicate ledger/customer creation under
concurrent retries, even though the route can omit the RPC's
`idempotentReplay` flag from its reduced response.

**Errors:** `400` invalid/missing action data, dates, amounts, installment
totals, or conflicting idempotency-key reuse; `401`/`403` access failure;
`403` failed fresh 2FA; `404` database code `P0002` for missing resources in
the add/create/update/delete actions; `429` rate limit; `503` limiter
unavailable; `500` configuration or other database/runtime failure. The
`record_payment` now uses the same database-code mapping as the other atomic
actions. Atomic RPC failures do not leave partial ledger writes. Operational
failures can include `x-request-id`.

### GET `/api/lms/audit-logs`

Lists audit entries for one LMS entity/account.

**Access:** Active LMS staff session required; no route-level rate limit or
fresh 2FA.

**Input:** Required query `accountId: string`, matched to `entity_id`. Optional
`limit` defaults to 50 and `offset` to 0 using `parseInt`; unlike the main LMS
list, this route does not clamp or validate negative/NaN values before passing
the range to Supabase.

**Success:** `200 { "logs": AuditLog[], "total": number }`, newest first.
Each log contains `id`, `user_id`, `action`, `entity_type`, `entity_id`,
`changes: object | null`, `created_at`, and
`employee: { name: string | undefined, email: string | undefined }`.

**Errors:** `400` missing account ID; `401`/`403` access failure; `500` database
or unexpected failure.

### POST `/api/lms/audit-logs`

Appends an audit entry attributed to the authenticated employee.

**Access:** Active LMS staff session required. Limit 120 per hour for both user
and IP. No fresh 2FA.

**Input:** JSON up to 128 KiB: required trimmed `action: string` (1..100),
`entityType: string` (1..100), and `entityId: string` (1..200); optional
`changes: Record<string, unknown>`. The schema object is not strict, so extra
top-level fields are stripped/ignored. Caller `user_id` is not accepted;
identity comes from the session.

**Success:** `200 { "log": AuditLogRow }`. The stored action is uppercased and
`created_at` is server time. Repeats are not deduplicated.

**Errors:** `400` schema/body failure; `401`/`403` access failure; `429` rate
limit; `503` limiter unavailable; `500` database/unexpected failure.

### POST `/api/lms/delete-installment-plan`

Atomically deletes a service transaction and its installment plan when no
payments prevent deletion.

**Access:** Active LMS staff session plus fresh TOTP/backup verification.
Limit 10 per hour for both user and IP.

**Input:** Strict JSON up to 4 KiB: required trimmed
`transactionId: string` (1..200) and `verificationCode: string` (1..100);
optional `verificationMethod: "totp" | "backup" | "auto"`.

```json
{
  "transactionId": "service-transaction-uuid",
  "verificationCode": "123456",
  "verificationMethod": "totp"
}
```

**Success:** `200 { "deletedTransactionId": string }`. The RPC performs the
transaction/installment deletion atomically.

**Errors:** `400` body validation; `401`/`403` access or verification failure;
`404` missing service transaction; `429` rate limit; `503` limiter unavailable;
`500` database/runtime failure. A plan with recorded payments is rejected by
the database and currently surfaces as `500`.

### POST `/api/lms/installment-payment`

Atomically records a payment against a persisted or not-yet-persisted
installment.

**Access:** Active LMS staff session required. Shared installment-mutation
limit 120 per 15 minutes for both user and IP. No fresh 2FA.

**Input:** Strict JSON up to 16 KiB:

- Required-in-practice `installmentId: string` (1..200). A persisted ID is
  looked up server-side to derive its loan and service transaction. A temporary
  ID must use the UI form `temp__...__{positiveInteger}` and additionally
  requires `loanId: string` and `serviceTransactionId: string` (each max 200).
- Required-in-practice `paymentAmount: number | nonblank string` (string max
  100), finite and > 0.
- Optional `paymentMethod: string | null` (max 200), `paymentDate: string | null`
  (max 50). A supplied date is interpreted as UTC midnight by appending
  `T00:00:00Z`; omitted/null means now.
- Optional `employeeId` is accepted but ignored; employee identity is resolved
  from the session. Optional `idempotencyKey` or `idempotency_key` (max 200), or
  `Idempotency-Key` header; header wins, then camelCase, then snake_case.

```json
{
  "installmentId": "installment-uuid",
  "paymentAmount": 125.5,
  "paymentMethod": "payment-method-uuid",
  "paymentDate": "2026-08-12",
  "idempotencyKey": "installment-uuid-payment-1"
}
```

**Success:** `200 { "recordedPaymentAmount": number | string, "loanId":
string, "newBalance": number }`. The atomic RPC inserts a payment, synchronizes
the plan, recalculates the loan, and safely replays the same idempotency key and
payload. For a later installment, earlier pending installments are marked
skipped according to the RPC rule.

**Errors:** `400` invalid body/amount/date/temp ID or missing derived IDs; `401`
or `403` access failure; `404` persisted installment/loan/service transaction
not found; `429` rate limit; `503` limiter unavailable; `500` other failure.
Reusing an idempotency key for a different payment is `400`.

### PATCH `/api/lms/installment-payment`

Atomically edits a payment transaction and recalculates affected loan/plan
state.

**Access:** Active LMS staff session required. Shared installment-mutation
limit 120 per 15 minutes for user and IP. No fresh 2FA.

**Input:** Strict JSON up to 16 KiB. Required-in-practice
`transactionId: string` (1..200). At least one of
`paymentAmount: number | nonblank string` (> 0), `paymentDate: string` (max 50,
valid UTC date using the same conversion above), or
`paymentMethod: string | null` (max 200) must be supplied. Explicit
`paymentMethod: null` clears the method.

**Success:** `200 { "updatedTransactionId": string }`. Updating the same values
is effectively idempotent; no idempotency key is accepted.

**Errors:** `400` invalid/missing fields; `401`/`403` access failure; `404`
payment transaction missing; `429`/`503` request protection; `500` otherwise.

### DELETE `/api/lms/installment-payment`

Deletes one payment transaction and atomically recalculates ledger/installment
state.

**Access:** Active LMS staff session plus fresh TOTP/backup verification.
Limit 20 per hour for both user and IP.

**Input:** Required query `transactionId: string` and `accountId: string`.
`accountId` is required for caller compatibility but is not passed to the
delete RPC. Verification code comes from `X-Verification-Code` header or query
`verificationCode`; method comes from `X-Verification-Method` or query
`verificationMethod` (`totp`, `backup`, or `auto`). Headers win.

**Success:** `200 { "deletedTransactionId": string }`. A second deletion returns
`404`, so the operation is not response-idempotent.

**Errors:** `400` missing IDs; `401`/`403` access or verification failure; `404`
missing payment; `429` rate limit; `503` limiter unavailable; `500` otherwise.

### GET `/api/lms/installments`

Lists all installments for a service transaction.

**Access:** Active LMS staff session required; no route-level rate limit or
fresh 2FA.

**Input:** Required query `transactionId: string`.

**Success:** `200 { "installments": InstallmentRow[] }`, ordered by
`installment_number` ascending. Rows are returned with all database columns,
including ID, loan transaction ID, installment number, due date, amount,
amount paid, status, and timestamps where present. The route first calls its
legacy table-availability helper, which currently probes availability but does
not create schema. Query/table/runtime failures are intentionally degraded to
`200 { "installments": [] }`.

**Errors:** `400` missing transaction ID; `401`/`403` access failure; `500` only
when Supabase configuration is missing. Most operational errors deliberately
return an empty `200` response.

### GET `/api/lms/notes`

Lists notes for one LMS customer account.

**Access:** Active LMS staff session required; no route-level rate limit or
fresh 2FA.

**Input:** Required query `accountId: string`.

**Success:** `200 { "notes": Note[] }`, newest first. Each note has `id`,
`note`, `created_by`, `created_at`, and optional `employee_name` resolved from
the joined employee.

**Errors:** `400` missing account ID; `401`/`403` access failure; `500`
database/unexpected failure.

## Receipts

### POST `/api/receipts/generate`

Builds a customer receipt from a NADRA, Pakistani-passport, or GB-passport
service record, creates QR/plain-text representations, and best-effort persists
it for later listing/verification.

**Access:** Active staff session required. The generator uses the Supabase
service role only after that canonical check; no route-level rate limit or
fresh 2FA. `generatedBy` is always the server-resolved employee ID.

**Input:** JSON up to 8 KiB with required
`serviceType: "nadra" | "pk_passport" | "gb_passport"`, trimmed nonblank
`serviceRecordId: string` (max 200), and
`receiptType: "submission" | "biometrics" | "refund" | "collection"`.
Unknown fields, including a caller-supplied `generatedBy`, are discarded.

```json
{
  "serviceType": "nadra",
  "serviceRecordId": "nadra-service-row-uuid",
  "receiptType": "submission"
}
```

**Success:** `200 { "receipt": GeneratedReceipt }`, where the receipt contains:

- `id`, `receiptNumber`, `applicationId`, `applicantId`, `applicantName`;
  nullable `familyHeadName`, `contactNumber`, `serviceName`, `processingSpeed`,
  `phone`, and `email`.
- The supplied `serviceType`, `receiptType`, nullable `trackingNumber`, nullable
  `applicationPin`, `receiptPin`, ISO `generatedAt`, nullable `generatedBy`, and
  configured `companyName`.
- `pricing: { serviceDescription: string | null, costPrice: number | null,
salePrice: number | null, currency: string }`.
- Nullable `verificationUrl`, nullable QR `qrCodeDataUrl`, and rendered
  `plainText`.

NADRA receipts generate a six-digit numeric receipt PIN and verification URL when a
tracking number/base URL exist. PK/GB receipt PIN is an empty string and the QR
contains fallback receipt information. QR failure does not fail receipt
generation. Persistence is also best-effort: the route still returns the
receipt if `generated_receipts` is missing or incompatible. Every call creates
a new receipt/number; there is no idempotency key.

**Errors:** `400` malformed/invalid JSON or fields; `401` unauthenticated;
`403` missing/inactive employee; `413` body over 8 KiB; `500` missing
service-role configuration, missing source record/pricing-query failure, or
unexpected generation failure.

### GET `/api/receipts/list`

Lists up to 100 persisted receipt summaries, newest first.

**Access:** Active staff session required before service-role storage access.
No route-level rate limit or fresh 2FA.

**Input:** At least one of query `applicantId: string` or
`serviceType: "nadra" | "pk_passport" | "gb_passport"` is required. Both may
be supplied and are combined. Optional `includePayload` is true only when its
trimmed, case-folded value equals `true`; default false.

**Success:** `200 { "supported": boolean, "message"?: string, "receipts":
StoredReceiptSummary[] }`. Each summary contains `id`, `serviceType`,
`receiptType`, nullable `trackingNumber`, `applicantId`, `applicantName`,
`generatedAt`, `isShared`, nullable `sharedAt`/`sharedVia`, and `shareCount`.
When requested, `plainText: string | null` is added. If persistence is not
deployed/configured, success is `supported: false` with an empty array and
reason rather than an HTTP error.

**Errors:** `400` when both filters are absent, applicant ID exceeds 200
characters, or service type is invalid; `401` unauthenticated; `403`
missing/inactive employee. Store failures are converted to the supported-false
`200` contract.

### POST `/api/receipts/share`

Marks a persisted receipt shared and increments its share counter.

**Access:** Active staff session required before service-role storage access.
No route-level rate limit or fresh 2FA.

**Input:** JSON up to 4 KiB with required trimmed nonblank
`receiptId: string` (max 200). Optional `channel: string | null` is trimmed,
limited to 100 characters, and lowercased; missing/blank becomes `null`.
Unknown fields are discarded; there is no channel enum.

**Success:** When supported and found: `200 { "supported": true, "updated":
true, "receiptId": string, "shareCount": number, "channel": string | null,
"sharedAt": string }`. It sets `is_shared`, replaces the latest share
timestamp/channel, and increments count, so retries increment again and are not
idempotent. When persistence is unavailable: `200 { "supported": false,
"updated": false, "message": string }`.

**Errors:** `400` malformed/invalid JSON or fields; `401` unauthenticated;
`403` missing/inactive employee; `404` supported store but receipt not found;
`413` body over 4 KiB. An uncaught handler failure becomes the framework's
`500` response.

### POST `/api/receipts/verify`

Publicly verifies a persisted receipt by tracking number and receipt PIN.

**Access:** Public. Limit 10 attempts per 15 minutes for both IP and the
uppercased tracking-number identity; no session or fresh 2FA.

**Input:** JSON required `trackingNumber: string` and `receiptPin: string`, both
stringified and trimmed. Malformed JSON becomes an empty object. There is no
explicit body-size limit.

```json
{
  "trackingNumber": "ABC123456",
  "receiptPin": "482913"
}
```

**Success:** Verification outcomes deliberately use HTTP 200:

- Valid: `{ "valid": true, "supported": true, "message": "Receipt verified",
"receipt": StoredReceiptSummary }`.
- Wrong credentials: `{ "valid": false, "supported": true, "message":
"Invalid receipt credentials" }`.
- Store unavailable: `{ "valid": false, "supported": false, "message": string
}`.

The summary fields match the list contract, without `plainText`.

**Errors:** `400` missing credential; `429` attempt limit; `503` limiter
unavailable. Receipt lookup/store failures are represented by the
supported-false `200` response.

## Loan management system supporting routes

### POST `/api/lms/notes`

Adds a note attributed to the authenticated employee.

**Access:** Active LMS staff session required. Shared notes-mutation limit 120
per hour for both user and IP. No fresh 2FA.

**Input:** JSON up to 16 KiB: trimmed `accountId: string` (1..200) and trimmed
`note: string` (1..5,000), both required. Extra top-level fields are stripped.
Caller `createdBy` is not accepted.

**Success:** `200 { "note": Note }` in the same formatted shape as the list.
Retries create additional notes; no idempotency key exists.

**Errors:** `400` body validation; `401`/`403` access failure; `429`/`503`
request protection; `500` database/unexpected failure.

### DELETE `/api/lms/notes`

Deletes one LMS note.

**Access:** Active LMS staff session required. Shared notes-mutation limit 120
per hour for both user and IP. No fresh 2FA.

**Input:** Required query `noteId: string`, maximum 200 characters.

**Success:** `200 { "deletedNoteId": string }`. Supabase deletion without a
returned-row check means a nonexistent ID is also successful.

**Errors:** `400` missing/oversized ID; `401`/`403` access failure; `429`/`503`
request protection; `500` database/unexpected failure.

### GET `/api/lms/payment-methods`

Lists configured LMS payment methods.

**Access:** Active LMS staff session required; no route-level rate limit or
fresh 2FA.

**Input:** No query or body fields.

**Success:** Always `200 { "methods": PaymentMethodRow[] }` after access is
granted. Rows contain all `loan_payment_methods` columns. Missing server
configuration, query failure, or runtime failure degrades to an empty array so
the UI can use its fallback choices.

**Errors:** `401`/`403` access failure. Operational errors are swallowed into
the empty success response.

### POST `/api/lms/seed-service-categories`

Normalizes existing LMS service-category names to lowercase and upserts the
canonical set: `nadra`, `passport`, `ticket`, `umrah`, `hotels`, and `visa`.

**Access:** Authenticated active employee with role `Maintenance Admin`,
`Admin`, `Master Admin`, or `Super Admin`. Limit 3 per hour for user and IP. No
fresh 2FA.

**Input:** No body fields are read.

**Success:** `200 { "categories": Array<{ id: string, name: string }> }`,
ordered by name. Upsert conflict key is `name`; after normalization this is
safe to rerun, although a failure part-way through existing-row normalization
is not wrapped in one database transaction.

**Errors:** `401` unauthenticated; `403` missing/inactive employee or wrong
role; `429` rate limit; `503` limiter unavailable; `500` missing configuration,
fetch/update/upsert, or unexpected failure.

### POST `/api/lms/skip-installment`

Atomically skips one installment, synchronizes the remaining plan, and
recalculates the loan.

**Access:** Active LMS staff session plus fresh TOTP/backup verification.
Limit 20 per hour for user and IP.

**Input:** Strict JSON up to 4 KiB: required trimmed
`installmentId: string` (1..200), `verificationCode: string` (1..100), and
optional `verificationMethod: "totp" | "backup" | "auto"`.

**Success:** `200` direct RPC JSON with `loanId`, `newBalance`,
`totalDebtAmount`, `status`, `skippedInstallmentId`, `remainingBalance`,
`remainingInstallments`, and `newAmountPerInstallment`. The operation is
atomic. Repeating after success can re-run redistribution; no idempotency key
is supported.

**Errors:** `400` body validation; `401`/`403` access or verification failure;
`404` installment missing; `429`/`503` request protection; `500` otherwise.

### POST `/api/lms/update-installments`

Atomically updates due date and amount for up to 240 installments.

**Access:** Active LMS staff session required. Limit 30 per hour for user and
IP. No fresh 2FA.

**Input:** JSON up to 256 KiB with required `installments` array length 1..240.
Every item requires trimmed `id: string` (1..200; it must parse as an existing
installment UUID at the database boundary), `due_date: YYYY-MM-DD`, and
`amount: number | numeric string`, coerced to a positive number no greater than
10,000,000. Unknown item/top-level keys are stripped.

```json
{
  "installments": [
    {
      "id": "d7e5aa5a-e0a2-4f65-9af2-aeb75cd2c136",
      "due_date": "2026-09-01",
      "amount": 250
    },
    {
      "id": "028c5792-f897-44ae-9a9a-d79b5bf84acf",
      "due_date": "2026-10-01",
      "amount": 250
    }
  ]
}
```

**Success:** `200 { "updatedInstallmentIds": string[], "updatedCount": number
}`. The service-role-only `lms_update_installments` RPC validates that every ID
exists and commits the complete batch in one database transaction. Any row
failure rolls back all preceding updates.

**Errors:** `400` schema/body or database value validation; `401`/`403` access
failure; `404` any installment missing; `429`/`503` request protection; `500`
other database/unexpected failure.
