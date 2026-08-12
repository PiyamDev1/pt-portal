# Timeclock, Integrations, HR, Training, and Dashboard API

## Scope

This reference covers every HTTP method exported below `app/api/timeclock`,
`app/api/integrations`, `app/api/hr`, `app/api/training`, and `app/api/dashboard`. It is derived from
the current handlers and shared helpers. Values described as database rows include the columns
selected by the route; consumers should tolerate additive schema fields in `*` selections.

## Shared conventions

- Unless stated otherwise, request and response bodies are JSON. Success payloads are direct, not
  wrapped in `{ data: ... }`; normalized failures are `{ "error": string }` with occasional
  documented details.
- Portal session authentication uses Supabase cookies. Staff-role guards additionally require an
  active employee. `401` is unauthenticated, and `403` is authenticated but out of scope.
- Admin roles are `Admin`, `Master Admin`, and `Super Admin`; maintenance roles add
  `Maintenance Admin`. Some older handlers inspect their own role sets, documented per route.
- Several older endpoints call `request.json()` directly and do not impose a byte limit or strict
  schema. The fields below are the supported contract; do not rely on ignored fields or permissive
  runtime coercions.
- Device-authenticated requests use four headers: `X-PTC-Device-Id`, `X-PTC-Timestamp` (integer Unix
  seconds within 120 seconds), `X-PTC-Nonce` (non-empty, maximum 128 characters, one use within five
  minutes), and `X-PTC-Signature` (base64url HMAC-SHA256). Signature material is the uppercase
  method, exact path plus query, timestamp, nonce, and lowercase hex SHA-256 of the exact raw body,
  joined with newlines. The device must be an active `physical` device. Replay, mismatch, missing
  fields, stale timestamps, and bad signatures return `401`; inactive devices return `403`.
- No route in this scope exports `OPTIONS`, and none is retired with `410`. Unsupported methods use
  framework method-not-allowed behavior. The stale comment mentioning `PATCH /api/timeclock/events`
  is not an API: use `PATCH /api/timeclock/events/[eventId]/adjust`.
- Secrets, device signatures/nonces, signed handoff URLs, QR payloads, manual codes, and employee
  session cookies must not be logged or stored in documentation/examples.

## Dashboard

### GET `/api/dashboard/modules`

Returns the current user's dashboard module preferences.

**Access:** Supabase session; any authenticated user. No route-level rate limit or role check.

**Input:** No path, query, header, or body fields beyond session cookies.

**Success:** `200` `{ "preferences": [{ "module_id": string, "is_favorite": boolean,
"usage_count": number, "last_opened_at": string|null }] }`. Read-only and safe to repeat.

**Errors:** `401` unauthenticated; `500` preference query failure.

### POST `/api/dashboard/modules`

Upserts a favorite flag or records that a dashboard module was opened.

**Access:** Supabase session; any authenticated user. No route-level rate limit or role check.

**Input:** JSON parsed directly: `moduleId` (required non-empty string), `action` (required; supported
values `toggle-favorite | record-open`), and `favorite` (optional boolean used by
`toggle-favorite`; omitted means invert the current value). No explicit size/length/strictness
validation is applied. Clients must use a supported action even though runtime only checks that the
value is truthy.

**Success:** `200` `{ "preference": { "module_id": string, "is_favorite": boolean,
"usage_count": number, "last_opened_at": string|null } }`. `record-open` increments usage and sets
the current timestamp; favorite changes preserve usage. Upsert is keyed by user/module. Explicit
favorite assignment is convergent; toggle and record-open are not idempotent.

**Errors:** `400` missing `moduleId`/`action`; `401` unauthenticated; `500` read/upsert failure.

```json
{ "moduleId": "bookings", "action": "toggle-favorite", "favorite": true }
```

### GET `/api/dashboard/notice-board`

Lists today's undismissed active slides targeted to the current employee's role, department, and
location.

**Access:** Supabase session; any authenticated user with a readable employee profile. No
route-level rate limit.

**Input:** No path/query/body fields.

**Success:** `200` `{ "slides": [{ "id": string, "title": string|null, "body": string|null,
"image_url": string|null, "hyperlink_url": string|null, "display_seconds": number,
"sort_order": number, "target_role": string|null, "target_department_id": string|null,
"target_location_id": string|null }] }`, ordered by sort order then newest. Slides dismissed since
the server's local start of day are excluded. Read-only.

**Errors:** `401` unauthenticated; `500` employee, read-state, or slide query failure.

### POST `/api/dashboard/notice-board/read`

Marks a slide seen or dismissed for the current user.

**Access:** Supabase session; any authenticated user. No route-level rate limit.

