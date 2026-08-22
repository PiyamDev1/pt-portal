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
dates, passenger count, package-match state, grouped supplier/sale inputs, and creation timestamp.
It contains no calculated commission, earnings, margin, or profit.

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
body is limited to 16 KiB. DC/R-ER entry is intentionally unavailable until an existing booking and
parent transaction can be selected.

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
