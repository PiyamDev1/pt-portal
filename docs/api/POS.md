# POS API

The POS surface is private staff infrastructure. Every route derives the employee and branch from the
active staff session, returns non-cacheable data, and keeps all new write operations unavailable until
database capability `2026090901` is installed. Mutation routes use strict bounded JSON, rate limits,
server-generated accounting effects, and retry-safe idempotency keys where applicable.

### GET `/api/pos/bootstrap`

**Access:** Any active staff member assigned to a branch.

**Input:** No body or query parameters.

**Success:** `200` with branch/till context, the hierarchical category/service catalogue, supplier
assignments, pricing options, active shift,
expected drawer/reserve balances, configured suppliers, staff options, closeouts, permissions, and the
POS schema capability state. Before migration, the payload is read-only and `schemaReady` is false.

**Errors:** `401`/`403` for session or branch access failure; `500` for an unexpected private data load
failure.

### GET `/api/pos/ledger`

**Access:** Any active staff member; results are scoped to the employee's branch.

**Input:** Required ISO `date`; optional `period=day|month`, bounded `search`, category, payment,
direction, outgoing type, status, supplier/till/shift/agent UUIDs, source type, loyalty state, amount
range, and opaque cursor. Duplicate or unknown parameters are rejected.

**Success:** `200` with a bounded ledger page, derived totals, active filter context, and next cursor.
Before the POS capability is available, it returns the legacy branch ledger as read-only data.

**Errors:** `400` for invalid filters; `401`/`403` for access failure; `500` for a private load failure.

### POST `/api/pos/transactions`

**Access:** Any active branch employee with POS posting access.

**Input:** A strict transaction containing active shift UUID, category and service keys, explicit action,
positive total and direction, customer snapshot, up to four tenders, and optional typed source, pricing
confirmation, assigned supplier movement, loyalty code, or LMS payment mapping. Requires `Idempotency-Key`.

**Success:** `201` for a new atomic post or `200` for an idempotent replay, with POS reference, totals,
remaining source-owned balance, loyalty award, and supplier balance where relevant.

**Errors:** `400` for invalid accounting/source/tender data; `401`/`403` for access failure; `404` for a
missing controlled source; `409` for duplicate/idempotency conflict; `503` when the POS schema is not
ready; `429` for rate limiting.

### POST `/api/pos/refunds`

**Access:** Active branch employees for ordinary linked refunds. Managers with fresh second-factor
verification are required for general refunds, refunds of at least GBP 500, closed-shift refunds, and
loyalty exceptions.

**Input:** Strict linked or general refund with shift, amount, one to four tenders, reason and note.
Linked refunds include the original transaction UUID; general refunds include original evidence and
approval evidence. Requires `Idempotency-Key`.

**Success:** `201` for a new atomic refund or `200` for an idempotent replay, including refund reference,
remaining refundable amount, reconciliation state, and proportional loyalty reversal.

**Errors:** `400` for invalid evidence/tenders; `401`/`403` for access or verification failure; `404` for
a missing original; `409` when already refunded or the retry conflicts; `503` when POS is unavailable;
`429` for rate limiting.

### POST `/api/pos/shifts`

**Access:** Active branch employees may open and count/close their branch till. Only a different
authorised manager with fresh second-factor verification may approve a closeout.

**Input:** Strict discriminated `OPEN`, `CLOSE`, or `APPROVE` JSON. Opening includes till and float;
closing includes drawer/reserve counts and denominations; approval includes closeout UUID and 2FA.
Requires `Idempotency-Key`.

**Success:** `200` with the retry-safe shift or closeout mutation result.

**Errors:** `400` for invalid counts/action; `401`/`403` for access, verification, or separation-of-duty
failure; `409` for conflicting state/retry; `503` when POS is unavailable; `429` for rate limiting.

### POST `/api/pos/cash-movements`

**Access:** Active branch employees may transfer denomination-counted coins between drawer and reserve.
Deposits, withdrawals, and corrections require a manager and fresh second-factor verification.

**Input:** Strict shift UUID, movement type, positive amount, optional correction direction,
denominations, and reason. Requires `Idempotency-Key`.

**Success:** `201` with the cash movement reference and updated expected drawer/reserve balances.

