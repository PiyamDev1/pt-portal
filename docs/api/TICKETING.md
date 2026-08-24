# Ticketing API

Ticketing operational tables are server-route-only. Every route verifies the staff session and
derives the immutable acting employee on the server before using the service-role client. Regular
staff and Managers receive owner-only ledger records. Admin, Master Admin, and Super Admin receive
the bounded latest team records so they can discover and correct attribution; this is not an
unbounded export contract.

### GET `/api/ticketing/ledger`

**Access:** Active staff who either belong to the Ticketing department or hold Manager, Admin,
Master Admin, or Super Admin. Maintenance Admin has no role-based bypass. Staff and Managers receive
transactions they own. Admin, Master Admin, and Super Admin receive the latest team transactions,
still bounded by the same `limit` contract.

**Input:** Optional query parameter `limit`; integers are clamped to `1`–`100` and default to `50`.
No employee or owner selector is accepted.

**Success:** `200` JSON with `items`, active `airlines`, and branch `context`. Each item contains the
booking/transaction IDs, PNR, customer, airline, TK/DC/R-ER service type, operational/payment state,
dates, passenger count, package-match state, grouped supplier/sale inputs, optimistic booking and
transaction versions, a derived `detailsStatus` (`needs_details` or `complete`), and creation
timestamp. DC/R-ER rows instead use `recorded` because this first slice captures an aggregate
financial service movement rather than TK passenger/itinerary completion. Every row also contains
the current `responsibleEmployee`, ordered `assistantEmployees`, and `attributionVersion`. Context
contains the authenticated `employeeId`, `canManageAttribution`, and active employee options only
for Admin/Master Admin/Super Admin; other callers receive an empty option list. It contains no
calculated commission, earnings, margin, or profit.

The bounded team ledger lets an Admin, Master Admin, or Super Admin open one non-owned root TK for
the audited completion workflow below. Managers and regular Ticketing staff remain owner-only.
DC/R-ER entry and the other payment mutations are not broadened by this collection response.

**Errors:** `401` for no valid staff session; `403` for inactive or unauthorized staff; `503` when
the required Ticketing database capability is not installed; `500` when the private ledger,
airline directory, or branch context cannot be loaded.

### POST `/api/ticketing/ledger`

**Access:** Same Ticketing access predicate as `GET`. The server passes the authenticated acting
employee ID to one service-role-only atomic database function. Admin, Master Admin, and Super Admin
may select operational attribution; Manager and regular staff are fixed to themselves with no
assistants. The database repeats the active-role/employee checks.

**Input:** JSON for the first-release TK quick entry: `customerName`, `pnr`, `airlineId`,
`serviceType: "TK"`, `operationalStatus` (`held` or `issued`), `bookingDate`, branch-local
`timeLimitAt` for Held or date-only `issuedAt` for Issued, `currency: "GBP"`, one to three unique
`fares` (`passengerType`, positive integer `quantity`, non-negative `unitSupplierCost`), and optional
`confirmDuplicate`. Admin callers may also provide `responsibleEmployeeId`, up to ten unique
`assistantEmployeeIds` that exclude the responsible employee, and nullable `attributionReason`.
The responsible employee defaults to the authenticated actor. A non-empty reason is required when
the responsible employee differs or assistants are present. A non-empty `Idempotency-Key` header of
at most 200 characters is required. The body is limited to 16 KiB. This collection operation remains
TK-only; DC/R-ER movements use the existing-PNR endpoints below so the server can bind them to the
issued root TK.

**Success:** `201` for a new atomic save or `200` for an identical idempotent replay. The JSON DTO
identifies the booking and transaction and returns the operational/payment state, passenger count,
package-match state, and `idempotentReplay`; it contains no calculated earnings or profit. PNR-based
package matching, immutable initial attribution/audit history, and an issuance source event are
handled inside the same transaction. The source event attributes issued-ticket target units to the
responsible employee and records every assistant with zero target units. This assistant list belongs
only to the root TK sale and is not inherited by later DC/R-ER rows.

**Errors:** `400` for malformed/oversized details, missing retry key, invalid airline/date/fare, or
unsupported fields; `401`/`403` for access failures; `409` with `code: "DUPLICATE_TK"` and bounded
existing-record context when an airline/PNR needs explicit confirmation; `409` with
`code: "IDEMPOTENCY_CONFLICT"` when a retry key is reused with different details; `429` when the
mutation rate limit is exceeded; `503` when the required Ticketing database capability is not
installed; `500` for an unexpected atomic-save failure.

### PATCH `/api/ticketing/ledger/[bookingId]/attribution`

**Access:** Admin, Master Admin, and Super Admin only, after the normal Ticketing access check.
Manager, Maintenance Admin, and regular Ticketing staff receive `403`. The authenticated employee is
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
Managers remain owner-only. Admin, Master Admin, and Super Admin may load one non-archived root TK
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

**Access:** The owner may complete their own root TK. Admin, Master Admin, and Super Admin may also
complete a non-owned root TK through the audited on-behalf path. Managers and regular Ticketing
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

**Success:** `200` JSON with `items`, `hasMore`, and nullable `nextCursor`, ordered by latest booking
update and stable booking ID. Eligible rows are active Issued GBP root TKs with a normalized PNR,
positive passenger count, and complete equal source/GBP supplier totals. Each item contains
booking/root IDs and optimistic versions, PNR, airline, ticket owner, branch-local issue date,
journey dates, passenger count, initial/current whole-PNR supplier fare, package-match status, and
the latest immutable adjustment when one exists. The latest adjustment contains its lineage ID,
sequence, original/new supplier fares, signed difference, acting employee ID, effective date, and
creation time. Customer/contact fields, sale values, commission scope or amount, earnings, margin,
markup, and profit are never returned.

**Errors:** `400` for invalid filters or a cursor/filter mismatch; `401`/`403` for access failures;
`429` when rate limited; `503` when capability `2026082401` is absent; `500` when the eligible queue
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
`currency: "GBP"`. A 1–200 character `Idempotency-Key` header is required. This first slice records
one changed whole-PNR supplier fare; it does not allocate a partial-passenger adjustment, mutate the
root TK, create an R-ER, support non-GBP settlement, or persist a same-fare observation. The date
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
`2026082401` is absent; `500` for an invalid or failed atomic result.