**Input:** JSON parsed directly: `slideId` (required non-empty string) and `action` (optional;
supported `seen | dismissed`). Only exact `dismissed` sets `dismissed_at`; missing or any other
runtime value records a seen event. No size/length/strict schema.

**Success:** `200` `{ "ok": true }`. Upserts by slide/user and always refreshes `last_seen_at`;
dismissal also sets `dismissed_at`. Repeats update timestamps and are not strictly idempotent.

**Errors:** `400` missing `slideId`; `401` unauthenticated; `500` upsert failure.

### GET `/api/dashboard/notice-board/image`

Redirects an authenticated browser to a five-minute signed object URL for a notice image.

**Access:** Supabase session; any authenticated user. No route-level rate limit. The route does not
re-check that the object belongs to a currently visible slide.

**Input:** Query `provider` (optional string; exact `r2` selects R2, every other/missing value selects
MinIO), `bucket` (required non-empty string), and `key` (required string beginning
`notice-board/`). No explicit length bounds.

**Success:** `307` redirect to a signed storage `GET` URL expiring in 300 seconds. It does not read
or mutate the object.

**Errors:** `400` missing bucket/key or invalid prefix; `401` unauthenticated. Signing/configuration
failures can surface as `500`.

## Human resources leave

### GET `/api/hr/leave/requests`

Lists up to 200 leave requests owned by the current user, newest first.

**Access:** Supabase session; any authenticated user. No employee-role or rate-limit check.

**Input:** No path/query/body fields.

**Success:** `200` `{ "requests": [{ "id": string, "leave_type_id": string, "from_date": string,
"to_date": string, "half_day": boolean, "half_day_date": string|null, "requested_days": number,
"status": string, "created_at": string, "updated_at": string }] }`. Read-only.

**Errors:** `401` unauthenticated; `500` database/internal failure.

### POST `/api/hr/leave/requests`

Creates a pending leave request and queues an outbound Frappe leave event.

**Access:** Supabase session; any authenticated user. No route-level rate limit or role check.

**Input:** JSON parsed directly: `leaveTypeId`, `fromDate`, `toDate` (all required truthy values),
`requestedDays` (required truthy number by contract), `halfDay` (optional boolean), and
`halfDayDate` (optional string/null; defaults to `fromDate` when half-day). The handler does not
validate ID/date format, date order, positive/finite days, body size, or extra fields.

**Success:** `200` `{ "ok": true, "request": { "id": string, "employee_id": string,
"leave_type_id": string, "from_date": string, "to_date": string, "half_day": boolean,
"half_day_date": string|null, "requested_days": number, "status": "pending", "approver_id":
string|null, "rejection_reason": string|null, "frappe_docname": string|null, "sync_version":
number } }`. Inserts the request, then inserts an outbox event with a versioned dedupe key. Retrying
creates another request and is not idempotent.

**Errors:** `400` required value absent; `401` unauthenticated; `500` JSON, insert, or outbox failure.
An outbox failure occurs after the leave row has been inserted.

```json
{
  "leaveTypeId": "00000000-0000-4000-8000-000000000021",
  "fromDate": "2026-09-01",
  "toDate": "2026-09-02",
  "requestedDays": 2,
  "halfDay": false
}
```

### PATCH `/api/hr/leave/requests/[id]`

Approves, rejects, or cancels one leave request and queues the corresponding Frappe event.

**Access:** Supabase session. An employee may cancel only their own request. Roles `Admin`,
`Master Admin`, `Maintenance Admin`, and `Super Admin` may approve/reject/cancel any request. No
fresh-factor or route-level rate limit.

**Input:** Path `id` (required non-empty route string; no format/length validation). JSON parsed
directly: `action` (required; supported `approve | reject | cancel`) and `rejectionReason` (optional
string; rejection defaults to `Rejected`). Clients must use a supported action: the current runtime
maps any non-approve/non-reject value to cancellation after the truthy check. No body bounds or
strict schema.

**Success:** `200` `{ "ok": true, "request": LeaveRequestRow }`. Increments `sync_version`, updates
status/approval fields, and inserts a versioned outbox event. Repeating updates the version and
queues another state event, so it is not idempotent.

**Errors:** `400` missing ID/action; `401` unauthenticated; `403` non-admin acting outside own
cancellation; `404` request missing; `500` JSON/update/outbox/internal failure.

## Frappe integration

### GET `/api/integrations/frappe/handoff`

Issues a short-lived signed browser handoff into the linked employee's Frappe HRMS account.

**Access:** Supabase session; any authenticated employee with a valid Frappe Employee link. If the
employee link exists but its login user is missing, the route may create/link the Frappe user. No
route-level rate limit or role/factor check.

