# Ticketing API

Ticketing operational tables are server-route-only. Every route verifies the staff session and
derives the immutable acting employee on the server before using the service-role client. Regular
staff and Managers receive owner-only ledger records. Maintenance Admin, Admin, Master Admin, and
Super Admin receive
the bounded latest team records so they can discover and correct attribution; this is not an
unbounded export contract.

### GET `/api/ticketing/ledger`

**Access:** Active staff who either belong to the Ticketing department or hold Manager, Maintenance
Admin, Admin, Master Admin, or Super Admin. Staff and Managers receive transactions they own.
Maintenance Admin, Admin, Master Admin, and Super Admin receive the latest team transactions,
still bounded by the same `limit` contract.

**Input:** Optional query parameter `limit`; integers are clamped to `1`–`100` and default to `50`.
No employee or owner selector is accepted.

**Success:** `200` JSON with `items`, active `airlines`, and branch `context`. Each item contains the
booking/transaction IDs, PNR, customer, airline, TK/DC/R-ER service type, operational/payment state,
dates, passenger count, ticket-supplier snapshot, package-match state, grouped supplier/sale inputs,
optimistic booking and
transaction versions, a derived `detailsStatus` (`needs_details` or `complete`), and creation
timestamp. DC/R-ER rows instead use `recorded` because this first slice captures an aggregate
financial service movement rather than TK passenger/itinerary completion. Every row also contains
the current `responsibleEmployee`, ordered `assistantEmployees`, and `attributionVersion`. Context
contains the authenticated `employeeId`, `canManageAttribution`, and active employee options only
for Maintenance Admin/Admin/Master Admin/Super Admin; other callers receive an empty option list.
`canArchiveRecords` remains false for Maintenance Admin, so deletion stays in the Admin approval
path. It contains no calculated commission, earnings, margin, or profit.

The bounded team ledger lets a Maintenance Admin, Admin, Master Admin, or Super Admin open one
non-owned root TK for
the audited completion workflow below. Managers and regular Ticketing staff remain owner-only.
DC/R-ER entry and the other payment mutations are not broadened by this collection response.

**Errors:** `401` for no valid staff session; `403` for inactive or unauthorized staff; `503` when
the required Ticketing database capability is not installed; `500` when the private ledger,
airline directory, or branch context cannot be loaded.

### POST `/api/ticketing/ledger`

**Access:** Same Ticketing access predicate as `GET`. The server passes the authenticated acting
employee ID to one service-role-only atomic database function. Maintenance Admin, Admin, Master
Admin, and Super Admin may select operational attribution; Manager and regular staff are fixed to themselves with no
assistants. The database repeats the active-role/employee checks.

**Input:** JSON for the first-release TK quick entry: `customerName`, `pnr`, `airlineId`,
`supplierCode` (`sabre_polani`, `amadeus_piyam`, `sabre_bt`, `ptap`, or `airline`),
`serviceType: "TK"`, `operationalStatus` (`held` or `issued`), `bookingDate`, branch-local
`timeLimitAt` for Held or date-only `issuedAt` for Issued, `currency: "GBP"`, one to four unique
`fares` (`passengerType` ADT/YTH/CHD/INF, positive integer `quantity`, non-negative
`unitSupplierCost`, and pricing fields), and optional `confirmDuplicate`. Standalone Issued fares
require `unitSalePrice` and `unitDiscount` (send zero when no discount applies). For an exact
package-reservation PNR match, omit every sale/discount value: the database uses the accepted
quotation's passenger-level flight prices and ignores client-supplied sale values. A newly Held
booking also omits both pricing values because its sale price is not final. All fare groups must be
priced or omitted together.

Maintenance and Admin callers may also provide `responsibleEmployeeId`, up to ten unique
`assistantEmployeeIds` that exclude the responsible employee, and nullable `attributionReason`.
The responsible employee defaults to the authenticated actor. A non-empty reason is required when
the responsible employee differs or assistants are present. A non-empty `Idempotency-Key` header of
at most 200 characters is required. The body is limited to 16 KiB. This collection operation remains
TK-only; DC/R-ER movements use the existing-PNR endpoints below so the server can bind them to the
issued root TK.

**Success:** `201` for a new atomic save or `200` for an identical idempotent replay. The JSON DTO
identifies the booking and transaction and returns the operational/payment state, passenger count,
package-match state, and `idempotentReplay`; it contains no calculated earnings or profit. PNR-based
package matching, the server-derived supplier name, immutable initial attribution/audit history,
and an issuance source event are handled inside the same transaction. The source event attributes
issued-ticket target units to the
responsible employee and records every assistant with zero target units. This assistant list belongs
only to the root TK sale and is not inherited by later DC/R-ER rows.

**Errors:** `400` for malformed/oversized details, missing retry key, invalid airline/date/fare, or
unsupported fields; `401`/`403` for access failures; `409` with `code: "DUPLICATE_TK"` and bounded
existing-record context when an airline/PNR needs explicit confirmation; `409` with
`code: "IDEMPOTENCY_CONFLICT"` when a retry key is reused with different details; `429` when the
mutation rate limit is exceeded; `503` when the required Ticketing database capability is not
installed; `500` for an unexpected atomic-save failure.

