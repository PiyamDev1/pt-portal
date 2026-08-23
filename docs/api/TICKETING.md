# Ticketing API

Ticketing operational tables are server-route-only. Every route verifies the staff session and
derives the employee identity on the server before using the service-role client. The My Sales
Ledger endpoints below always bind records to the authenticated employee, including for oversight
roles; team-ledger endpoints will use a separate contract.

### GET `/api/ticketing/ledger`

**Access:** Active staff who either belong to the Ticketing department or hold Manager, Admin,
Master Admin, or Super Admin. Maintenance Admin has no role-based bypass. The result contains only
the authenticated employee's ledger rows.

**Input:** Optional query parameter `limit`; integers are clamped to `1`–`100` and default to `50`.
No employee or owner selector is accepted.

**Success:** `200` JSON with `items`, active `airlines`, and branch `context`. Each item contains the
booking/transaction IDs, PNR, customer, airline, TK/DC/R-ER service type, operational/payment state,
dates, passenger count, package-match state, grouped supplier/sale inputs, optimistic booking and
transaction versions, a derived `detailsStatus` (`needs_details` or `complete`), and creation
timestamp. DC/R-ER rows instead use `recorded` because this first slice captures an aggregate
financial service movement rather than TK passenger/itinerary completion. It contains no
calculated commission, earnings, margin, or profit.

**Errors:** `401` for no valid staff session; `403` for inactive or unauthorized staff; `503` when
the required Ticketing database capability is not installed; `500` when the private ledger,
airline directory, or branch context cannot be loaded.

### POST `/api/ticketing/ledger`

**Access:** Same Ticketing access predicate as `GET`. The server passes the authenticated employee
ID to one service-role-only atomic database function; caller-supplied owner, actor, or audit IDs are
rejected by the strict request schema.

**Input:** JSON for the first-release TK quick entry: `customerName`, `pnr`, `airlineId`,
`serviceType: "TK"`, `operationalStatus` (`held` or `issued`), `bookingDate`, branch-local
`timeLimitAt` for Held or date-only `issuedAt` for Issued, `currency: "GBP"`, one to three unique
`fares` (`passengerType`, positive integer `quantity`, non-negative `unitSupplierCost`), and optional
`confirmDuplicate`. A non-empty `Idempotency-Key` header of at most 200 characters is required. The
body is limited to 16 KiB. This collection operation remains TK-only; DC/R-ER movements use the
existing-PNR endpoints below so the server can bind them to the issued root TK.

**Success:** `201` for a new atomic save or `200` for an identical idempotent replay. The JSON DTO
identifies the booking and transaction and returns the operational/payment state, passenger count,
package-match state, and `idempotentReplay`; it contains no calculated earnings or profit. PNR-based
package matching and an issuance source event are handled inside the same transaction.

**Errors:** `400` for malformed/oversized details, missing retry key, invalid airline/date/fare, or
unsupported fields; `401`/`403` for access failures; `409` with `code: "DUPLICATE_TK"` and bounded
existing-record context when an airline/PNR needs explicit confirmation; `409` with
`code: "IDEMPOTENCY_CONFLICT"` when a retry key is reused with different details; `429` when the
mutation rate limit is exceeded; `503` when the required Ticketing database capability is not
installed; `500` for an unexpected atomic-save failure.

### GET `/api/ticketing/ledger/[bookingId]`

**Access:** Same Ticketing access predicate as the ledger collection. This endpoint remains
own-only even for an oversight role: the root TK must belong to the authenticated employee.
Another employee's UUID and a nonexistent UUID both return the same `404` response.

**Input:** `bookingId` is a UUID path segment. No owner or employee selector is accepted.

**Success:** `200` JSON with `{ "detail": ... }`. The detail contains booking/transaction IDs and
versions, PNR, customer contact, journey dates, lifecycle/payment state, branch-local paid date,
airline, derived details status, grouped supplier/sale fares, and passenger slots. A missing slot is
synthesized from the authoritative ADT/CHD/INF quantities; the first missing ADT may be prefilled in
the response with the lead customer name, but it does not count as persisted completion until it is
saved. The response is `private, no-store` and contains no calculated commission, earnings, margin,
or profit.

**Errors:** `401` for no valid staff session; `403` for inactive or unauthorized staff; `404` for an
invalid, missing, archived, non-root-TK, or other-owner record; `503` when capability `2026082202`
is absent; `500` when the private detail cannot be loaded.

### PATCH `/api/ticketing/ledger/[bookingId]`

**Access:** Same own-only rule as the detail `GET`. The verified employee ID is passed to one
service-role-only atomic database operation; caller-supplied actor or owner fields are rejected.

**Input:** A JSON body no larger than 64 KiB containing `expectedBookingVersion`,
`expectedTransactionVersion`, nullable `contactPhone`, nullable `departureDate`/`returnDate`,
`paymentStatus` (`unpaid` or `paid`), nullable branch-local `paidAt` (`YYYY-MM-DD`), one entry for
each grouped `fareSales` type with nullable `unitSalePrice`, and bounded passenger slot updates keyed
by `passengerType` plus one-based `position`. Passenger name, contact, date of birth, and ticket
number are nullable. Every top-level field is present so retries have one canonical payload. An
`Idempotency-Key` header of 1–200 characters is required.

Partial non-financial completion is allowed. A paid transition requires every grouped sale value
and a paid date and cannot be moved backwards. For an Issued transaction, every still-missing sale
value must be supplied together; a posted non-null sale value is locked and requires the later
audited correction workflow. Existing Part Paid records are read-only in this completion workflow
because no amount-paid model has been introduced.

**Success:** `200` JSON containing the reloaded `detail`, `changed`, and `idempotentReplay`. An
identical no-op creates no audit or Commission source fact. A real change advances both optimistic
versions and writes one redacted audit event. Completing Issued sale values emits the separate
variable-only `ticket_sale_completed` fact; moving Unpaid to Paid emits `ticket_paid`. The events
contain operational/source variables only—Ticketing does not calculate an earning or profit.

**Errors:** `400` for malformed/oversized data, invalid dates/slot/fare values, or a missing retry
key; `401`/`403` for access failures; `404` for an invalid/non-owned record; `409` with
`VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, or `CORRECTION_REQUIRED`; `429` when rate limited;
`503` when capability `2026082202` is absent; `500` for an unexpected atomic-save/reload failure.

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