**Input:** Optional query `format=json` selects JSON instead of redirect mode; every other value uses
redirect mode. Optional `target`: missing/`auto` resolves to `/hrms` for mobile/standalone clients
and `/app` otherwise; an absolute-path value is accepted except protocol-relative paths and paths
under `/api/`, `/assets/`, or `/files/`, which normalize to `/hrms`. `User-Agent` influences client
classification and is recorded in the audit event.

**Success:** Redirect mode returns `307` to a Frappe bridge URL containing a signed, unique,
approximately 90-second handoff token. JSON mode returns `200` `{ "url": string }`. Every attempt
is audited. Issuance is not idempotent: each call has a new nonce/token.

**Errors:** Without a session, JSON mode returns `401` `{ "redirect": "/login" }`, while redirect
mode returns `307 /login`. A missing/incomplete employee link produces JSON `409` with a local
`redirect`, or a `307` to `/dashboard/frappe-transfer?handoff=not-linked`. Other failures produce
JSON `500` `{ "error": string (max 180), "redirect": string }`, or a `307` local transfer redirect
with failure query parameters. Audit persistence/configuration failures are included in this flow.

### GET `/api/integrations/frappe/health`

Returns rollout/support health across Frappe reachability, provisioning, queues, identity mapping,
conflicts, and handoffs.

**Access:** Active maintenance-role session. No route-level rate limit or fresh factor.

**Input:** No path/query/body fields.

**Success:** `200` `{ "ok": true, "ready": boolean, "ping_ok": boolean, "ping": unknown|null,
"ping_error": string|null, "employee_provisioning_ready": boolean,
"employee_provisioning_error": string|null, "sync_state": IntegrationSyncStateRow[],
"recent_handoffs": FrappeHandoffEventRow[], "counts": { "outbox_pending": number,
"outbox_dead_letter": number, "timeclock_attendance_pending": number,
"timeclock_attendance_dead_letter": number, "inbox_pending": number, "conflicts_open": number,
"identity_map_rows": number, "handoff_issued_24h": number, "handoff_problem_24h": number } }`.
Individual diagnostic promises fail soft to false/null/zero; overall `ready` requires ping,
Employee DocType readiness, and at least one identity-map row. Network/database reads only.

**Errors:** `401` unauthenticated; `403` wrong role; `500` an unexpected health aggregation failure.

### GET `/api/integrations/frappe/provisioning/candidates`

Lists IMS employees with Frappe link/readiness status and current Frappe reference options.

**Access:** Active `Admin`, `Master Admin`, or `Super Admin` session. No route-level rate limit or
fresh factor.

**Input:** No path/query/body fields.

**Success:** `200` `{ "ok": true, "candidates": FrappeProvisioningCandidate[], "options": {
"companies": string[], "departments": string[], "branches": string[], "designations": string[],
"employment_types": string[], "holiday_lists": string[] }, "employee_provisioning": { "ready":
boolean, "error": string|null }, "default_company": "Piyam Travel LTD" }`. Each candidate has
`employee_id`, `full_name`, `email`, nullable role/department/location/manager, `is_active`, nullable
Frappe IDs, `status` (`linked | ready_for_transfer | missing_email`), and `missing_fields`. Stale
identity-map links discovered by this read are cleared, so it can have a repair side effect.

**Errors:** `401` unauthenticated; `403` wrong role; `500` portal/Frappe lookup failure.

### GET `/api/integrations/frappe/provisioning/me`

Returns the current employee's Frappe transfer candidate and setup options.

**Access:** Supabase session; any authenticated user whose employee profile exists. No route-level
rate limit or role/factor check.

**Input:** No path/query/body fields.

**Success:** `200` `{ "ok": true, "candidate": FrappeProvisioningCandidate, "options":
FrappeProvisioningReferenceOptions, "employee_provisioning": { "ready": boolean, "error":
string|null }, "default_company": "Piyam Travel LTD" }`. Like the candidates endpoint, validation
can clear a stale identity-map row.

**Errors:** `401` unauthenticated; `404` employee profile not found; `500` lookup/internal failure.

### POST `/api/integrations/frappe/provisioning/me`

Creates or links the current employee's Frappe Employee record without creating a Frappe User.

**Access:** Supabase session; any authenticated employee. No route-level rate limit, role check, or
fresh factor.

**Input:** JSON parsed directly. Required: `date_of_joining` and `date_of_birth` (`YYYY-MM-DD`
strings) and non-empty `gender`. `employee_id` is ignored/overridden with the session user;
`company` is ignored/forced to `Piyam Travel LTD`; `create_user` and `send_welcome_email` are
ignored/forced `false`. Optional nullable strings `employment_type`, `holiday_list`, `department`,
`branch`, and `designation` are normalized against live Frappe reference names. No body/field
length bounds or strict schema.