### PATCH `/api/ticketing/ledger/[bookingId]/attribution`

**Access:** Maintenance Admin, Admin, Master Admin, and Super Admin only, after the normal Ticketing
access check. Manager and regular Ticketing staff receive `403`. The authenticated employee is
always the correction actor and cannot be supplied in the body.

**Input:** A strict JSON body no larger than 16 KiB containing positive
`expectedBookingVersion`, active `responsibleEmployeeId`, zero to ten unique active
`assistantEmployeeIds` excluding the responsible employee, and a trimmed `reason` of 1–500
characters. A 1–200 character `Idempotency-Key` header is required.

**Success:** `200` with `bookingId`, advanced `bookingVersion`, current `responsibleEmployee`,
`assistantEmployees`, advanced `attributionVersion`, and `idempotentReplay`. The atomic operation
aligns booking and transaction ownership, appends immutable attribution/audit history, and, when an
issued source fact exists, appends the next event version superseding its predecessor. The original
entry actor never changes. Only the responsible employee receives issued-ticket target units;
assistants receive zero. No commission rate, calculated amount, margin, or profit is returned.

**Errors:** `400` for malformed data, inactive/invalid recipient selections, or a missing retry key;
`401`/`403` for access failures; `404` for an invalid/missing booking; `409` with
`VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, or `ATTRIBUTION_NO_CHANGE`; `429` when rate limited; `503` when capability
`2026082402` is absent; `500` for an invalid or failed atomic result.

### GET `/api/ticketing/ledger/[bookingId]`

**Access:** Same Ticketing access predicate as the ledger collection. Regular Ticketing staff and
Managers remain owner-only. Maintenance Admin, Admin, Master Admin, and Super Admin may load one non-archived root TK
owned by another employee from the bounded team workflow. The server derives the viewer and owner;
no employee selector is accepted. For an owner-only caller, another employee's UUID and a
nonexistent UUID return the same `404` response.

**Input:** `bookingId` is a UUID path segment. No owner or employee selector is accepted.

**Success:** `200` JSON with `detail` and `completionContext`. The detail contains
booking/transaction IDs and versions, PNR, customer contact, journey dates, lifecycle/payment state,
branch-local paid date, airline, derived details status, grouped supplier/sale fares, passenger
slots, and the DB-derived `responsibleEmployee`. A missing slot is synthesized from the authoritative
ADT/CHD/INF quantities; the first missing ADT may be prefilled in the response with the lead customer
name, but it does not count as persisted completion until it is saved. `completionContext` contains
the owner employee, whether the caller is acting on behalf, and whether a reason is required. A
blank stored employee name uses the stable `Staff member` display fallback. The response is
`private, no-store` and contains no calculated commission, earnings, margin, or profit.

**Errors:** `401` for no valid staff session; `403` for inactive or unauthorized staff; `404` for an
invalid, missing, archived, non-root-TK, or inaccessible record; `503` when capability `2026082403`
is absent; `500` when the private detail cannot be loaded.

### PATCH `/api/ticketing/ledger/[bookingId]`

**Access:** The owner may complete their own root TK. Maintenance Admin, Admin, Master Admin, and
Super Admin may also complete a non-owned root TK through the audited on-behalf path. Managers and regular Ticketing
staff remain owner-only. The verified employee ID is passed to one service-role-only atomic database
operation; caller-supplied actor or owner fields are rejected. The database locks and re-derives the
current owner/primary attribution and repeats the role and reason checks.

**Input:** A JSON body no larger than 64 KiB containing `expectedBookingVersion`,
`expectedTransactionVersion`, nullable `contactPhone`, nullable `departureDate`/`returnDate`,
`paymentStatus` (`unpaid` or `paid`), nullable branch-local `paidAt` (`YYYY-MM-DD`), one entry for
each grouped `fareSales` type with nullable `unitSalePrice`, and bounded passenger slot updates keyed
by `passengerType` plus one-based `position`. Passenger name, contact, date of birth, and ticket
number are nullable. `onBehalfReason` is nullable and trimmed to 1–500 characters when supplied. It
is required when the verified actor differs from the DB-derived owner and must be `null` for a fresh
self-completion. Existing owner clients may omit it and receive the `null` default. The API forwards
the parsed value unchanged so an identical retry remains identical even if ownership changes after
a committed write; the database checks idempotency before applying current owner/reason rules. No
actor, owner, responsible-employee, audit, or source-event field is accepted. An `Idempotency-Key`
header of 1–200 characters is required.

Partial non-financial completion is allowed. A paid transition requires every grouped sale value
and a paid date and cannot be moved backwards. For an Issued transaction, every still-missing sale
value must be supplied together; a posted non-null sale value is locked and requires the later
audited correction workflow. Existing Part Paid records are read-only in this completion workflow
because no amount-paid model has been introduced.

**Success:** `200` JSON containing the reloaded `detail`, `completionContext`, `changed`, and
`idempotentReplay`. An identical no-op creates no audit or Commission source fact. A real change
advances both optimistic versions and writes one redacted audit event. For an on-behalf change, the
audit retains the real administrator actor, DB-derived owner, and required reason. Completing Issued
sale values emits the separate variable-only `ticket_sale_completed` fact; moving Unpaid to Paid
emits `ticket_paid`. Those source envelopes remain attributed to the current responsible owner while
retaining the administrator as the acting employee fact. Ticketing does not calculate an earning or
profit.

**Errors:** `400` for malformed/oversized data, invalid dates/slot/fare values, a missing retry key,
`ON_BEHALF_REASON_REQUIRED` when an administrator omits the required reason, or
`ON_BEHALF_REASON_NOT_ALLOWED` for a fresh self-completion carrying a reason; `401`/`403` for access
failures; `404` for an invalid or inaccessible record; `409` with `VERSION_CONFLICT`,
`IDEMPOTENCY_CONFLICT`, or `CORRECTION_REQUIRED`; `429` when rate limited; `503` when capability
`2026082403` is absent; `500` for an unexpected atomic-save/reload failure.

For a posted ticket, regular staff cannot change an existing non-null sale price and receive
`AMENDMENT_REQUEST_REQUIRED`. Maintenance Admin, Admin, Master Admin, and Super Admin may submit corrected grouped
sale values through this same route. The server first runs the capability `2026082802` admin-only,
optimistic, idempotent correction operation, appends redacted audit history and a superseding
Commission source fact, then applies the remaining detail update. The admin correction still does
not calculate or return commission/profit.

### POST `/api/ticketing/ledger/[bookingId]/requests`

**Access:** The responsible employee requests a change to their active booking. Admin roles may
also request for an accessible team booking; the database repeats owner/admin checks.

**Input:** Strict 4 KiB JSON with `requestType` (`amendment` or `deletion`) and `notes`. Amendment
notes are required and limited to 1,000 characters. Deletion always stores `null` notes and asks for
no reason. One pending request of each type is allowed per booking; a repeated request returns the
existing pending request.

**Success:** `201` with the request ID/state, or `200` for the existing pending request.

**Errors:** Malformed input is `400`; inaccessible records are `404`; schema absence is `503`.

### GET `/api/ticketing/requests`

**Access:** Admin, Master Admin, and Super Admin only.

**Input:** No query parameters or request body.

**Success:** `200 private, no-store` with up to 100 oldest pending amendment/deletion requests,
including operational booking/requester context but no commission/profit output.

**Errors:** `401`/`403` for access failures; `503` when capability `2026082802` is absent; `500` if
the pending queue cannot be loaded.

### PATCH `/api/ticketing/requests/[requestId]`

**Access:** Admin roles only.

**Input:** The request ID is a UUID path segment. Strict JSON selects `fulfilled` or `rejected`. The
administrator cannot use this review endpoint to mutate the ticket itself; correction/archive
remains a separate audited action.

**Success:** `200` with the reviewed request state. Repeating the same completed review is safe.

**Errors:** `400` for invalid input; `401`/`403` for access failures; `404` when the request does not
exist; `503` when capability `2026082802` is absent; `500` for a failed review.

### DELETE `/api/ticketing/ledger/[bookingId]/archive`

**Access:** Admin, Master Admin, and Super Admin only. The request is limited to five attempts per
15 minutes and must pass the shared fresh second-factor verifier.

**Input:** Strict 4 KiB JSON with `verificationCode` (authenticator code or backup code) and
`verificationMethod: "auto"`. No reason is accepted. The database independently checks the active
administrator role.

**Success:** `200` after soft-archiving the booking, fulfilling any pending deletion request, and
superseding its Ticketing Commission facts with archived/zero-target variables. Posted financial
history is retained; no hard delete occurs.

**Errors:** `400` for malformed input; `401`/`403` for session, role, or fresh-auth failure; `404`
for an unavailable booking; `429` when rate limited; `503` for missing limiter/schema capability;
`500` for an unexpected archive failure.

### GET `/api/ticketing/bookings`

**Access:** Same Ticketing access predicate and own-only rule as My Sales Ledger. Managers and
other oversight roles do not receive another agent's matches through this endpoint.

**Input:** Exactly one `pnr` query value. It is trimmed, uppercased, stripped of spaces, and matched
exactly against the normalized PNR. An optional opaque `cursor` continues the same bounded keyset
search. No broad search, owner selector, offset, or money field is accepted.

**Success:** `200` JSON with `items`, `hasMore`, and nullable `nextCursor`. Each page contains at most
ten eligible Issued root-TK matches from the authenticated employee's active ledger, ordered by
latest update and stable booking ID. Every continuation repeats the same exact-PNR and owner
filters, so all matches remain reachable without a silent cutoff. Each option contains booking/root
IDs and optimistic versions, customer and contact, airline, journey dates, the root TK booking
date, package-match status, and the root ADT/CHD/INF quantities. The root booking date, journey,
passenger mix, and stable record suffix let the agent distinguish otherwise identical PNR matches.
It contains no supplier/sale money, calculated commission, earnings, margin, or profit.

**Errors:** `400` for missing, repeated, malformed, or extra query values, including
`INVALID_LOOKUP_CURSOR`; `401`/`403` for access failures; `429` when rate limited; `503` when
capability `2026082304` is absent; `500` when an eligible booking cannot be mapped safely.

### POST `/api/ticketing/bookings/[bookingId]/transactions`

**Access:** Same own-only rule as the PNR lookup. The server passes the verified employee and
selected booking to one service-role-only atomic operation. Another employee's booking and a
missing booking use the same `404` response.

**Input:** A JSON body no larger than 16 KiB containing `expectedBookingVersion`,
`expectedRootTransactionVersion`, `serviceType` (`DC` or `R-ER`), branch-local `bookingDate` and
`issuedAt`, `paymentStatus` (`unpaid` or `paid`) with paired nullable `paidAt`, `currency: "GBP"`,
and one to three unique affected ADT/CHD/INF fare groups. Each group provides a positive affected
quantity, full unit supplier service cost, and full unit customer charge. Quantities cannot exceed
the matching root-TK groups or 99 affected tickets in total. A 1–200 character `Idempotency-Key`
header is required.

This first slice records an aggregate issued financial service movement. It does not claim a new
itinerary, exact passenger allocation, or component split between fare difference and airline fee.
DC attaches to the immutable root TK. R-ER also supersedes the latest issued R-ER, or the root TK
when it is the first reissue. Booking/root lifecycle, payment, and financial facts stay unchanged.

**Success:** `201` for a new save or `200` for an identical replay. The redacted DTO contains IDs,
versions, service/payment state, affected count, package-match status, and replay state—never money,
commission, or profit. Before returning it, the route verifies the immutable branch-local booking,
issue, and payment facts supplied by capability `2026082304`. The same database transaction appends
`ticket_date_changed` or `ticket_reissued`; a Paid-at-create movement also appends a separate
`ticket_paid` fact. These service event types do not inflate the default issued-TK target.

**Errors:** `400` for malformed/oversized data, invalid dates/money/quantities, an
`AFFECTED_QUANTITY_EXCEEDED`, a `SERVICE_DATE_BEFORE_ROOT`, or an
`REISSUE_DATE_BEFORE_PREDECESSOR`; `401`/`403` for access failures; `404` for an invalid/non-owned
record; `409` with `VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, or `CORRECTION_REQUIRED`; `429` when
rate limited; `503` when capability `2026082304` is absent; `500` for an invalid or failed atomic
result.

