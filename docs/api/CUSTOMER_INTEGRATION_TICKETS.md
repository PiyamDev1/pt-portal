# Customer portal ticket trips

Signed server-to-server endpoint used by the customer portal to show normal Ticketing-ledger journeys alongside package trips.

### POST `/api/integrations/customer/v1/trips/tickets`

**Access:** Requires the customer integration HMAC headers, nonce replay protection, and the `customer-portal` integration origin. This is not a browser endpoint.

**Input:** JSON object containing `pnr` and `lastName`. The endpoint normalizes both values and returns a result only when exactly one active Held or Issued ticket matches both.

**Success:** Returns the matching ticket journey with an opaque trip alias, PNR, airline label, departure and return dates, destination, and the active itinerary-sector schedule. Financials and ticket documents are excluded.

**Errors:** `400` for an invalid contract, `401` or `403` for invalid integration authentication, `409` for replay conflicts, `503` when Ticketing schedules cannot be loaded, and `500` for an unexpected internal error.

## Guest Package access

### POST `/api/integrations/customer/v1/trips/access`

**Access:** Signed customer-portal integration. No staff session is accepted.

**Input:** Strict JSON `{ packageReference, leadSurname, turnstileToken? }`;
reference is 4 to 80 characters and surname is 1 to 100 characters.

**Success:** `200` integration envelope `{ trip, guestGrant }`. The trip is a
customer-safe summary and the 30-minute grant contains `token` and `expiresAt`
with read-only scope.

**Errors:** `400` invalid input; `401`/`403` invalid integration; `404` no
unique active Package match; `429` abuse limit; `503` Package/grant service
unavailable.

### POST `/api/integrations/customer/v1/trips/legacy/exchange`

**Access:** Signed customer-portal integration plus an idempotency key.

**Input:** Strict JSON `{ token }`; token is the 20 to 2048 character legacy
Package document-access token.

**Success:** `200` integration envelope `{ tripId, guestGrant, expiresAt }`
that replaces a still-enabled, unexpired legacy link with a 30-minute grant.

**Errors:** `400` invalid input; `401`/`403` integration or idempotency failure;
`404` disabled, expired, or unknown legacy link; `503` grant/database service
unavailable.

### GET `/api/integrations/customer/v1/trips/[tripId]`

**Access:** Signed customer-portal integration plus `x-piyam-access-grant`
with trip `read` scope. Account grants also bind to
`x-piyam-customer-subject`.

**Input:** Path `tripId` is an opaque UUID. No body.

**Success:** `200` integration envelope containing the trip summary filtered
to the grant's scopes. Financial, document, lead, and invitation fields are
included only when authorised.

**Errors:** `401`/`403` invalid integration or grant; `404` invalid/mismatched
trip; `503` Package data unavailable.

### GET `/api/integrations/customer/v1/trips/[tripId]/documents/[documentId]`

**Access:** Signed integration plus a trip grant with `documents` scope.

**Input:** Both path fields are opaque UUIDs. Optional query
`disposition=attachment`; other values use inline display. HTTP `Range` is
forwarded to storage.

**Success:** Streams the authorised document with stored content type,
length/range headers, safe disposition, and request ID; returns `200` or `206`.

**Errors:** `401`/`403` invalid integration or grant; `404` document does not
belong to the trip; `416` invalid range; `502`/`503` storage unavailable.

## Account linking and removal

### POST `/api/integrations/customer/v1/trips/link/request-otp`

**Access:** Signed customer-portal integration plus idempotency.

**Input:** Strict JSON `{ tripId, guestGrant, customerSubject }`; IDs are UUIDs
and the guest grant is 40 to 2048 characters with trip `read` scope.

**Success:** `200` integration envelope with OTP challenge ID, masked lead
email, expiry, and resend timing.

**Errors:** `400` invalid contract; `401`/`403` integration/grant failure; `404`
Package lacks a linkable lead email; `429` OTP limit; `503` challenge or email
service unavailable.

### POST `/api/integrations/customer/v1/trips/link/verify-otp`

**Access:** Signed customer-portal integration plus idempotency.

**Input:** Strict JSON `{ challengeId, otp, customerSubject, customerCode,
claimLoyalty? }`; UUID identifiers, 6 to 8 digit OTP, and customer code length
8 to 40.

**Success:** `200` integration envelope `{ trip, accountGrant,
grantExpiresAt, loyaltyClaim }`. The lead receives read, document, financial,
lead, and invitation scopes; optional loyalty is source-reconciled.

**Errors:** `400` invalid/exhausted OTP; `401`/`403` integration failure; `404`
expired challenge; `409` account/resource conflict; `503` grant, Package, or
loyalty service unavailable.

### DELETE `/api/integrations/customer/v1/trips/[tripId]/unlink`

**Access:** Signed integration plus idempotency. Package journeys require the
account grant; ticket journeys are resolved through their customer-safe alias.

**Input:** Path `tripId` is an opaque UUID. Strict JSON
`{ customerSubject, journeyKind, accountGrant? }`, where `journeyKind` is
`ticket` or `package`.

**Success:** `200` integration envelope `{ unlinked: true, loyalty }`. Active
customer grants are revoked and unreedeemed source points are removed while
already-redeemed FIFO points remain accounted for.

**Errors:** `400` invalid contract; `401`/`403` integration/grant failure;
`404` trip not found or mismatched; `409` idempotency conflict; `503` access or
loyalty reconciliation unavailable.

## Traveller invitations

### POST `/api/integrations/customer/v1/trips/[tripId]/invitations`

**Access:** Signed integration plus idempotency and a lead account grant with
`invite` scope.

**Input:** Strict JSON `{ email, canViewFinancials, inviterSubject,
accountGrant, inviterName? }`; subjects are UUIDs and inviter name is at most
100 characters.

**Success:** `201` integration envelope `{ invitationId, emailMasked,
expiresAt }`. A hashed, 72-hour invitation is stored and emailed; failed sends
revoke the invitation.

**Errors:** `400` invalid contract; `401`/`403` invalid integration, grant, or
non-lead inviter; `409` idempotency conflict; `429` invitation limit; `503`
storage/email unavailable.

### DELETE `/api/integrations/customer/v1/trips/[tripId]/invitations/[invitationId]`

**Access:** Signed integration plus idempotency and the lead account grant.

**Input:** UUID trip/invitation path fields and strict JSON
`{ inviterSubject, accountGrant }`.

**Success:** `200` integration envelope `{ revoked: true }`. Revocation is
idempotent and also revokes an accepted traveller's active trip grants.

**Errors:** `400` invalid input; `401`/`403` integration, grant, or lead-scope
failure; `404` invitation not found; `409` idempotency conflict; `503` grant or
invitation storage unavailable.

### POST `/api/integrations/customer/v1/trips/invitations/accept`

**Access:** Signed customer-portal integration plus idempotency.

**Input:** Strict JSON `{ token, customerSubject, customerEmail, ageBand }`;
token matches `pti_...`, subject is a UUID, and age band is `age_16_17` or
`adult`.

**Success:** `200` integration envelope `{ invitationId, trip, accountGrant,
grantExpiresAt }`. Read/document scopes are always granted; requested
financial scope is granted only to adults.

**Errors:** `400` invalid input; `401`/`403` integration failure; `404` invalid,
expired, revoked, or wrong-email invitation; `409` accepted by another account;
`503` Package/grant storage unavailable.