**Success:** `200` `{ "ok": true, "linked": boolean, "created_employee": boolean,
"created_user": false, "frappe_employee_id": string, "frappe_user_id": string|null,
"candidate": FrappeProvisioningCandidate }`. Existing linked/email-matched employees are reused;
the identity map is upserted, making successful retries intended to be idempotent.

**Errors:** `401` unauthenticated; `424` (`FrappeProvisioningSetupError`) missing Employee DocType,
default company, or other actionable upstream setup; `500` invalid required values, missing IMS
employee/email, JSON, Frappe, or database failure.

```json
{
  "date_of_joining": "2026-08-12",
  "date_of_birth": "1990-01-15",
  "gender": "Female",
  "department": "Operations",
  "designation": "Travel Consultant"
}
```

### POST `/api/integrations/frappe/provisioning/transfer`

Admin transfer that creates or links a Frappe Employee and can optionally create a login User.

**Access:** Active `Admin`, `Master Admin`, or `Super Admin` session. No route-level rate limit or
fresh factor.

**Input:** JSON parsed directly. Required: `employee_id` (non-empty IMS employee ID),
`date_of_joining` and `date_of_birth` (`YYYY-MM-DD`), and `gender` (non-empty string). `company` is
ignored/forced to `Piyam Travel LTD`. Optional nullable strings: `employment_type`, `holiday_list`,
`department`, `branch`, `designation`; only names matching live Frappe references survive.
`create_user` and `send_welcome_email` are optional booleans and take effect only when exactly
`true`; welcome email applies to a newly created user. No byte/length/strict schema.

**Success:** `200` `{ "ok": true, "linked": boolean, "created_employee": boolean,
"created_user": boolean, "frappe_employee_id": string, "frappe_user_id": string|null,
"candidate": FrappeProvisioningCandidate }`. Reuses an existing valid identity-map record or
email-matched Frappe Employee, creates missing requested records, then upserts identity mapping.
Successful retries are designed to be idempotent.

**Errors:** `401` unauthenticated; `403` wrong role; `424` actionable Frappe setup failure; `500`
invalid/missing required values, missing employee/email, JSON, upstream, or database failure.

### POST `/api/integrations/frappe/reconcile`

Processes up to 100 pending inbound Frappe leave events and reports open integration conflicts.

**Access:** Active maintenance-role session. No route-level rate limit or fresh factor.

**Input:** No path/query/body fields.

**Success:** `200` `{ "ok": true, "reconcile": { "processed": number, "failed": number,
"conflicts": number }, "openConflictCount": number, "conflicts": [{ "id": string, "domain":
string, "entity_id": string, "status": string, "created_at": string }] }`. Inbox rows become
processed/failed, leave rows are inserted/updated, conflicts may be created, and sync health is
updated. Processed rows are excluded from reruns; pending failures can be retried only if restored
to pending by operations.

**Errors:** `401` unauthenticated; `403` wrong role; `500` reconcile/conflict query failure.

### POST `/api/integrations/frappe/sync/pull`

Pulls up to 100 changed Frappe Leave Applications, ingests them, reconciles up to 100 inbox events,
then returns integration health.

**Access:** Active maintenance-role session. No route-level rate limit or fresh factor.

**Input:** No path/query/body fields.

**Success:** `200` `{ "ok": true, "mode": "leave", "message": string, "pull": { "fetched":
number, "accepted": number, "duplicates": number }, "reconcile": { "processed": number,
"failed": number, "conflicts": number }, "health": FrappeIntegrationHealth }`. Pulls incrementally
from last-pull time, deduplicates by Frappe document name plus modification time, mutates inbox,
leave/conflict, and sync-state tables. Duplicate source events make reruns convergence-oriented.

**Errors:** `401` unauthenticated; `403` wrong role; `500` upstream, ingest, reconcile, health, or
database failure.

### POST `/api/integrations/frappe/sync/push`

Manually dispatches a bounded batch of due portal-to-Frappe outbox events.

**Access:** Active maintenance-role session. No route-level rate limit or fresh factor.

**Input:** JSON parsed directly and tolerant of malformed JSON as `{}`: `limit` (optional runtime
number-like value, default `25`, clamped 1–250). The route does not require an integer or impose a
body size/strict schema; clients should send an integer.

**Success:** `200` `{ "ok": true, "fetched": number, "processed": number, "failed": number }`.
Rows are conditionally reserved, sent with stable downstream idempotency keys, and marked
processed/retry/dead-letter. Processed rows are not resent; concurrent dispatchers skip already
reserved rows.

**Errors:** `401` unauthenticated; `403` wrong role; `500` invalid effective limit, query, dispatcher,
or internal failure. Individual downstream failures increment `failed` inside `200`.