**Errors:** `400` for invalid amount/denominations; `401`/`403` for access or verification failure; `409`
for a retry conflict; `503` when POS is unavailable; `429` for rate limiting.

### GET `/api/pos/suppliers`

**Access:** Any active branch employee.

**Input:** Optional configured supplier UUID.

**Success:** `200` with branch supplier balances and a bounded newest-first movement ledger including
derived running balances.

**Errors:** `400` for an invalid UUID; `401`/`403` for access failure; `500` for a private load failure.

### GET `/api/accounting/pos-configuration`

**Access:** Accounts/Accounting department staff and portal administrators only.

**Input:** No body or query parameters.

**Success:** Returns active and inactive categories, services, suppliers, and assignments for management.

**Errors:** `401`/`403` for access failure; `500` for a private configuration load failure.

### POST `/api/accounting/pos-configuration`

**Access:** Accounts/Accounting department staff and portal administrators only.

**Input:** One strict idempotent category, service, supplier, or category-assignment mutation. Requires
`Idempotency-Key`.

**Success:** Returns the audited configuration entity and action. Stable keys are not renamed, and
referenced rows are deactivated.

**Errors:** `400` for invalid configuration; `401`/`403` for access failure; `409` for an idempotency
conflict; `503` when the capability is unavailable; `429` for rate limiting.

### POST `/api/pos/corrections`

**Access:** Managers with fresh second-factor verification.

**Input:** Strict active shift UUID, original expense transaction UUID, and an audit reason of at least
10 characters. Requires `Idempotency-Key`.

**Success:** `201` with the append-only reversing transaction and original reference.

**Errors:** `400` for invalid or ineligible correction data; `401`/`403` for access or verification
failure; `404` for a missing expense; `409` for an existing correction/retry conflict; `503` when POS is
unavailable; `429` for rate limiting.

### POST `/api/pos/reconciliation`

**Access:** Any active branch employee; the database verifies the tender belongs to that branch.

**Input:** Exactly one transaction-tender or refund-tender UUID, reconciliation status, and optional
external reference/note. Requires `Idempotency-Key`.

**Success:** `201` with the append-only reconciliation event and resulting status.

**Errors:** `400` for an invalid target/state; `401`/`403` for access failure; `404` for a missing tender;
`409` for a retry conflict; `503` when POS is unavailable; `429` for rate limiting.

### GET `/api/pos/reports`

**Access:** Any active branch employee; report scope is server-derived from the employee's branch.

**Input:** Required ISO `date` and optional `period=day|month`.

**Success:** `200` with period totals, drawer/reserve/closeout results, category, payment and agent
breakdowns, suppliers, and unresolved card/bank tenders.

**Errors:** `400` for an invalid period; `401`/`403` for access failure; `500` for a private load failure.

### POST `/api/pos/loyalty/lookup`

**Access:** Any active branch employee.

**Input:** Strict JSON containing one bounded canonical loyalty `code`. The raw code is not logged.

**Success:** `200` with the active member's masked code/email, display name, and available points.

**Errors:** `400` for an invalid code; `401`/`403` for access failure; `404` when no active member exists;
`429` for rate limiting.

### POST `/api/pos/import`

**Access:** Managers only. Commit mode additionally requires fresh second-factor verification.

**Input:** Strict `DRY_RUN` or `COMMIT` request with 1-500 bounded historical rows. Each row has stable
legacy source/key, original date, catalogue key, direction, amount and payment method. Maximum body is
2 MiB.

**Success:** `200` dry-run preview with importable/duplicate counts, or `201` with retry-safe import
results. Imported entries do not move the current drawer or award loyalty points.

**Errors:** `400` for invalid rows; `401`/`403` for access or verification failure; `503` when POS is
unavailable; `429` for rate limiting.

### GET `/api/pos/transactions/[transactionId]/receipt`

**Access:** Any active branch employee; the transaction must belong to the employee's branch.

**Input:** Transaction UUID and optional `format=json|text`; omitted format returns printable HTML.

**Success:** `200` with a private JSON receipt, downloadable plain-text receipt, or escaped printable
HTML receipt containing tenders, source links, agent, service, totals and loyalty result.

**Errors:** `400` for an invalid UUID; `401`/`403` for access failure; `404` for a missing or cross-branch
transaction; `500` for an unexpected private load failure.