### PATCH `/api/ticketing/bookings/[bookingId]/transactions/[transactionId]`

**Access:** Own-only Ticketing access. Both UUIDs must identify an issued DC/R-ER child of the
authenticated employee's issued root TK.

**Input:** A JSON body no larger than 8 KiB with `expectedBookingVersion`,
`expectedTransactionVersion`, and branch-local `paidAt`. A 1–200 character `Idempotency-Key` header
is required. This operation does not accept an amount because the first service slice records only
the full Paid/Unpaid state.

**Success:** `200` with advanced booking/transaction versions for a real Unpaid-to-Paid transition,
or unchanged versions for a safe same-date no-op. The redacted DTO includes service type, paid date,
affected count, `changed`, and `idempotentReplay`; it includes no money, Commission output, or
profit. The route verifies the stored branch-local booking, issue, and paid dates before returning
the result. A real transition appends one `ticket_paid` source fact and audit event without changing
the booking or root-TK payment state.

**Errors:** `400` for malformed/oversized data or a paid date before the service booking date;
`401`/`403` for access failures; `404` for invalid/non-owned lineage; `409` with
`VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, or `CORRECTION_REQUIRED`; `429` when rate limited;
`503` when capability `2026082304` is absent; `500` for an invalid or failed atomic result.

### GET `/api/ticketing/fare-adjustments`

**Access:** Active staff who either belong to the Ticketing department or hold Manager, Admin,
Master Admin, or Super Admin. Unlike My Sales Ledger, this is an intentionally shared operational
queue: eligible issued root-TK records from every agent may be returned. Maintenance Admin has no
role-based bypass.

**Input:** Optional strict query values are exact normalized `pnr`, exact two-character `airline`
IATA code, `owner` employee UUID, inclusive `departureFrom`/`departureTo` dates, `limit` from
`1`–`100` (default `50`), and an opaque `cursor`. A cursor is bound to the normalized filter set and
cannot be reused after changing a filter. Repeated, unknown, malformed, or contradictory values are
rejected rather than ignored.

**Success:** `200` JSON with `items`, complete eligible-ticket-owner `filterOptions`, `hasMore`, and
nullable `nextCursor`, ordered by latest booking
update and stable booking ID. Eligible rows are active Issued GBP root TKs with a normalized PNR,
positive passenger count, and complete equal source/GBP supplier totals. Each item contains
booking/root IDs and optimistic versions, PNR, airline, ticket owner, branch-local issue date,
journey dates, passenger count, initial/current whole-PNR supplier fare, package-match status, and
the latest immutable adjustment and latest no-change check when they exist. The latest adjustment contains its lineage ID,
sequence, original/new supplier fares, signed difference, acting employee ID, effective date, and
creation time. Customer/contact fields, sale values, commission scope or amount, earnings, margin,
markup, and profit are never returned.

**Errors:** `400` for invalid filters or a cursor/filter mismatch; `401`/`403` for access failures;
`429` when rate limited; `503` when capability `2026082904` is absent; `500` when the eligible queue
or latest-tail projection cannot be mapped safely.

### POST `/api/ticketing/fare-adjustments`

**Access:** Same shared Ticketing access predicate as `GET`. Any authorised active Ticketing staff
member may append to an eligible ticket owned by another agent. The API derives the acting employee
from the verified session; caller-supplied actor, owner, location, original fare, difference,
package scope, source-event, or audit fields are rejected.

**Input:** A strict JSON body no larger than 16 KiB containing `bookingId`,
`expectedBookingVersion`, `expectedRootTransactionVersion`, nullable
`expectedPreviousAdjustmentId`, positive two-decimal `newSupplierFareGbp` no greater than
`99999999.99`, `effectiveDate`, nullable trimmed `notes` up to 1,000 characters, and
`currency: "GBP"`. A 1–200 character `Idempotency-Key` header is required. This route records
one changed whole-PNR supplier fare; it does not allocate a partial-passenger adjustment, mutate the
root TK, create an R-ER, or support non-GBP settlement. The date
cannot predate the root ticket issue date or the current adjustment tail.

**Success:** `201` for a new append or `200` for an identical replay. The response contains the
advanced booking version, unchanged root version, adjustment lineage, initial/new supplier fare,
signed GBP difference (`original - new`), passenger count, effective date, package-match status,
creation time, and replay state. One database transaction serializes the booking and package scope,
snapshots the current fare and owner/package variables, appends immutable adjustment/audit history,
and emits `ticket_low_fare_adjusted` for a positive difference or
`ticket_higher_fare_adjusted` for a negative difference. The Commission module receives the
authenticated acting agent, equal source/GBP fare facts, root lifecycle, and ownership/package
variables but remains solely responsible for credit/debit/no-entry policy. Neither event counts
toward issued-TK targets, and the public response contains no commission or profit output.

**Errors:** `400` for malformed/oversized input, invalid money/date, `DATE_CONFLICT`,
`ZERO_FARE_DIFFERENCE`, or a missing retry key; `401`/`403` for access failures; `404` when the
ticket is unavailable; `409` with `VERSION_CONFLICT`, `LINEAGE_CONFLICT`,
`IDEMPOTENCY_CONFLICT`, or `CORRECTION_REQUIRED`; `429` when rate limited; `503` when capability
`2026082904` is absent; `500` for an invalid or failed atomic result.

### POST `/api/ticketing/fare-checks`

**Access:** The same shared Ticketing access boundary as Low Fare adjustments. The acting employee
is derived from the verified session.

**Input:** Strict JSON up to 16 KiB with booking/root optimistic versions, nullable current
adjustment ID, effective date, and optional notes. An 8–200 character `Idempotency-Key` is required.

**Success:** `201` for a new append or `200` for an identical retry. The append-only observation
snapshots the current whole-PNR GBP supplier fare and current package scope, appears as “last
checked” in the queue, and creates audit evidence. It does not change the active fare and does not
create a Commission source event or target unit.

**Errors:** `400` for malformed input/date; `401`/`403` for access failures; `404` for an unavailable
ticket; `409` for stale versions, changed fare lineage, or idempotency-key reuse; `429` when rate
limited; `503` until capability `2026082904` is installed; `500` for an invalid atomic result.

### GET `/api/ticketing/refunds`

**Access:** Agents list and create refunds for their own issued passenger tickets. Admin, Master
Admin, and Super Admin can view the team register and save an audited override when the proposed
settlement would create an avoidable loss or reduce the desired company result.

**Input:** Optional bounded exact PNR/status filtering and opaque pagination cursor.

**Success:** `200 private, no-store` with the authorised own/team refund register, current status,
expected values, actual settlements, nullable final company result, and management context.

**Errors:** `400` for invalid filters; `401`/`403` for access failures; `503` until capability
`2026082903` is installed; `500` when the register cannot be loaded safely.

### POST `/api/ticketing/refunds`

**Access:** Agents save their own issued passenger refunds. Admin, Master Admin, and Super Admin
may cover another owner and use the audited override boundary.

**Input:** Strict JSON plus an idempotency key. It accepts the exact
ADT/YTH/CHD/INF passenger slot, refund-versus-replacement choice, cancellation and supplier costs,
temporarily manual retained-agent-commission input, desired markup, and either manual replacement
costs or an exact existing ledger passenger.

**Success:** `201` for a new snapshot or `200` for an identical retry. It saves the integer-penny
formula inputs/results, current package scope, and loss-prevention assessment atomically.

**Errors:** `400` for invalid values/selections; `401`/`403` for access failures; `404` for an
unavailable passenger ticket; `409` for duplicate, stale, or override-required input; `429` when
rate limited; `503` until capability `2026082903` is installed; `500` for atomic failure.

### POST `/api/ticketing/refunds/[refundId]/events`

**Access:** Admin, Master Admin, and Super Admin. Optimistic version and idempotency controls apply.

**Input:** Strict event type/date, expected version, event-specific amount/reference/notes, required
closure/void reason, and an 8–200 character idempotency key.

**Success:** Appends customer settlement, airline recovery, other actual cost, recovery-final,
closure, or void evidence. Actual company result remains `null` until recovery is final, then is
derived from actual settlement/recovery/cost rows rather than the original estimate.

**Errors:** `400` for invalid event combinations; `401`/`403` for access failures; `404` when the
refund is unavailable; `409` for stale or duplicate input; `429` when rate limited; `503` until
capability `2026082903` is installed; `500` for atomic failure.

### GET `/api/ticketing/vouchers`

**Access:** Active Ticketing staff see vouchers they own or are assigned to follow up. Admin,
Master Admin, and Super Admin see the bounded team register. Manager access remains limited to
owned/assigned voucher rows; Maintenance Admin has no Ticketing role bypass.

**Input:** Optional strict exact `pnr`, exact voucher `status`, `limit` from `1`–`100` (default
`50`), and an opaque keyset `cursor`. The cursor is bound to the normalized PNR/status filters.
Repeated, unknown, malformed, or cross-filter values are rejected.

**Success:** `200 private, no-store` with `items` ordered by claim-by date and stable voucher ID,
plus nullable `nextCursor`. Each item contains the source booking/PNR/passenger ticket, airline,
ticket owner, follow-up owner, issue/cancellation/claim dates, operational status, nullable
airline-confirmed/remaining GBP value, reference, notes, version, and creation time. Initial value is
`null`, not zero, until the airline confirms it. No customer contact, sale price, supplier cost,
profit, or commission amount is returned.

**Errors:** `400` for invalid filters or a cursor/filter mismatch; `401`/`403` for access failures;
`503` until capability `2026082903` is installed; `500` when rows cannot be loaded or mapped safely.

### POST `/api/ticketing/vouchers`

**Access:** The responsible owner may create a voucher for their own issued root TK. Admin, Master
Admin, and Super Admin may create it on behalf of another owner and assign another active follow-up
employee. The database rechecks ownership and administrator status; the authenticated actor is
never accepted from the request body.

**Input:** Strict JSON no larger than 16 KiB containing `bookingId`, `passengerType`
(`ADT`/`YTH`/`CHD`/`INF`), stable `passengerPosition`, `cancellationDate`, nullable
`followUpEmployeeId`, nullable `claimByDate`, nullable airline/supplier reference up to 120
characters, and nullable notes up to 2,000 characters. A retry-safe `Idempotency-Key` from 8–200
characters is required. The database resolves the exact issued passenger allocation and requires
its ticket number. The cancellation date cannot precede issue or be in the future. Claim-by
defaults to issue date plus 11 calendar months; only an administrator may submit a different date.
Monetary voucher value is deliberately not accepted.

**Success:** `201 private, no-store` with voucher/booking ID, `unclaimed` status, effective claim-by
date, and replay state. One transaction creates the unknown-value voucher, immutable creation event
and audit evidence, and 90/30/7-day reminder claims. Only one voucher may exist per
issued passenger ticket.

**Errors:** `400` for malformed dates/selection/reference or missing retry key; `401`/`403` for
access failures; `404` when the issued passenger ticket is unavailable; `409` when that passenger
already has a voucher; `429` when rate limited; `503` until capability `2026082903` is installed;
`500` for an unexpected atomic failure.

### GET `/api/ticketing/vouchers/[voucherId]/events`

**Access:** Owners/follow-up assignees may load history and submit a claim. Admin, Master Admin, and
Super Admin append value confirmation, partial/full use, airline refund, expiry, closure, and
deadline-correction events.

**Input:** Voucher UUID path segment; no body.

**Success:** `200 private, no-store` with immutable chronological lifecycle events and actor/link
evidence.

**Errors:** `401`/`403` for access failures; `404` when unavailable; `503` until capability
`2026082903` is installed; `500` for an unsafe projection.

### POST `/api/ticketing/vouchers/[voucherId]/events`

**Access:** Owners/follow-up assignees may submit a claim. Only Admin, Master Admin, and Super Admin
may append the remaining lifecycle event types.

**Input:** Strict event type/date, expected version, event-specific amount, exact replacement
passenger selection, reference/notes/reason, and an 8–200 character idempotency key.

**Success:** Confirmed and remaining value are derived from immutable events. Reuse selects an
exact replacement ledger passenger and is rejected unless its airline matches the voucher airline.
Optimistic versions and 8–200 character idempotency keys prevent duplicate allocation.

**Errors:** `400` for invalid event combinations; `401`/`403` for access failures; `404` when the
voucher or replacement passenger is unavailable; `409` for stale, over-allocation, airline, or
idempotency conflict; `429` when rate limited; `503` until capability `2026082903` is installed;
`500` for atomic failure.

### GET `/api/travel-packages/[id]/ticketing`

**Access:** A signed-in staff user must first be able to read the package through its normal RLS
policy. An unavailable package returns `404` before internal Ticketing data is queried.

**Input:** Package UUID path segment; no query or body.

**Success:** A bounded package-workspace projection of active, non-archived exact PNR-linked
tickets, latest fare variance, refunds, and vouchers, including active linked-group matches. The
package UI presents this evidence in **Reservations** against the matched flight reservation. It
does not mutate released package finances.

**Errors:** `400` for an invalid UUID; `401` when signed out; `404` when the package is not visible;
`503` until capability `2026082903` is installed; `500` if linked lifecycle data cannot be loaded.

### GET `/api/ticketing/airports`

**Access:** Active Ticketing department staff or a Manager, Admin, Master Admin, or Super Admin.
The directory is delivered through the authenticated staff route; `anon` and `authenticated` do
not receive direct table access.

**Input:** Optional strict `q` search of 1–80 letters, numbers, spaces, or hyphens across the IATA
prefix, airport name, and city. Existing itineraries may instead send a comma-separated `codes`
batch containing up to 24 three-letter IATA codes. `q` and `codes` are mutually exclusive.
Optional `limit` is `1`–`100` and defaults to `50`. Repeated or unknown query keys are rejected.

**Success:** `200` with `items`, ordered by IATA code. Every active item contains `iataCode`,
`name`, `city`, two-letter `countryCode`, and the authoritative IANA `timezone`. The timezone is
display context only; itinerary mutations submit the airport code and the database derives the
stored timezone and UTC instant. The ledger performs bounded, debounced lookups and retains
completed query results in the browser session instead of loading the full airport directory.

**Errors:** `400` for malformed filters; `401`/`403` for access failures; `429` when rate limited;
`503` when the required Ticketing capability is absent; `500` when the directory cannot be loaded or mapped
safely.

### GET `/api/ticketing/bookings/[bookingId]/sectors`

**Access:** The current responsible owner may load their Held or Issued root-TK itinerary.
Maintenance Admin, Admin, Master Admin, and Super Admin may load another employee's root TK for the
audited cover workflow. Manager and regular Ticketing staff remain owner-only; an inaccessible and
a missing booking both return `404`.

**Input:** `bookingId` is a UUID path segment. The route accepts no actor, owner, timezone, UTC,
financial, or Commission query fields.

**Success:** `200` with `booking`, `context`, dedicated non-negative `itineraryVersion`, and up to
twelve current `sectors`. Booking context contains the PNR, customer name, Held/Issued state,
responsible owner, booking version, and default airline. Each sector contains its stable ID,
sequence and itinerary version, airline/flight, origin and destination IATA/timezone, local and UTC
departure, optional local and UTC arrival, and schedule status. `context.isOnBehalf` and
`onBehalfReasonRequired` tell the UI whether administrator cover needs a reason. No fare, payment,
profit, package-profit, or commission value is returned.

**Errors:** `401`/`403` for access failures; `404` for an invalid, unavailable, archived, terminal,
non-root, or inaccessible TK; `503` when capability `2026090202` is absent; `500` when stored
itinerary data cannot be loaded or mapped safely.

### PUT `/api/ticketing/bookings/[bookingId]/sectors`

**Access:** The same owner/administrator boundary as `GET`. The database rechecks active Ticketing
membership or oversight, current ownership and attribution. Maintenance Admin, Admin, Master Admin,
and Super Admin may replace another employee's itinerary, with a reason; the responsible owner
never changes and the authenticated employee remains the immutable actor.

**Input:** A strict JSON body no larger than 32 KiB with UUID `requestId`, non-negative
`expectedVersion`, nullable `adminReason` up to 500 characters, and `sectors` containing 1–12
ordered entries. Each entry contains nullable `airlineId` (defaulting to the root booking airline),
`flightNumber`, `originIata`, `destinationIata`, local `departureLocal`, and nullable local
`arrivalLocal`. Local values are bounded to years 2000–2200. Timezone, UTC, owner, actor, audit,
financial, and Commission fields are rejected. Airport timezones and UTC instants are derived
server-side; nonexistent daylight-saving gap values and arrival-before-departure chronology are
rejected.

**Success:** `200` with the same semantic itinerary DTO as `GET`, plus `changed` and
`idempotentReplay`. A real replacement advances only the dedicated itinerary version, retires the
old active sectors, inserts a new active revision, and appends one redacted audit event. It does not
advance an unrelated booking version or emit a Commission source fact. A new request carrying the
same schedule is a no-op. An exact retry returns its immutable committed response before mutable
employee, ownership, airline, airport, or lifecycle checks.

**Errors:** `400` for malformed fields, invalid airport/airline/local time/chronology, missing or
misused administrator reason, or `IDEMPOTENCY_CONFLICT`; `401`/`403` for access failures; `404` for
an unavailable root TK; `409` with `VERSION_CONFLICT`; `429` when rate limited; `503` when
capability `2026082602` is absent; `500` for an invalid or failed atomic result.

### GET `/api/ticketing/flight-monitor`

**Access:** Every active staff member with Ticketing access. This is an intentionally shared
all-agent operational projection, unlike the private ledger. Maintenance Admin has no role-based
bypass unless explicitly assigned to Ticketing.

**Input:** Optional strict `status` (`on_schedule`, `change_marked`, or
`awaiting_finalisation`), `limit` from `1`–`100` (default `50`), and opaque `cursor`. The cursor is
bound to the normalized status filter. Repeated, unknown, malformed, or cross-filter cursor values
are rejected.

**Success:** `200` with one `generatedAt` snapshot time, exact `counts` for all upcoming sectors,
`items` ordered by UTC departure and stable sector ID, and nullable `nextCursor`. Only future active
sectors from non-archived Issued root TKs are eligible. Each item contains booking/sector IDs and
versions, responsible agent, first persisted root passenger name with customer-name fallback, PNR,
contact, passenger count, Issued state, airline/flight, route, origin/destination timezones, local
and UTC departure/optional arrival, schedule status, active immutable change-case proposal, and the
schedule actions currently allowed for the authenticated employee. It returns no supplier/sale
fare, payment, refund, package scope/profit, earnings, margin, or commission field.

**Errors:** `400` for invalid filters or a cursor/filter mismatch; `401`/`403` for access failures;
`429` when rate limited; `503` when capability `2026082701` is absent; `500` when the shared
projection or exact counts cannot be loaded or mapped safely.

### POST `/api/ticketing/flight-monitor/[sectorId]/schedule-change`

**Access:** Any active Ticketing employee may mark a suspected change on an upcoming Issued root-TK
sector shown in the shared monitor. Only the responsible employee, or Admin/Master Admin/Super Admin
acting on behalf with the required reason, may review, finalise, or dismiss the case. Manager and
other Ticketing employees cannot resolve another responsible employee's case.

**Input:** `sectorId` is a UUID path segment. The strict JSON body is limited to 16 KiB and contains
UUID `requestId`, `action` (`mark`, `review`, `finalise`, or `dismiss`), positive
`expectedItineraryVersion`, trimmed `reason` from 1–500 characters, and action-specific fields. A
`mark` requires nullable `changeId`, plus `proposal` with `flightNumber`, local `departureLocal`,
and nullable local `arrivalLocal`. Later actions require the active UUID `changeId` and must submit
`proposal: null`; they cannot replace the immutable marked proposal. Airline, route, timezone, UTC,
actor, owner, financial, audit, and Commission fields are rejected.

**Success:** `200` with the action/case/event IDs, prior/current sector IDs, resulting itinerary
version and schedule status, immutable responsible/acting employee IDs, on-behalf state, nullable
applied sector, and replay state. Marking moves `on_schedule` to `change_marked`; review moves it to
`awaiting_finalisation`; dismissal returns the unchanged sector to `on_schedule`. Finalisation calls
the versioned root-itinerary replacement boundary, retires the previous schedule, applies the
recorded flight-number/local-time proposal as a new itinerary revision, and returns to
`on_schedule`. Every state event is append-only and no Commission source fact is emitted.

**Errors:** `400` for malformed or oversized action combinations, unchanged proposals, invalid
flight/local times, chronology, or missing reason; `401`/`403` for access failures; `404` for an
unavailable sector or case; `409` for stale itinerary/state or idempotency conflict; `429` when rate
limited; `503` when capability `2026082701` is absent; `500` for an invalid or failed atomic result.

### GET `/api/admin/ticketing/flight-api`

**Access:** Admin, Master Admin, and Super Admin only after the normal Ticketing access check.

**Input:** No query parameters or request body.

**Success:** `200 private, no-store` with enabled/configured state, monthly limit, weekly
interval, final-check deadline, per-run cap, used/remaining units for the UTC month, and the latest
20 API-call outcomes. It never returns the API key.

**Errors:** `401`/`403` for access failures; `503` when the settings migration is absent; `500` if
settings or usage cannot be loaded.

### PATCH `/api/admin/ticketing/flight-api`

**Access:** Admin, Master Admin, and Super Admin only after the normal Ticketing access check.

**Input:** Strict 4 KiB JSON with `enabled`, `monthlyLimit`, `weeklyIntervalDays`,
`predepartureHours`, and `maxChecksPerRun`. Enabling returns `409` until
`AERODATABOX_API_KEY` is configured. The verified admin is stored as the settings actor.

**Success:** `200 private, no-store` with the saved settings, refreshed monthly usage, and recent
calls.

**Errors:** `400` for invalid input; `401`/`403` for access failures; `409` when enabling without an
API key; `500`/`503` for unavailable storage or schema.

### GET `/api/cron/ticketing/flight-monitor`

**Access:** Exact `Authorization: Bearer <CRON_SECRET>` through the shared fail-closed cron guard.

**Input:** No query parameters or request body.

**Behaviour:** The once-daily job selects future active Issued sectors. It checks distant sectors
at the configured weekly interval and opens the final-check window one daily cadence before the
configured deadline (72 hours by default). It prioritises final checks, caps work by both remaining
monthly units and `maxChecksPerRun`, records a usage row before each provider call, and stores a
bounded normalized observation. A provider difference is flagged in Flight Monitoring but never
replaces the itinerary or bypasses staff review. Failed provider calls remain eligible for retry;
the monthly cap still applies.

**Success:** `200` with processed/skipped counts and outcomes. Disabled or exhausted runs are
successful no-ops.

**Errors:** Missing provider configuration/schema is `503`; query/storage failures are `500`; cron
authentication is `401`/`503` as described above.

### GET `/api/cron/ticketing/time-limits`

**Access:** The same exact `CRON_SECRET` bearer boundary.

**Input:** No query parameters or request body.

**Behaviour:** Claims and processes due Held-ticket time-limit notifications through the existing
database capability. Vercel invokes it daily on Hobby; the route remains callable by an authorised
external scheduler if finer reminder timing is required.

**Success:** `200` with claimed/processed notification counts, including a safe no-op when nothing
is due.

**Errors:** Cron authentication is `401`/`503`; missing Ticketing capability is `503`; an unexpected
claim/processing failure is `500`.