### POST `/api/integrations/frappe/webhook`

Authenticates and ingests an arbitrary inbound Frappe event into the integration inbox.

**Access:** HMAC webhook authentication only. Header `X-Frappe-Signature` is required and may be
raw lowercase/uppercase hex or prefixed `sha256=`; it must equal HMAC-SHA256 of the exact raw body
using `FRAPPE_WEBHOOK_SECRET`. Missing configuration fails closed. No cookie, role, factor, or route
rate limit.

**Input:** Raw request body must be JSON after signature verification. Optional payload keys
`event_type` or `eventType` select event type (default `unknown`). Source-event ID is the first
available of `event_id`, `eventId`, or `name`, otherwise a new UUID. The complete parsed object is
stored. No content-type requirement, size bound, or field schema.

**Success:** New event: `200` `{ "accepted": true }`. Duplicate source ID: `200` `{ "accepted":
false, "duplicate": true }`. Inbox uniqueness makes retries idempotent only when the sender supplies
a stable event/name ID; payloads without one receive a new UUID each time.

**Errors:** `401` missing/invalid signature (including missing secret); `500` invalid JSON,
non-object/persistence/internal failure.

```text
X-Frappe-Signature: sha256=<hex HMAC of the exact request bytes>
```

## Timeclock devices and punches

### GET `/api/timeclock/devices/activity`

Returns a physical device's latest 50 punch activities, suitable for incremental firmware display.

**Access:** Signed physical-device authentication using the shared PTC headers. Query `device_id`
must equal `X-PTC-Device-Id`. No portal session or separate rate limit; nonce replay protection
applies.

**Input:** Query `device_id` (required non-empty string) and optional `since` (digits-only,
nonnegative safe-integer Unix seconds representing a valid date). The signature covers the exact
query ordering/encoding. No body.

**Success:** `200` raw array `[{ "id": string, "user_name": string, "timestamp": number,
"action": "clocked in"|"clocked out" }]`, chronological after fetching the newest 50. Unknown
employee names become `Unknown employee`. Response is `Cache-Control: no-store`. Read-only except
authentication nonce maintenance.

**Errors:** `400` missing device ID/invalid `since`; `401` invalid/replayed device authentication;
`403` inactive device; `500` auth backend/configuration or activity query failure.

### GET `/api/timeclock/devices/config`

Returns current configuration assigned to a physical timeclock device.

**Access:** Signed physical-device authentication. Query/header device IDs must match. No portal
session or separate rate limit.

**Input:** Query `device_id` (required non-empty string); no body. Exact query is signed.

**Success:** `200` `{ "device_id": string, "location_id": string|null, "location_name":
string|null, "qr_interval_sec": number, "is_active": boolean }`. Read-only except auth nonce
maintenance.

**Errors:** `400` missing device ID; `401` invalid/replayed authentication; `403` inactive device;
`500` auth/configuration or location lookup failure.

### POST `/api/timeclock/devices/heartbeat`

Records physical device liveness and bounded telemetry.

**Access:** Signed physical-device authentication. JSON `device_id` must equal the authentication
header ID. No portal session or separate rate limit.

**Input:** Raw JSON bytes are included in the signature. `device_id` is required non-empty string.
Optional `firmware_version` (string trimmed/truncated to 80), `ip` (string trimmed/truncated to 64),
`wifi_rssi` (safe integer/coercible number -200–0), `free_heap` and `uptime_sec` (safe
integer/coercible number 0–`Number.MAX_SAFE_INTEGER`). Missing/invalid optional values are stored as
`null`, not rejected. No explicit body-size/strict schema.

**Success:** `200` `{ "ok": true, "server_time": number }`, where server time is Unix seconds.
Updates last seen, telemetry, and update time. Repeated heartbeats overwrite current telemetry and
are desired, though timestamps/nonces make requests unique.

**Errors:** `400` invalid JSON/missing device ID; `401` invalid/replayed authentication; `403`
inactive device; `500` auth/configuration or update failure.

### POST `/api/timeclock/devices/manual-code`

Creates an eight-digit, 30-second manual punch code for the device's current signed QR payload.

**Access:** Signed physical-device authentication. JSON/header device IDs must match. Per-device
database rate limit equals that device's `qr_interval_sec`; authentication nonce replay protection
also applies.

**Input:** Raw signed JSON: `device_id` (required non-empty string) and `qr_payload` (required string
starting `ptc1:`, maximum 4,096 characters). No explicit body-size/strict schema.

**Success:** `200` `{ "code": string, "code_display": string, "expires_at": string }` with
`Cache-Control: no-store`. Deletes prior unused codes for the device and inserts one random
eight-digit code, retrying uniqueness up to five times. Not idempotent: each allowed request
replaces the prior code.

