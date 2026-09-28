# Customer Integration Appointment API

Last verified against source: September 1, 2026.

These routes are private server-to-server integrations for the independent
customer portal. They are not staff-session or browser endpoints.

## Available appointment dates

### POST `/api/integrations/customer/v1/appointments/available-dates`

**Access:** Customer portal server only. Requests require the configured key
ID, timestamp, nonce, body digest, request ID, and valid HMAC signature. Stale
or replayed requests are rejected.

**Input:** Strict JSON `{ serviceId, branchId, groupSize }`. The IDs are public
resource-alias UUIDs and `groupSize` is an integer from 1 to 100.

**Success:** `200` integration envelope containing an array of
`{ date, availableTimeCount }` for bookable dates in the next 35 days. Dates
without a valid service schedule or remaining capacity are omitted. This
lookup does not issue temporary booking slots.

**Errors:** `400` invalid input or group size; `401`/`403` invalid integration
authentication, timestamp, origin, or replayed nonce; `404` unknown public
service or branch; `503` schedule or capacity data is unavailable.

## Catalogue and exact availability

### GET `/api/integrations/customer/v1/appointments/catalog`

**Access:** Customer portal server only through the signed integration
contract. This is not a browser or staff-session endpoint.

**Input:** No body or query fields.

**Success:** `200` integration envelope whose `data` contains `branches` and
`services`. Branches expose an opaque UUID, name, address, contact phone, and
`Europe/London` timezone. Services expose customer-safe booking details and
opaque service/branch identifiers.

**Errors:** `401`/`403` invalid integration authentication, timestamp, origin,
or replayed nonce; `503` catalogue or branch data unavailable.

### POST `/api/integrations/customer/v1/appointments/availability`

**Access:** Customer portal server only through the signed integration
contract.

**Input:** Strict JSON `{ serviceId, branchId, date, groupSize }`; `date` is
`YYYY-MM-DD`, IDs are public UUIDs, and group size is 1 to 100.

**Success:** `200` integration envelope with the available slots for the exact
service, branch, date, and group size. Each slot uses an opaque public slot ID
and customer-safe timing/capacity fields.

**Errors:** `400` malformed input; `401`/`403` invalid integration
authentication; `404` unknown service or branch; `503` booking rules or
capacity unavailable.

## Creation and saved appointments

### POST `/api/integrations/customer/v1/appointments`

**Access:** Signed customer-portal integration plus an idempotency key.

**Input:** Strict JSON `{ serviceId, branchId, slotId, contactName,
contactEmail, contactPhone, groupSize, turnstileToken?, customerSubject }`.
The IDs are public UUIDs, contact values are bounded, group size is 1 to 100,
and `customerSubject` is a UUID or `null` for a guest.

**Success:** `201` integration envelope containing `{ appointment,
managementGrant }`. The appointment includes its `APT-...` reference, status,
service/branch, ISO times, group/contact summary, change cutoff, and version.

**Errors:** `400` invalid input; `401`/`403` integration or idempotency failure;
`404`/`409` stale or unavailable slot; `429` rate limit; `503` booking,
email-state, or capacity service unavailable.

### POST `/api/integrations/customer/v1/appointments/sync`

**Access:** Customer portal server only through the signed integration
contract.

**Input:** Strict JSON `{ customerSubject, verifiedEmail,
knownGrantReferences }`; subject is a UUID and at most 100 known public
references may be supplied.

**Success:** `200` integration envelope `{ appointments }` containing
email-matched appointments owned by, or newly linked to, the customer. Each
item carries the appointment summary and a new management grant when needed.

**Errors:** `400` invalid input; `401`/`403` invalid integration
authentication; `503` appointments cannot be matched.

### POST `/api/integrations/customer/v1/appointments/claim-code`

**Access:** Signed customer-portal integration plus an idempotency key.

**Input:** Strict JSON `{ customerSubject, guestCode }`; subject is a UUID and
the code must match `VISIT-[A-F0-9]{12}`.

**Success:** `200` integration envelope with `{ appointment,
managementGrant }`; the booking is linked to the account and a long-lived
read/manage grant is issued.

**Errors:** `400` invalid contract; `401`/`403` integration or idempotency
failure; `404` code not found; `409` appointment linked elsewhere; `503`
storage unavailable.

### GET `/api/integrations/customer/v1/appointments/[reference]`

**Access:** Signed customer-portal integration and an
`x-piyam-access-grant` with appointment `read` scope.

**Input:** Path `reference` must match `APT-[A-F0-9]{16}`. No body.

**Success:** `200` integration envelope containing the current customer-safe
appointment summary, including version and online-modification cutoff.

**Errors:** `401`/`403` invalid integration signature or grant; `404` invalid,
expired, revoked, or mismatched appointment; `503` appointment data
unavailable.

### PATCH `/api/integrations/customer/v1/appointments/[reference]`

**Access:** Signed customer-portal integration plus idempotency and a
`managementGrant` with appointment `manage` scope.

**Input:** Path `reference` is `APT-[A-F0-9]{16}`. Strict JSON contains
`{ expectedVersion, action, managementGrant, contactName?, contactPhone?,
groupSize?, slotId? }`; action is `update` or `cancel`.

**Success:** `200` integration envelope with the updated appointment summary.
The route records the same audit and notification-state facts as staff edits.

**Errors:** `400` invalid change; `401`/`403` integration or grant failure;
`404` appointment not found; `409` version/slot conflict; `410` customer change
cutoff reached; `503` persistence or notification service unavailable.

## Claim and management grants

### POST `/api/integrations/customer/v1/appointments/claim/request-otp`

**Access:** Signed customer-portal integration plus an idempotency key.

**Input:** Strict JSON `{ publicReference, customerSubject }`; reference is 8
to 40 letters, digits, or hyphens and subject is a UUID.

**Success:** `200` integration envelope with the OTP challenge ID, masked
email destination, expiry, and resend timing.

**Errors:** `400` invalid input; `401`/`403` integration or idempotency failure;
`404` appointment cannot be verified for the account; `429` OTP limit; `503`
email or challenge storage unavailable.

### POST `/api/integrations/customer/v1/appointments/claim/verify-otp`

**Access:** Signed customer-portal integration plus an idempotency key.

**Input:** Strict JSON `{ challengeId, otp, customerSubject }`; challenge and
subject are UUIDs and OTP is 6 to 8 digits.

**Success:** `200` integration envelope containing `{ appointment,
accountGrant, grantExpiresAt }`. Verification links the booking to the account
and returns a long-lived read/manage grant.

**Errors:** `400` invalid or exhausted OTP; `401`/`403` integration or
idempotency failure; `404` challenge not found/expired; `409` appointment link
changed or belongs to another account; `503` persistence unavailable.

### POST `/api/integrations/customer/v1/appointments/manage/exchange`

**Access:** Signed customer-portal integration plus an idempotency key. The
supplied one-time exchange grant is consumed.

**Input:** Strict JSON `{ token }`; token length is 40 to 2048 characters.

**Success:** `200` integration envelope `{ publicReference, managementGrant,
expiresAt }` with a 90-day read/manage grant.

**Errors:** `400` invalid body; `401`/`403` integration or grant failure; `404`
consumed, expired, revoked, or unknown appointment; `409` idempotency conflict;
`503` grant service unavailable.
