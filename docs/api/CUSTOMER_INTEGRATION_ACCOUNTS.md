# Customer Integration Account, Application, and Loyalty API

Last verified against source: September 28, 2026.

These are signed server-to-server contracts for the independent customer
portal. They expose customer-safe aliases and summaries only. Mutations require
integration idempotency and never accept staff credentials from the customer
application.

## Account lifecycle

### POST `/api/integrations/customer/v1/accounts/deactivate`

**Access:** Signed customer-portal integration plus an idempotency key.

**Input:** Strict JSON `{ customerSubject, customerCode }`; subject is a UUID
and code matches the issued `PYM-....-....-.` format.

**Success:** `200` integration envelope
`{ loyaltyAccountDeactivated: boolean }`; the matching mobile loyalty account
is deactivated without deleting historical finance or audit facts.

**Errors:** `400` invalid contract; `401`/`403` integration or idempotency
failure; `404`/`409` customer identity mismatch; `503` loyalty unavailable.

## Applications

### POST `/api/integrations/customer/v1/applications/lookup`

**Access:** Signed customer-portal integration. This guest lookup is
rate-limited and does not accept a staff session.

**Input:** Strict JSON `{ trackingNumber, surname, turnstileToken? }`;
tracking number is 4 to 80 safe text characters and surname is 1 to 100.

**Success:** `200` integration envelope `{ summary, guestGrant }` for exactly
one matching application. The 30-minute grant has `read` and
`request_link_otp` scopes; internal IDs and staff-only notes are omitted.

**Errors:** `400` invalid input; `401`/`403` integration failure; `404` no
unique match; `429` lookup limit; `503` application/grant service unavailable.

### POST `/api/integrations/customer/v1/applications/link/request-otp`

**Access:** Signed integration plus idempotency and a valid guest grant with
`request_link_otp` scope.

**Input:** Strict JSON `{ applicationId, guestGrant, customerSubject }`; IDs
are UUIDs and the grant is 40 to 2048 characters.

**Success:** `200` integration envelope with OTP challenge ID, masked recorded
email, expiry, and resend timing.

**Errors:** `400` invalid input; `401`/`403` integration/grant failure; `404`
application not found; `409` no verified email; `429` OTP limit; `503`
email/challenge service unavailable.

### POST `/api/integrations/customer/v1/applications/link/verify-otp`

**Access:** Signed customer-portal integration plus idempotency.

**Input:** Strict JSON `{ challengeId, otp, customerSubject, customerCode,
claimLoyalty? }`; IDs are UUIDs, OTP is 6 to 8 digits, and customer code is 8
to 40 characters.

**Success:** `200` integration envelope `{ application, accountGrant,
grantExpiresAt, loyaltyClaim }`. The saved application receives a one-year
read/notification grant; optional loyalty points are source-reconciled.

**Errors:** `400` invalid/exhausted OTP; `401`/`403` integration failure; `404`
challenge/application not found; `409` identity or idempotency conflict; `503`
grant, application, or loyalty service unavailable.

### DELETE `/api/integrations/customer/v1/applications/[applicationId]/unlink`

**Access:** Signed integration plus idempotency and an account grant bound to
the customer with application `read` scope.

**Input:** UUID `applicationId` path and strict JSON
`{ customerSubject, accountGrant }`.

**Success:** `200` integration envelope `{ unlinked: true, loyalty }`. Active
application grants are revoked and unreedeemed source points are removed while
redeemed FIFO points remain retained.

**Errors:** `400` invalid body; `401`/`403` integration or grant failure; `404`
application not found; `409` idempotency conflict; `503` source reconciliation
or grant revocation unavailable.

## Loyalty

### POST `/api/integrations/customer/v1/loyalty/onboarding`

**Access:** Signed customer-portal integration plus idempotency.

**Input:** Strict JSON `{ customerSubject, customerCode, email,
birthdayRewardMonth, birthdayRewardDay, referralCode, accountCreatedAt }`.
Birthday month/day must both be null or both supplied; referral code is
`PREF-[A-F0-9]{16}` or null; timestamp includes an offset.

**Success:** `200` integration envelope `{ referralCode, referral, welcome }`
describing the member's referral code and any idempotently applied referral or
welcome awards.

**Errors:** `400` invalid contract; `401`/`403` integration failure; `404` bad
referral; `409` subject/code/email identity conflict; `503` loyalty unavailable.

### POST `/api/integrations/customer/v1/loyalty/referrals/validate`

**Access:** Signed customer-portal integration.

**Input:** Strict JSON `{ referralCode }` matching `PREF-[A-F0-9]{16}`.

**Success:** `200` integration envelope with `{ valid: false }` or a valid
referral summary containing customer-safe referrer display data.

**Errors:** `400` invalid code format; `401`/`403` invalid integration; `503`
loyalty lookup unavailable.

### POST `/api/integrations/customer/v1/loyalty/summary`

**Access:** Signed customer-portal integration.

**Input:** Strict JSON `{ customerSubject, customerCode, email,
birthdayRewardMonth?, birthdayRewardDay? }`; subject is a UUID and birthday
parts are nullable integers in calendar ranges.

**Success:** `200` integration envelope with current balance/rank, entries,
rewards, referral state, birthday preference, and programme presentation data.

**Errors:** `400` invalid contract; `401`/`403` integration failure; `404` or
`409` identity mismatch; `503` loyalty programme unavailable.

### POST `/api/integrations/customer/v1/loyalty/vouchers/issue`

**Access:** Signed customer-portal integration plus idempotency.

**Input:** Strict JSON `{ customerSubject, customerCode, email, pointsCost,
idempotencyKey }`; points cost is 1 to 1,000,000 and the body key is a UUID.

**Success:** `201` integration envelope with issued voucher code, value,
points cost, issue/expiry times, and updated available points.

**Errors:** `400` invalid contract or inactive reward; `401`/`403` integration
or identity failure; `409` insufficient points/idempotency conflict; `503`
loyalty or voucher service unavailable.