**Errors:** `400` invalid JSON/device/QR payload; `401` invalid/replayed authentication; `403`
inactive device; `429` requested too soon with numeric `retry_after`; `500` limiter/code storage or
auth backend failure; `503` unique code could not be allocated.

### GET `/api/timeclock/events`

Lists paginated punch events visible to the signed-in employee.

**Access:** Supabase session. `scope=self` is available to any authenticated user. `scope=team`
requires maintenance/admin access (`Maintenance Admin`, `Admin`, `Master Admin`, `Super Admin`) or
manager access (role contains `manager` or the user has reports). Managers see self plus recursive
reports; maintenance/admin sees all. No route-level rate limit or fresh factor.

**Input:** Query `scope` (optional case-insensitive `self | team`, default `self`), `employeeId`
(optional only for team and must fall within allowed IDs), `pageSize` (optional base-10 integer,
default 25, clamped 1–200 or 1–5,000 when `export=1`), `page` (optional base-10 integer, default 1,
minimum 1), `export` (exact `1` enables larger page), and `from`/`to` (optional strings passed
directly as inclusive `scanned_at` bounds). Invalid numeric/date strings are not explicitly mapped
to `400` and may cause `500`. No body.

**Success:** Both modes return `200` `{ "events": TimeclockEventRow[], "total": number, "page":
number, "pageSize": number, "role": string|null, "canAdjustTime": boolean }`; team mode additionally
returns alphabetically sorted `employees: [{ "id": string, "name": string }]`. Event fields include
IDs, event/punch types, original/adjusted device and scan timestamps, adjustment audit values, geo,
device ID/name, and in team mode employee name. Read-only.

**Errors:** `400` unsupported scope; `401` unauthenticated; `403` team scope/employee outside allowed
tree; `500` missing configuration or employee/event query/internal failure.

### PATCH `/api/timeclock/events/[eventId]/adjust`

Applies a single audited timestamp correction to one punch while retaining original timestamps.

**Access:** Active maintenance-role session. No route-level rate limit or fresh factor.

**Input:** Path `eventId` (required non-empty string; no explicit UUID/length validation). JSON
parsed directly: `adjustedTime` (required non-empty date-time string accepted by JavaScript `Date`)
and `reason` (required trimmed string of at least 8 characters; no maximum). No body-size/strict
schema.

**Success:** `200` `{ "adjustedEventId": string, "punchType": string|null, "adjustedTime":
string|null, "reason": string }`. Writes normalized ISO time to both adjusted fields, records actor,
reason, and adjustment time, then queues an attendance summary for the adjusted UTC date. Each
event may be adjusted once; not reversible through this route.

**Errors:** `400` missing/invalid ID, time, or short reason; `401` unauthenticated; `403` wrong role;
`404` event missing; `409` already/concurrently adjusted; `500` JSON, query, update, or attendance
queue failure. A queue failure happens after the adjustment has persisted.

```json
{ "adjustedTime": "2026-08-12T09:00:00Z", "reason": "Clock was offline" }
```

### GET `/api/timeclock/manual-entry/diagnostics`

Runs internal database/configuration diagnostics for manual entry.

**Access:** Active `Master Admin` or `Super Admin` session. No route-level rate limit or fresh
factor.

**Input:** No path/query/body fields.

**Success:** `200` `{ "timestamp": string, "checks": CheckResult[] }`. Checks include
`timeclock_devices table`, `timeclock_manual_codes table`, and `Environment variables`; each carries
`status` (`PASS | FAIL | ERROR | INFO`) plus applicable `error`, `result`, `supabaseUrl`, and
`serviceKey` presence metadata. It exposes only whether the service key is set and its length, never
the key. Read-only.

**Errors:** `401` unauthenticated; `403` wrong role; `500` top-level diagnostics failure, with both
`error` and `message`. Individual failed checks normally remain inside `200`.

### POST `/api/timeclock/manual-entry/generate`

Creates/reuses the caller's virtual manual-entry device and generates a 30-second code/QR payload.

**Access:** Supabase session plus manager-level access (role contains `manager` or caller has direct
reports) or maintenance/admin timeclock access. No route-level rate limit or fresh factor.

**Input:** The current implementation does not parse or use the request body. Despite an older
comment mentioning `employeeId`/`deviceId`, codes are generated by and for the authenticated
caller's virtual-device workflow. No query/path fields.

**Success:** `200` `{ "code": string, "codeDisplay": string, "qrPayload": string, "expiresAt":
number }`; `expiresAt` is Unix milliseconds. Creates a virtual device named from the actor ID if
missing, inserts a random eight-digit code, and returns its signed `ptc1:` QR payload. Not
idempotent; every call inserts a new code, and this route has no explicit generation throttle.

