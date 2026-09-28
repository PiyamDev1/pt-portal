# Staff Loyalty and POS Media API

Last verified against source: September 28, 2026.

These routes support the staff Loyalty workspace, Member Service walk-ins,
scheduled bonus processing, POS voucher lookup, and private POS logo storage.

## Loyalty workspace

### GET `/api/loyalty`

**Access:** Authenticated staff in an administrative role. Response is private
and not cacheable.

**Input:** Optional query `search`, trimmed and limited to 100 characters.

**Success:** `200` containing overview totals, matching members, tiers,
programme policy, campaign configuration, branch/service options, walk-in
windows, adjustment capability, and load timestamp.

**Errors:** `400` search too long; `401`/`403` staff access denied; `503`
loyalty data unavailable.

### GET `/api/loyalty/[memberId]`

**Access:** Authenticated staff in an administrative role.

**Input:** UUID `memberId` path; no body.

**Success:** `200` with `{ member, entries }`, including balances,
rank/lifetime totals, lifecycle metadata, and loyalty ledger entries.

**Errors:** `400` invalid UUID; `401`/`403` access denied; `404` member not
found; `503` member data unavailable.

### POST `/api/loyalty/[memberId]/adjustments`

**Access:** Authenticated administrative staff; limited to 20 changes per 15
minutes per user/IP.

**Input:** UUID path and strict JSON `{ points, reason, idempotencyKey }`.
Points are a non-zero integer from -100,000 to 100,000, reason is 5 to 300
characters, and key is a UUID.

**Success:** `201` with refreshed `{ member, entries }` after the audited
adjustment.

**Errors:** `400` invalid input; `401`/`403` access denied; `404` member not
found; `409` business/idempotency conflict; `429` rate limit.

### PATCH `/api/loyalty/program`

**Access:** Authenticated administrative staff; limited to 30 mutations per 15
minutes per user/IP.

**Input:** Strict discriminated JSON with `action`. Supported actions update
earning rules, voucher rewards, campaign events/bonus campaigns, ranks,
achievements, and walk-in windows. Each action accepts only its bounded IDs,
points/money, dates, eligibility, caps, status, and display/active fields; body
limit is 16 KiB.

**Success:** `200` with the complete refreshed Loyalty dashboard and programme
configuration.

**Errors:** `400` invalid action/fields or programme invariant; `401`/`403`
access denied; `409` save conflict; `429` rate limit.

## Member Service walk-ins

### POST `/api/loyalty/walk-ins/lookup`

**Access:** Any authenticated staff member; limited to 30 lookups per 15
minutes per user/IP.

**Input:** Strict JSON `{ customerCode, locationId }`; code is 1 to 512
characters and location is a branch UUID.

**Success:** `200` availability containing masked member, branch, rank,
programme year, allowance/used/remaining counts, active service type,
`canUse`, and any unavailable reason. No allowance is consumed.

**Errors:** `400` invalid code/branch; `401`/`403` access denied; `404` active
member not found; `429` rate limit; `503` Member Service unavailable.

### POST `/api/loyalty/walk-ins`

**Access:** Any authenticated staff member; limited to 30 consumes per 15
minutes per user/IP.

**Input:** Strict JSON `{ customerCode, locationId, idempotencyKey }`; location
and key are UUIDs.

**Success:** `200` with resulting Member Service usage and refreshed
availability. One eligible annual walk-in allowance is consumed.

**Errors:** `400` invalid code/branch; `401`/`403` access denied; `404` member
not found; `409` no current allowance/window or idempotency conflict; `429`
rate limit; `503` service unavailable.

## Scheduled bonuses and voucher lookup

### GET `/api/cron/loyalty/bonuses`

**Access:** Scheduler only, using the configured cron bearer authorization.

**Input:** No body or query. The server supplies the current ISO timestamp to
the scheduled-bonus database function.

**Success:** `200` with the database function result summarising due awards
processed at this run; database rules retain idempotency.

**Errors:** `401` invalid cron authorization; `500` scheduled processing
failed.

### POST `/api/pos/loyalty/vouchers/lookup`

**Access:** Authenticated staff; limited to 30 lookups per 15 minutes per
user/IP.

**Input:** Strict JSON `{ code }`; trimmed code length is 1 to 128 characters.

**Success:** `200` with POS-safe voucher details and current redemption
eligibility. The lookup does not redeem or reserve the voucher.

**Errors:** `400` invalid code; `401`/`403` access denied; `404` voucher not
found; `409` unusable/expired voucher; `429` rate limit; `503` POS unavailable.

## POS logos

### POST `/api/accounting/pos-configuration/logo`

**Access:** Authenticated Accounting access; limited to 20 uploads per hour per
user/IP.

**Input:** `multipart/form-data` with `file`; request limit is 5 MiB plus
multipart overhead. The file must pass image signature/content checks and
25-megapixel decode protection.

**Success:** `200` with `{ logoKey, logoUrl, storageProvider, originalBytes,
storedBytes, width, height, format: "webp" }`. The image is resized and
recompressed below 256 KiB, then stored in MinIO with R2 fallback.

**Errors:** `400` missing/invalid image; `401`/`403` Accounting access denied;
`413` request too large; `415` unsupported content; `422` optimized image still
too complex; `429` upload limit; `503` schema or storage unavailable.

### GET `/api/pos/logos/[logoKey]`

**Access:** Any authenticated staff session. Response remains private.

**Input:** Path must be a valid custom POS logo key. No query or body.

**Success:** `200` binary `image/webp` (maximum 256 KiB) with private immutable
cache, no-sniff, sandbox CSP, and no-referrer headers. MinIO is primary and R2
is fallback.

**Errors:** `400` invalid key; `401`/`403` access denied; `404` key is unused or
object missing; `415` stored object fails image checks; `502` storage read
failed.