**Errors:** `401` unauthenticated; `403` insufficient manager/maintenance scope; `500` role/device/
code storage, configuration, crypto, or internal failure. Some database failures include
non-sensitive `details`, `code`, or `hint`.

### POST `/api/timeclock/manual-entry/submit`

Atomically claims an eight-digit manual code and records the caller's next alternating UTC-day
punch.

**Access:** Supabase session; any authenticated user. No route-level rate limit or role/factor
check. The code itself is the short-lived possession proof.

**Input:** JSON parsed directly: `code` (required string; all non-digits are removed, then exactly
eight digits are required, so `1234-5678` is accepted). No body-size/strict schema; documented
`deviceId` is not consumed.

**Success:** `200` `{ "eventId": string|undefined, "eventType": string, "punchType": "IN"|"OUT",
"scannedAt": string }`. Claims the code once, rejects expired/recent duplicates, alternates from the
caller's last UTC-day punch, inserts a tamper-evident event with IP/user-agent, deletes the code, and
queues attendance sync. Not idempotent: a code cannot be reused.

**Errors:** `400` malformed/expired code; `401` unauthenticated; `404` invalid/already-used code;
`409` punch on the same device within 8 seconds; `500` JSON/claim/event/attendance failure. Expired
and duplicate-punch paths occur after the code is claimed, so that code cannot be retried. Event
insert failure attempts to release the claim; attendance failure occurs after event creation and
code deletion.

### GET `/api/timeclock/notices`

Returns active, device-displayable notice slides targeted globally or to the device's location.

**Access:** Signed physical-device authentication; query/header device IDs must match. No portal
session or separate rate limit.

**Input:** Query `device_id` (required non-empty string); optional `since` (finite nonnegative
number interpreted as Unix seconds). Unlike activity, decimals are accepted. No body; exact query
is signed.

**Success:** `200` raw array of `{ "id": string, "title": string|null, "body": string|null,
"image_url": string|null, "hyperlink_url": string|null, "display_seconds": number,
"sort_order": number, "created_at": string, "updated_at": string }`. Only active slides with no
role/department target and a null/matching location are included; `since` filters strictly newer
updates. Read-only except auth nonce maintenance.

**Errors:** `400` missing device/invalid `since`; `401` invalid/replayed authentication; `403`
inactive device; `500` auth/configuration, invalid effective date, or slide query failure.

### POST `/api/timeclock/scan`

Verifies a rotating device QR code and records the authenticated employee's next IN/OUT punch.

**Access:** Supabase session. The QR contains its own device HMAC; this route does not use the PTC
request-auth headers. No route-level rate limit or employee role check.

**Input:** JSON parsed directly: `qrText` (required string containing raw QR JSON, base64url JSON, or
`ptc1:<base64url JSON>`) and optional `geo` object `{ "lat": number, "lng": number, "accuracy":
number }` (stored as supplied; no runtime shape/range validation). QR payload requires `v: 1`,
non-empty `device_id`, `nonce` (maximum 128), `sig`, and finite `ts` in seconds or milliseconds. Its
timestamp must be within 120 seconds; signature is base64url HMAC-SHA256 of
`device_id.normalizedSeconds.nonce`. No body-size bound.

**Success:** `200` `{ "eventId": string|undefined, "eventType": string|undefined, "punchType":
"IN"|"OUT", "scannedAt": string|undefined }`. Reserves the QR nonce for five minutes, alternates
against the caller's last UTC-day punch, blocks an 8-second same-device duplicate, inserts a
tamper-evident hash-chain event, and queues attendance. Each QR nonce is one-use; not idempotent.

**Errors:** `400` malformed/missing/expired QR, bad QR signature, or invalid timestamp; `401`
unauthenticated; `403` inactive device; `404` device missing; `409` QR nonce already used or recent
duplicate punch; `500` configuration, nonce/event database, JSON, attendance, or internal failure.
The nonce remains reserved on duplicate-punch rejection. Event insert failures release it;
attendance failures occur after event persistence.

## Training and certification

### GET `/api/training`

Loads courses, enrollments, current-employee context, and—when authorized—assignment candidates.

**Access:** Supabase session. Training-admin behavior is enabled only when the resolved role name
exactly matches `Admin`, `Master Admin`, `Maintenance Admin`, or `Manager`. Other authenticated
employees receive only their own enrollments and no employee directory. There is no route-level
rate limit or fresh-factor check.

**Input:** No path/query/body fields.

**Success:** `200` `{ "currentEmployee": { "id": string, "full_name": string, "email":
string|null, "role_name": string, "location": LocationRelation|null }, "isAdmin": boolean,
"courses": TrainingCourseWithLessonsAndQuestions[], "enrollments":
TrainingEnrollmentWithCourseAndCertificates[], "employees": EmployeeAssignmentRow[] }`. Courses
are required-first then title; enrollments newest-updated first. Admins receive all enrollments and
active employees; others receive only their own and `employees: []`. Read-only.

**Errors:** `401` unauthenticated; `500` employee/course/enrollment/employee-directory or internal
failure.

### POST `/api/training`

Performs course authoring, assignment, progress, quiz completion, attempt, and certificate actions.

**Access:** Supabase session. Exact training-admin roles (`Admin`, `Master Admin`, `Maintenance
Admin`, `Manager`) are required for course/lesson/question creation and for targeting another
employee. Other authenticated users may enroll, start, or complete for themselves. No route-level
rate limit or fresh factor.

**Input:** JSON parsed directly, with no byte limit or strict schema. `action` is required and must
be one of the action contracts below. Most IDs and text fields have no explicit length/UUID
validation.

- `create-course`: `title` required non-empty trimmed string. Optional `description` (default `""`),
  `category` (default `General`), `estimatedMinutes` (number-like, default 15, minimum 1),
  `passingScore` (number-like, default 80, clamped 0–100), `certificateValidDays` (number-like or
  `null`; falsey becomes null), and `isRequired` (converted with JavaScript truthiness). Stores
  `created_by` as caller. Requires training-admin.
- All other actions require `courseId`. Authoring actions pass it directly to their insert and rely
  on database integrity; enrollment/progress actions explicitly load the course and require it to
  be active.
- `create-lesson`: requires training-admin and non-empty `lessonTitle`; optional `lessonBody`
  (default `""`) and number-like `sortOrder` (default 0).
- `create-question`: requires training-admin and non-empty `questionPrompt`. `questionType` is
  `single_choice | multi_select | true_false | image_choice`, defaulting to `single_choice` for any
  other value. `questionOptions` is an array of strings or `{ id, label, imageUrl? }`; normalized
  non-empty options are capped at 8 and at least 2 are required. True/false ignores supplied options
  and creates `true`/`false`. Optional `correctAnswerIds` is filtered to valid IDs; otherwise
  `correctOptionIndex` (number-like, default 0, clamped to the option range) selects the answer.
  Non-multi questions keep one answer. Optional `explanation`, `imageUrl`, `points` (number-like,
  default 1, clamped 1–20), and `sortOrder` (default 0).
- `enroll` and `start`: optional `employeeId` (default caller; another employee requires admin) and
  `dueDate` (string/null, stored without format validation). Both upsert by course/employee;
  `enroll` sets `assigned`, while `start` sets `in_progress` and refreshes `started_at`.
- `complete`: the same optional target/due date, optional `answers` object keyed by question ID with
  values as option ID/index or arrays, `score` (used only for a course with no quiz; non-finite
  defaults to 100, otherwise rounded/clamped 0–100), and `notes`. Quiz score is point-weighted from
  stored answers. Passing uses the course score (default 80), sets completed/certificate expiry,
  appends an attempt, and upserts a certificate; failure leaves enrollment in progress.

**Success:** Every action returns `200`. Shapes are `create-course` `{ "course":
TrainingCourseRow }`; `create-lesson` `{ "lesson": TrainingLessonRow }`; `create-question` `{
"question": TrainingQuestionRow }`; `enroll`/`start` `{ "enrollment":
TrainingEnrollmentWithCourse }`; and `complete` `{ "enrollment":
TrainingEnrollmentWithCourse, "passed": boolean, "score": number }`. Authoring creates rows and is
not idempotent. Enroll/start upserts but refreshes timestamps. Every completion appends an attempt,
so retries are not idempotent; a passing certificate is upserted by enrollment.

**Errors:** `400` missing/unsupported action, required course/title/prompt/options/answers, or
inactive course; `401` unauthenticated; `403` authoring/other-employee action outside training-admin
scope; `500` JSON, employee/course/database, attempt/certificate, or internal failure. Multi-step
completion can partially persist—for example, enrollment may update before attempt/certificate
failure.

Course example:

```json
{
  "action": "create-course",
  "title": "Data protection basics",
  "category": "Compliance",
  "estimatedMinutes": 25,
  "passingScore": 80,
  "certificateValidDays": 365,
  "isRequired": true
}
```

Quiz-completion example:

```json
{
  "action": "complete",
  "courseId": "course-id",
  "answers": {
    "question-id-1": "option-a",
    "question-id-2": ["option-a", "option-c"]
  },
  "notes": "Completed during onboarding"
}
```
