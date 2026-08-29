# Packages and Package Operations API

Source-verified against the route handlers, domain types, helpers, and tests on August 12, 2026.

This reference covers quotation, conversion, operational folders, linked groups, reservations,
invoices, payments, documents, customer/third-party access, transport vouchers, migration,
backup reconciliation, and Umrah transport pricing. Successful JSON responses are returned
directly; errors use `{ "error": "message" }`. Path identifiers are opaque database IDs unless a
route says otherwise. Date-time strings are ISO 8601; date-only values use `YYYY-MM-DD`. Monetary
values are numbers rounded to two decimal places by financial helpers where noted.

## Access and response conventions

- **Authenticated** means the handler requires a valid cookie-backed Supabase user. Most package
  handlers do not add a role test; database policies remain an additional boundary.
- **Active staff** means `requireStaffSession()` also verifies the employee account is active.
- **Super Admin** means `requireSuperAdminSession()` enforces that role.
- Public share handlers use the server client only after validating an unguessable token and
  applying the documented PostgreSQL-backed rate limit. A limit rejection is `429` with
  `Retry-After`; unavailable required limiter infrastructure is `503`.
- Schema-not-installed handling varies intentionally. List/read endpoints often return an empty or
  null success payload with `setupRequired: true`; mutations normally return `503`.
- Internal types below describe staff responses. Public endpoints return explicit reduced shapes.

## Shared field contracts

### Quote payload

`PackageQuotePayload` is normalized rather than rejected field-by-field:

| Field                                                 | Type and normalization                                                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `title`                                               | string; trimmed; default `New package quote`                                                                                            |
| `packageType`                                         | `umrah \| ziyarat \| holiday`; invalid values become `umrah`                                                                            |
| `currency`                                            | three uppercase letters; default `GBP`                                                                                                  |
| `customerName`, `customerPhone`, `customerEmail`      | trimmed strings; default empty                                                                                                          |
| `adults`, `childrenPaying`, `childrenFree`, `infants` | non-negative integers; invalid values become `0`                                                                                        |
| `itineraryOrder`                                      | string ID array; defaults to stay-group order; a holiday's first stay is kept first                                                     |
| `departureDate`, `returnDate`                         | trimmed strings                                                                                                                         |
| `stayGroups`                                          | `{ id, label, options[] }[]`; Umrah/Ziyarat default to Makkah and Madinah groups, holiday to Location 1                                 |
| `flightOptions`, `visaOptions`, `transportOptions`    | component option arrays described below                                                                                                 |
| `linkedFlightGroups`                                  | `{ id, baseFlightOptionId?, routeLabel, defaultOptionId?, options[] }[]`                                                                |
| `linkedPackageGroup`                                  | optional customer-safe snapshot or `null`; contains group identity, visibility, family labels and customer-visible shared-service notes |
| `limitedTimeOffers`                                   | offer array described below                                                                                                             |
| `cardProcessingFeePercent`                            | non-negative number; default `3`                                                                                                        |
| `depositRequired`                                     | boolean; default `false`                                                                                                                |
| `depositAmount`                                       | non-negative number; default `0`                                                                                                        |
| `notes`                                               | string; whitespace is retained                                                                                                          |

A component option has `id`, `title`, `summary`, non-negative `price`, `searchPrice`,
`adjustedPrice`, `pricingMode` (`total | per_person`), `isDefault`, non-negative
`adultPrice/childPrice/infantPrice`, optional positive `quantity`, and
`visaPassengerCategory` (`all | adult | child_5_plus | child_2_to_4 | infant`). Hotel options may
have `hotelAddonOptions[]` (`id`, `label`, signed `searchPrice`, signed `adjustedPrice`, mirrored
`price`). Transport options may contain `includesZiyarat`, `includesTourGuide`, main supplier name
and ID, non-negative net cost/currency, and `transportRoutes[]`. A transport route contains IDs and
labels for route/supplier/vehicle, `kind` (`transfer | makkah_ziyarat | madinah_ziyarat`), costs,
three-letter currency, optional SAR-per-GBP exchange data, and fixed/percent damage-recovery data.

Linked-flight options contain `id`, `airlineName`, `summary`, optional non-negative tier prices,
non-negative adult/child/infant deltas, and `isDefault`. Offers contain `id`, `title`, `summary`,
`expiresAt`, non-negative `discountAmount`, `discountMode` (`total | per_person`), `discountType`
(`early_bird | general_discount | visa_special`), eligible services
(`flight | hotel | transport | visa`), optional visa targeting, and `active`. Non-visa specials
cannot target visa; visa specials target visa only.

### Selection input

`PackageSelectionInput` fields are:

| Field                                                    | Type and rule                                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `stayOptionIds`                                          | required object mapping every stay-group ID to a valid option ID              |
| `hotelAddonOptionIds`                                    | optional map of stay-group IDs to valid add-on ID arrays                      |
| `flightOptionId`, `visaOptionId`, `transportOptionId`    | option ID or `null`; invalid supplied IDs fail                                |
| `linkedFlightOptionIds`                                  | optional map of linked-flight group ID to valid option ID                     |
| `paymentMethod`, `depositPaymentMethod`                  | `cash \| bank_transfer \| card`; invalid values normalize to `bank_transfer`  |
| `paymentBreakdown`                                       | optional `{ cash?, bankTransfer?, card? }`; amounts normalize non-negative    |
| `paymentIntent`                                          | `full_payment \| deposit_only \| installment_request`; default `full_payment` |
| `installmentRequested`, `termsAccepted`, `saveOnly`      | optional booleans                                                             |
| `customerName`, `customerPhone`, `customerEmail`, `note` | optional strings, trimmed when resolved                                       |

Resolution requires at least one paying guest (`adults + childrenPaying > 0`). It returns
`{ selection, combination }`, where `combination` includes the resolved components, retail gross,
offer discount, subtotal, payment split, card surcharge, total, per-person price, counts, currency,
and applied offers. Customer-facing presentation uses passenger-total rows and does not render visa
component costs separately. The staff quote payload contains selectable retail option values needed
for browser-side selection and can also carry search/adjustment values and transport supplier/net-cost
data. Reservation booked costs, projected margin, received commission, and supplier refund totals
from operational tables are not merged into it. Public share handlers project the staff payload into
the reduced contract described below before serializing it.

### Core staff records

- `TravelPackageQuote`: `id`, `title`, `package_type`, quote `status`, `currency`, customer contact,
  normalized `payload`, share token/enabled/shared/expiry fields, resolved selection/timestamps/note,
  conversion/finalisation fields, creator, and timestamps. Quote statuses are `draft`, `shared`,
  `expired`, `customer_selected`, `agent_selected`, `finalised`, `converted`, `archived`.
- `TravelPackageFolder`: identity/reference/source quote, responsibility and location IDs, customer
  contact, type/destination/dates/status, passenger and selected-quote snapshots, public summary,
  passport/payment/invoice/document states, next action/risk, storage location, portal access,
  lifecycle/cancellation fields, metadata, and timestamps.
- `TravelPackageReservation`: identity/links, type/status/title, supplier and booking references,
  currency, booked/sold/discount/commission/refund/deposit totals and dates, visibility/notes,
  metadata, timestamps, optional `items` and computed `discount_allocation`.
- `TravelPackageInvoice`: identity/links/number/status/currency; sold, paid, balance, booked-cost,
  margin, and commission totals; release/version/terms/internal notes/due/finalisation/amendment
  fields; timestamps; optional `lines`.
- `TravelPackagePayment`: links, amount/currency, type/method/status, requested/due/received fields,
  receipt and notes, metadata, actor IDs, and timestamps.
- `TravelPackageDocument`: links, category/title/file metadata, primary and backup storage metadata,
  status/visibility/release/revocation fields, public/internal notes, metadata, and timestamps.

These complete staff records include internal finance and storage details and must not be relayed to
customers. Public portal routes below construct reduced DTOs.

### Package lifecycle transitions

`PATCH /api/travel-packages/[id]` permits the same state or these explicit transitions:

| From                  | Allowed next states                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `selected`            | `awaiting_passports`, `awaiting_deposit`, `reservation_pending`, `cancelled`, `archived`      |
| `awaiting_passports`  | `selected`, `awaiting_deposit`, `reservation_pending`, `cancelled`, `archived`                |
| `awaiting_deposit`    | `awaiting_passports`, `reservation_pending`, `partially_booked`, `cancelled`, `archived`      |
| `reservation_pending` | `awaiting_deposit`, `partially_booked`, `fully_reserved`, `cancelled`, `archived`             |
| `partially_booked`    | `awaiting_deposit`, `reservation_pending`, `fully_reserved`, `cancelled`, `archived`          |
| `fully_reserved`      | `partially_booked`, `documents_pending`, `documents_released`, `travelling_soon`, `cancelled` |
| `documents_pending`   | `partially_booked`, `fully_reserved`, `documents_released`, `travelling_soon`, `cancelled`    |
| `documents_released`  | `documents_pending`, `travelling_soon`, `travelling`, `cancelled`                             |
| `travelling_soon`     | `documents_pending`, `documents_released`, `travelling`, `cancelled`                          |
| `travelling`          | `returned`, `cancelled`                                                                       |
| `returned`            | `travelling`, `closed`, `cancelled`                                                           |
| `closed`              | `returned`, `archived`                                                                        |
| `cancelled`           | `archived`                                                                                    |
| `archived`            | none                                                                                          |

## Quotations and public selection

### GET `/api/packages`

Lists at most 100 quotes newest first.

**Access:** Authenticated user.

**Input:** Optional query `status: string`; `all` includes every status, omission excludes
`archived`, and any other value is passed as an exact database status filter.

**Success:** `200 { packages: TravelPackageQuote[], setupRequired: boolean, message?: string }`.

**Errors:** `401` unauthenticated; `500` query failure. Missing schema returns `200` with an empty
array and `setupRequired: true`.

### POST `/api/packages`

Creates a quote and a new 24-character share token.

**Access:** Authenticated user.

**Input:** JSON `{ payload?: PackageQuotePayload-like, shareEnabled?: boolean, expiresAt?: string }`.
The payload is normalized as above. Expiry defaults to 72 hours; invalid date input also falls back
to that default. An enabled share must expire in the future.

**Success:** `201 { quote: TravelPackageQuote, setupRequired: false }`; status is `shared` when
enabled and `draft` otherwise.

**Errors:** `400` enabled share has expired; `401`; `500`. Missing schema returns
`200 { quote: null, setupRequired: true, message }`.

```json
{
  "shareEnabled": true,
  "expiresAt": "2026-09-01T12:00:00.000Z",
  "payload": {
    "title": "PT-ABC123 Umrah",
    "packageType": "umrah",
    "currency": "GBP",
    "adults": 2,
    "childrenPaying": 0,
    "childrenFree": 0,
    "infants": 0
  }
}
```

### GET `/api/packages/[id]`

Loads one complete staff quote.

**Access:** Authenticated user.

**Input:** Path `id`.

**Success:** `200 { quote: TravelPackageQuote, setupRequired: false }`.

**Errors:** `401`; `404` not found; missing schema returns
`200 { quote: null, setupRequired: true, message }`.

### PATCH `/api/packages/[id]`

Updates quote content, expiry, sharing, or status.

**Access:** Authenticated user.

**Input:** JSON with one or more: `payload` (normalized; replacing it clears selection and
finalisation), `expiresAt: string`, `shareEnabled: boolean`, `status` from the quote-status enum.
Enabling sharing stamps `shared_at`/`last_shared_by` and ensures a future expiry; disabling returns
the quote to `draft` unless an explicit status wins. Archiving stamps `archived_at`.

**Success:** `200 { quote: TravelPackageQuote, setupRequired: false }`.

**Errors:** `400` invalid JSON/status/expiry or no changes; `401`; `500`; schema absence may return
`200 { quote: null, setupRequired: true, message }`.

### POST `/api/packages/[id]/selection`

Finalises an agent selection in Sales Mode.

**Access:** Authenticated user.

**Input:** JSON `PackageSelectionInput`; `stayOptionIds` is required. The quote must not be archived.

**Success:** `200 { selected: PackageResolvedSelection }`. Stores customer contact, resolved
selection and note; sets `status: agent_selected`, `finalised_source: agent`, actor/time, and an audit
event. Repeating the call recalculates and replaces the saved selection; there is no idempotency key.

**Errors:** `400` missing/invalid selection, no paying guest, invalid option, or archived quote;
`401`; `404`; `503` schema missing; `500` update failure.

### POST `/api/packages/[id]/convert`

Converts a finalised quote into its operational folder.

**Access:** Authenticated user.

**Input:** Path `id`; optional strict JSON object `{ groupCustomerFile?: boolean }`. An omitted or
empty body behaves as `{}`. `groupCustomerFile: true` requests one shared operational folder for the
quote's linked group; a selection with `paymentScope: group` makes the same request automatically.
The quote must have `selected_option` and `selected_at` and must not be archived.

**Success:** First conversion returns `201 { package: TravelPackageFolder, alreadyConverted: false }`.
It creates the folder/snapshot, placeholder passengers, component reservations, pending payment or
deposit rows, tasks, communication, version, deadlines, and audit event, then marks the quote
`converted`. Retail component rows preserve total price via a surcharge/discount adjustment. A
later call returns `200 { package, alreadyConverted: true }` when the recorded folder still exists.

**Errors:** `400` malformed/invalid body, archived or not finalised, or linked group cannot be
prepared; `401`; `404`; `503` schema missing; `500` folder insert failure. Ancillary
passenger/reservation/payment/deadline inserts are best-effort, so callers should inspect the created
folder after conversion. The conversion is a multi-write workflow, not a database transaction: its
retry shortcut applies only after `converted_package_id` has been stored; a failure between folder
creation and that final quote update can leave partial state requiring operator review.

### GET `/api/packages/share/[token]`

Loads a live public quotation and optional linked-family view.

**Access:** Public opaque token; 60 requests per token/IP per 60 seconds. Share must be enabled,
unarchived, and unexpired.

**Input:** Path `token` (trimmed).

**Success:** `200 { quote, linkedGroup }`. `quote` is
`{ payload: PublicPackageQuotePayload, expires_at, customer_name, customer_phone, customer_email,
selected_option }`, not `TravelPackageQuote`. The three snake-case contact fields belong only to the
quote addressed by `token` and are retained because the customer UI uses them to prefill its form.
`selected_option` is `null` or a reduced resolved selection: it keeps option IDs, payment choices,
retail component data and calculated totals, but removes the saved customer contact and free-form
note from `selection` and applies the same component projection as `payload`.

`linkedGroup` is `null` for no group, schema fallback, or a `private` group. The default
`linked_notice_only` mode returns only `{ notice }`, containing a fixed generic shared-arrangements
message; it does not query or reveal the group title/reference, members, payloads, selections, or
totals. Only an explicitly configured `shared_group_view` returns
`{ groupReference, title, sharedFlightSelection, families[] }`. Members are included only when they
are marked `customer_visible` or are the current quote. A family always has `familyLabel`,
`quoteTitle`, `sharePath`, `isCurrent`, and `pricing`; a currently accessible/shareable family also
has `payload` and `baseSelection`. `pricing` contains `grossPrice`, `discountTotal`, `totalPrice`,
`currency`, and passenger `breakdown`; an inaccessible family has `pricing: null`. `sharePath` is
present only for an enabled, unexpired linked quote and intentionally supplies the customer-visible
navigation path without returning a `share_token` property.

**Errors:** `400` empty token; `404` unavailable; `410` expired; `429` limited; `503` limiter
unavailable.

Customer safety: the public payload omits `customerName`, `customerPhone`, `customerEmail`, `notes`,
the embedded `linkedPackageGroup` snapshot, option/add-on `searchPrice` and `adjustedPrice`, transport
main-supplier ID/name and net cost/currency, and route supplier ID/name, cost/currency, GBP recovery,
exchange-rate, and damage-recovery fields. It retains each option's retail `price` plus customer-facing
route and vehicle IDs/labels so selection calculations and display continue to work. The outer quote
does not include its ID, share token, creator, status, staff selection note, timestamps other than
expiry, or other staff columns. Linked-family payloads use this same projection and never include that
family's name, phone, email, payload contact fields, notes, quote ID, or member metadata. Group IDs,
visibility mode, internal notes, arbitrary metadata, shared-service allocations, reservation costs,
margins, commissions, payments, documents, and supplier refunds are excluded. Customer UI must
continue showing aggregate passenger totals rather than exposing visa cost as a separate component.

```json
{
  "quote": {
    "payload": {
      "title": "September Umrah",
      "currency": "GBP",
      "transportOptions": [
        {
          "id": "transport-1",
          "title": "Private transport",
          "price": 500,
          "transportRoutes": [{ "routeName": "Jeddah to Makkah", "vehicleLabel": "GMC Yukon" }]
        }
      ]
    },
    "expires_at": "2026-09-01T12:00:00.000Z",
    "customer_name": "Current customer"
  },
  "linkedGroup": null
}
```

### POST `/api/packages/share/[token]/selection`

Saves or finalises a customer's public selection.

**Access:** Public opaque token; 30 requests per token/IP per 15 minutes; enabled, unarchived,
unexpired quote required.

**Input:** JSON `PackageSelectionInput`, limited to 64 KiB; unknown object keys are stripped.
`stayOptionIds` is required. Option/group IDs are non-empty strings of at most 200 characters.
`stayOptionIds` and `linkedFlightOptionIds` accept at most 50 mappings each;
`hotelAddonOptionIds` accepts at most 50 stay mappings and 50 add-on IDs per stay. Customer field
limits are name 200, phone 64, email 320, and note 8,000 characters. `paymentMethod` and
`depositPaymentMethod` are `cash | bank_transfer | card | null`; `paymentIntent` is
`full_payment | deposit_only | installment_request | null`; payment breakdown values are numbers.
`saveOnly: true` permits a draft save without terms; finalisation requires `termsAccepted: true`.
`saveOnly` is removed before the selection is resolved.

**Success:** `200 { selected: PublicPackageResolvedSelection, saveOnly: boolean }`. `selected`
retains resolved IDs, payment fields, retail option data and financial totals required by the UI, but
omits `selection.customerName`, `selection.customerPhone`, `selection.customerEmail`,
`selection.note`, search/adjustment values, and all transport supplier/net-cost/route-cost internals
listed for the GET projection. The database and audit event retain the complete resolved selection;
only the bearer response is reduced. Draft save updates selection/contact/note only. Finalisation
additionally sets `customer_selected`, finalised time/source, and an audit event. Repeats replace the
selection; no idempotency key is accepted.

**Errors:** `400` malformed JSON, missing/invalid/over-limit fields or unaccepted terms; `404`; `410`;
`413` body over 64 KiB; `429`; `500`; `503` limiter unavailable.

```json
{
  "stayOptionIds": { "makkah": "makkah-hotel-1", "madinah": "madinah-hotel-1" },
  "flightOptionId": "flight-1",
  "linkedFlightOptionIds": { "return-leg": "return-leg-option-2" },
  "visaOptionId": "visa-adult",
  "transportOptionId": "transport-1",
  "paymentIntent": "deposit_only",
  "depositPaymentMethod": "bank_transfer",
  "termsAccepted": true
}
```

## Operational folders and workflow

### GET `/api/travel-packages`

Lists at most 100 operational folders newest first.

**Access:** Authenticated user.

**Input:** Optional query `status: string`; omission applies no status filter.

**Success:** `200 { packages: TravelPackageFolder[], setupRequired: false }`.

**Errors:** `401`; `500`; missing schema returns an empty list with `setupRequired: true`.

### GET `/api/travel-packages/[id]`

Loads one complete operational folder.

**Access:** Authenticated user.

**Input:** Path `id`.

**Success:** `200 { package: TravelPackageFolder, setupRequired: false }`.

**Errors:** `401`; `404`; missing schema returns `200 { package: null, setupRequired: true,
message }`.

### PATCH `/api/travel-packages/[id]`

Updates lifecycle, customer, responsibility, and public-summary fields.

**Access:** Authenticated user.

**Input:** JSON with any of: `status` (folder-status enum and transition table above),
`passportStatus` (`not_requested | requested | received_whatsapp | checked | issues_found | ready`),
`customerName`, `customerPhone`, `customerEmail`, `destination`, `departureDate`, `returnDate`,
`assignedAgentId`, `salesResponsibleEmployeeId`, `bookingResponsibleEmployeeId`,
`modifyResponsibleEmployeeId`, `serviceResponsibleEmployeeId`, `nextAction`, `nextActionDueAt`,
`cancellationReason`, `currentPublicSummary: object`. Responsibility value `none` clears the ID.
Cancellation requires a new or existing reason. Status transitions stamp lifecycle timestamps;
customer name refreshes the portal surname.

**Success:** `200 { package: TravelPackageFolder, setupRequired: false }` plus audit event.

**Errors:** `400` invalid JSON/status/passport status, missing cancellation reason, or no changes;
`401`; `404`; `409` disallowed transition; `503` schema missing; `500` update failure.

### POST `/api/travel-packages/[id]/quote-sync`

Reconciles an existing operational folder from its current final quotation or linked-group
quotations.

**Access:** Authenticated user.

**Input:** Path `id`; body ignored.

**Success:** `200 { result: PackageQuoteSyncResult }`. Rebuilds the immutable quotation snapshot and
passenger totals, then reconciles quote-generated reservations, payment requests, and previous-refund
credits. Existing operational reservations and manual financial overrides are preserved and reported
as conflicts instead of being silently overwritten. `result.status` is `synced` or `review_required`;
the result also includes source quote IDs, create/update/cancel counts, conflicts, and the refreshed
snapshot. The folder's `metadata.quoteSync` records the reconciliation status and time.

**Errors:** `401`; `500` package/source quotation lookup or reconciliation failure. A failure is also
recorded best-effort in `metadata.quoteSync` with status `failed`.

### GET `/api/travel-packages/[id]/operations`

Returns workflow support records.

**Access:** Authenticated user.

**Input:** Path `id`.

**Success:** `200 { tasks, deadlines, risks, communications, auditEvents, versions,
setupRequired }`; audit is newest-first limited to 150 and versions to 100.

**Errors:** `401`; `500`; missing schema returns empty arrays with `setupRequired: true`.

### POST `/api/travel-packages/[id]/operations`

Creates a task, deadline, risk, or immutable communication.

**Access:** Authenticated user.

**Input:** JSON `resource: task | deadline | risk | communication`. Common text is trimmed.
Task: required `title`, optional `description`, `taskType/task_type` default `general`, `priority`
default `medium`, `assignedTo/assigned_to` default actor, `dueAt/due_at`; status starts `open`. Deadline:
required `title` and `dueAt/due_at`, optional type default `general`, severity default `medium`, assignee
default actor, notes. Risk: required `title`, optional type default `manual`, severity default `medium`,
description/assignee/due; starts manual/open. Communication: required `summary`, optional `channel` and
`direction` default `internal`, `followUpRequired`, `followUpDueAt`; a requested follow-up also creates
an automatic task.

**Success:** `201 { resource, item }` and audit event.

**Errors:** `400` invalid JSON/resource or required field; `401`; `503` schema missing; `500` insert.

### PATCH `/api/travel-packages/[id]/operations`

Updates mutable workflow state.

**Access:** Authenticated user.

**Input:** JSON requires `resource: task | deadline | risk | communication` and
`resourceId/resource_id`. Task accepts `status`, `priority`, `dueAt/due_at`; completing stamps actor
and time. Deadline accepts `status`, `dueAt/due_at`; `met`, `missed`, or `cancelled` stamps resolution.
Risk accepts `status`, `resolutionNote/resolution_note`; acknowledged/resolved states stamp actor/time.

**Success:** `200 { resource, item }` and audit event.

**Errors:** `400` invalid input; `401`; `404`; `409` communications are immutable; `500` update.

### POST `/api/travel-packages/[id]/operations/sync`

Re-derives next action, risk, installment, and payment workflow state.

**Access:** Authenticated user.

**Input:** Path `id`; body ignored.

**Success:** `200 { package, workflow }`. Marks past scheduled/due installments overdue, reconciles
automatic risks, creates or updates the primary next-action task, and writes next action, due date,
risk level, and payment status. Repetition reconciles by risk type/source and task source rule, so it
is operationally idempotent apart from timestamps.

**Errors:** `401`; `404`; `500` package update or dependency failure.

## Passengers

### GET `/api/travel-packages/[id]/passengers`

**Access:** Authenticated user.

**Input:** Path `id`.

**Success:** `200 { passengers: TravelPackagePassenger[], setupRequired?: boolean, message?: string }`
ordered oldest first. Passenger fields are ID/package, names, date of birth, type, passport flags/note,
visa/ticket states, room allocation, internal notes, actor IDs, timestamps.

**Errors:** `401`; `500`; missing schema returns an empty success with `setupRequired: true`.

### POST `/api/travel-packages/[id]/passengers`

**Access:** Authenticated user.

**Input:** JSON requires `passengerType/passenger_type: adult | child | infant`; optional
`firstName`, `lastName`, `dateOfBirth`, `passportReceived`, `passportChecked`, `passportIssueNote`,
`roomAllocation`, `internalNotes` (snake_case aliases accepted).

**Success:** `201 { passenger: TravelPackagePassenger }` and audit event.

**Errors:** `400` invalid JSON/type; `401`; `503` schema missing; `500` insert.

### PATCH `/api/travel-packages/[id]/passengers/[passengerId]`

**Access:** Authenticated user.

**Input:** Any POST fields plus `visaStatus` (`not_started | details_required | submitted | approved |
rejected | not_required`) and `ticketStatus` (`not_started | held | ticketed | changed | cancelled`),
with snake_case aliases. Text can be cleared with empty input.

**Success:** `200 { passenger: TravelPackagePassenger }` and audit event.

**Errors:** `400` invalid JSON/enum; `401`; `404`; `500` update.

### DELETE `/api/travel-packages/[id]/passengers/[passengerId]`

**Access:** Authenticated user.

**Input:** Path `id`, `passengerId`.

**Success:** `200 { deleted: true }` and audit event. Deletion is physical, not soft-delete.

**Errors:** `401`; `500` delete failure.

## Reservations, items, and refunds

Reservation types are `flight | hotel | visa | transport | other`; statuses are `not_started |
quote_requested | availability_checked | reservation_pending | reserved | deposit_required | paid |
confirmed | changed | cancelled | failed`.

### GET `/api/travel-packages/[id]/reservations`

**Access:** Authenticated user.

**Input:** Path `id`.

**Success:** `200 { reservations: TravelPackageReservation[], setupRequired: false }`, newest first.

**Errors:** `401`; `500`; missing schema returns an empty success with setup hint.

### POST `/api/travel-packages/[id]/reservations`

**Access:** Authenticated user.

**Input:** JSON requires non-empty `title`. Optional camel/snake fields: `reservationType` (invalid
defaults `other`), `status` (invalid defaults `not_started`), `quoteId`, supplier/booking references,
`currency` default `GBP`, non-negative `bookedCostTotal`, `soldPriceTotal`, `discountTotal`,
`commissionExpectedTotal`, `commissionReceivedTotal`, `depositRequired`, `depositAmount`, valid or
empty `depositDueAt`, `paymentDueAt`, `reservedAt`, `confirmedAt`, `customerVisible`, `publicNotes`,
`internalNotes`, and object `metadata`. Money is rounded to two decimals.

**Success:** `201 { reservation: TravelPackageReservation, setupRequired: false }` and audit event.

**Errors:** `400` invalid JSON/title or negative money; `401`; `503` schema missing; `500` insert.

### PATCH `/api/travel-packages/[id]/reservations/[reservationId]`

**Access:** Authenticated user.

**Input:** Any mutable POST field plus `cancelledAt`; supplied type/status must be valid. All six
money fields reject negatives. At least one field is required.

**Success:** `200 { reservation: TravelPackageReservation, setupRequired: false }` and audit event.

**Errors:** `400` invalid/empty update; `401`; `503` schema missing; `500` update.

### DELETE `/api/travel-packages/[id]/reservations/[reservationId]`

**Access:** Authenticated user.

**Input:** Path IDs.

**Success:** `200 { deleted: true, setupRequired: false }`; physical delete plus audit event.

**Errors:** `401`; `404`; `503` schema missing; `500` delete.

### GET `/api/travel-packages/[id]/reservations/[reservationId]/items`

**Access:** Authenticated user.

**Input:** Path IDs.

**Success:** `200 { items: TravelPackageReservationItem[], setupRequired: false }`, oldest first.
Items contain type/title/description, quantity, unit/total booked and sold values, discounts,
expected/received commission, currency, supplier reference, status/dates, metadata, timestamps.

**Errors:** `401`; `500`; missing schema returns an empty success with setup hint.

### POST `/api/travel-packages/[id]/reservations/[reservationId]/items`

**Access:** Authenticated user.

**Input:** JSON requires `title`. Optional `itemType/item_type` (`flight | hotel | visa | transport |
commission | discount | other`, default parent reservation type), `status` (`draft | reserved |
confirmed | changed | cancelled`, default `draft`), `description`, positive `quantity` default `1`,
non-negative `unitBookedCost`, `unitSoldPrice`, `discountAmount`, `commissionExpectedAmount`,
`commissionReceivedAmount`, currency, supplier reference, valid/empty `startsAt`, `endsAt`, object
metadata. Numeric values are rounded to two decimals; totals are quantity times units.

**Success:** `201 { item: TravelPackageReservationItem, reservation: TravelPackageReservation,
setupRequired: false }`. If parent reload fails after insertion, the pre-insert parent is returned.

**Errors:** `400` invalid JSON/title; `401`; `404` parent missing; `503` schema/FK setup; `500` insert.

### PATCH `/api/travel-packages/[id]/reservations/[reservationId]/items/[itemId]`

**Access:** Authenticated user.

**Input:** Any mutable item field listed for POST; type/status must be valid and at least one field is
required. Invalid/non-positive quantity becomes `1`; money clamps non-negative; totals recalculate.

**Success:** `200 { item, reservation: TravelPackageReservation | null, setupRequired: false }`.

**Errors:** `400` invalid/empty update; `401`; `503` schema; `500` update.

### POST `/api/travel-packages/[id]/reservations/[reservationId]/refunds`

Records a supplier credit or customer refund without allowing negative reservation values.

**Access:** Authenticated user.

**Input:** JSON requires `refundKind/refund_kind: supplier | customer` and `amount > 0`. Optional
`reason`, `reference`, `invoiceId/invoice_id`. Customer refunds additionally require
`paymentMethod/payment_method: cash | bank_transfer | card | other`. The maximum supplier credit is
remaining booked cost. The maximum customer refund is remaining sold price minus reservation and
allocated quote discounts and prior refunds.

**Success:** `201 { reservation: TravelPackageReservation with discount_allocation, payment }`.
Supplier credit updates reservation totals only. Customer refund also creates a completed `refund`
payment, synchronizes invoice/package payment totals, and rolls it back if reservation update fails.

**Errors:** `400` kind/method/amount invalid or exceeds remaining refundable amount; `401`; `404`;
`503` migration missing; `500` persistence.

```json
{
  "refundKind": "customer",
  "amount": 125,
  "paymentMethod": "bank_transfer",
  "invoiceId": "invoice-id",
  "reason": "Cancelled transfer",
  "reference": "BANK-REF-123"
}
```

## Invoices and lines

Invoice statuses are `draft | internal_review | finalised | pending_payment | part_paid | paid |
released | amended | void | closed`. Line types are `flight | hotel | visa | transport | discount |
commission | other`.

### GET `/api/travel-packages/[id]/invoice`

**Access:** Authenticated user.

**Input:** Path `id`.

**Success:** `200 { invoice: (TravelPackageInvoice & { lines: TravelPackageInvoiceLine[] }) | null,
setupRequired: false }`; returns latest non-void invoice.

**Errors:** `401`; `500`; missing schema returns null with `setupRequired: true`.

### POST `/api/travel-packages/[id]/invoice`

Creates or retrieves the package invoice.

**Access:** Authenticated user.

**Input:** JSON is optional. `regenerate: boolean` bypasses reuse of the latest non-void invoice;
`currency`, `customerTerms`, `internalNotes`, `dueAt` customize a new invoice. It builds lines from
reservation items/reservations, totals completed deposit/payment minus refunds/chargebacks, creates a
draft invoice, associates orphan package payments, and updates package invoice state.

**Success:** Existing invoice: `200 { invoice with lines, setupRequired: false }`. New invoice:
`201` with the same shape. Repeating without `regenerate` is idempotent.

**Errors:** `401`; `404` package; `503` schema; `500` dependency/insert/line failure.

### PATCH `/api/travel-packages/[id]/invoice`

Updates a staff invoice and recomputes dependent totals.

**Access:** Authenticated user.

**Input:** JSON requires `invoiceId/invoice_id`. Optional camel/snake values: `subtotalSold`,
`discountTotal`, `totalPaid`, `totalBookedCost`, `expectedCommissionTotal`,
`receivedCommissionTotal`, `status`, `releasedToCustomer`, `customerTerms`, `internalNotes`, `dueAt`,
`amendmentReason`. Money is rounded; `totalSold = subtotal - discount`, `balanceDue = totalSold -
paid`, and `projectedMargin = totalSold - bookedCost + expectedCommission`. Direct first release is
forbidden; use the release action.

**Success:** `200 { invoice with lines, setupRequired: false }`; syncs folder invoice status and
audits.

**Errors:** `400` missing invoice ID; `401`; `404`; `409` attempted direct first release; `503`
schema; `500` update.

### POST `/api/travel-packages/[id]/invoice/lines`

**Access:** Authenticated user.

**Input:** JSON requires `invoiceId/invoice_id` and `description`. Optional `lineType`, non-negative
`quantity` default `1`, `unitSoldPrice`, `unitBookedCost`, `discountAmount`, `expectedCommission`,
`receivedCommission`, `customerVisible` default `true`, numeric `sortOrder`; camel/snake aliases
accepted. Line type invalid values become `other`; money is rounded.

**Success:** `201 { line: TravelPackageInvoiceLine, invoice: recalculated invoice | null }` and
audit event.

**Errors:** `400` invalid JSON/required fields; `401`; `500` insert or recalculation. The row can have
been written when recalculation fails, as the error text explicitly reports.

### PATCH `/api/travel-packages/[id]/invoice/lines/[lineId]`

**Access:** Authenticated user.

**Input:** Any line field from POST except invoice ID. Description cannot become empty. Quantity is
clamped non-negative; totals and invoice recalculate.

**Success:** `200 { line, invoice: recalculated invoice | null }` and audit event.

**Errors:** `400` invalid JSON/description; `401`; `404`; `500` update/recalculation.

### DELETE `/api/travel-packages/[id]/invoice/lines/[lineId]`

**Access:** Authenticated user.

**Input:** Path IDs.

**Success:** `200 { deleted: true, invoice: recalculated invoice | null }`; physical delete.

**Errors:** `401`; `404`; `500` delete/recalculation. Deletion can already have happened if
recalculation then fails.

### POST `/api/travel-packages/[id]/invoice/release`

Releases an immutable customer snapshot.

**Access:** Authenticated user.

**Input:** JSON requires `invoiceId`; optional `changeSummary: string`. Invoice must not be void and
`total_sold` must exceed zero.

**Success:** `200 { invoice: TravelPackageInvoice with lines, releasedSnapshot }`. Revokes the prior
released invoice version, inserts the new released snapshot, marks invoice/folder released, and
audits. Snapshot fields are invoice/package/quote IDs, number, currency, retail subtotal/discount/
total/paid/balance, terms, due date, version, and customer-visible lines with retail values.

**Errors:** `400` missing ID; `401`; `404`; `409` void/zero total; `500` line/snapshot/update failure.

Customer safety: the snapshot omits booked costs, projected margin, expected/received commission,
internal notes, supplier references, metadata, and every line where `customer_visible` is false.

```json
{ "invoiceId": "invoice-id", "changeSummary": "Added the confirmed hotel upgrade" }
```

### POST `/api/travel-packages/[id]/invoice/amend`

Opens a released invoice as its next editable revision.

**Access:** Authenticated user.

**Input:** JSON requires non-empty `invoiceId` and `reason`.

**Success:** `200 { invoice: TravelPackageInvoice }`; sets `amended`, hides current live invoice,
increments version, records reason, updates folder state, and audits. Previously released customer
snapshot remains the historical released artifact until a new release replaces it.

**Errors:** `400` invalid JSON/required fields; `401`; `404`; `409` invoice was not released; `500`.

## Payments and payment plans

Payment types are `deposit | payment | account_credit | refund | chargeback | commission`; methods
are `cash | bank_transfer | card | other`; statuses are `pending | completed | failed | cancelled |
refunded`.

### GET `/api/travel-packages/[id]/payments`

**Access:** Authenticated user.

**Input:** Path `id`.

**Success:** `200 { payments: TravelPackagePayment[], setupRequired?: boolean, message?: string }`,
newest first.

**Errors:** `401`; `500`; missing schema returns empty success with setup hint.

### POST `/api/travel-packages/[id]/payments`

**Access:** Authenticated user.

**Input:** JSON requires `amount > 0`, valid `paymentType`, `paymentMethod`, and `paymentStatus`.
Optional `invoiceId`, `reservationId`, uppercase `currency` default `GBP`, `requestedAt`, `dueAt`,
`receivedAt`, `receiptReference`, `notes`, object `metadata`, `installmentId` (snake aliases accepted).
An `account_credit` requires the prior package/refund `receiptReference`. Pending defaults
`requested_at` now; completed defaults received time/actor now.

**Success:** `201 { payment: TravelPackagePayment, summary }`. Links/updates an installment if
provided, synchronizes invoice/folder financial totals, and audits. There is no idempotency key;
clients must prevent duplicate submissions.

**Errors:** `400` invalid input; `401`; `503` schema missing; `500` insert.

### PATCH `/api/travel-packages/[id]/payments/[paymentId]`

**Access:** Authenticated user.

**Input:** Optional `amount > 0`, `paymentType`, `paymentStatus`, `paymentMethod`, `dueAt`,
`receivedAt`, `receiptReference`, `notes` with snake aliases. `account_credit` still requires a
reference. Completing stamps receiver/time if previously absent.

**Success:** `200 { payment: TravelPackagePayment, summary }`. Synchronizes linked reservation
customer-refund contribution, linked installment state, invoice/folder totals, and audit.

**Errors:** `400` invalid enum/amount/account-credit reference; `401`; `404`; `500`.

### DELETE `/api/travel-packages/[id]/payments/[paymentId]`

**Access:** Authenticated user.

**Input:** Path IDs.

**Success:** `200 { deleted: true, summary }`; reverses linked reservation refund contribution,
unlinks/resets installments, recalculates finance, and audits. Physical delete.

**Errors:** `401`; `404`; `500`.

### GET `/api/travel-packages/[id]/payment-plan`

**Access:** Authenticated user.

**Input:** Path `id`.

**Success:** `200 { plan: (TravelPackagePaymentPlan & { installments[] }) | null }`; latest plan,
installments ordered by sequence.

**Errors:** `401`; `500`.

### POST `/api/travel-packages/[id]/payment-plan`

Replaces the active/draft plan with a generated installment schedule.

**Access:** Authenticated user.

**Input:** JSON requires `totalAmount > 0`, `installmentCount` (floored and clamped `1..24`), valid
`frequency: weekly | fortnightly | monthly | custom`, and valid `startsOn: YYYY-MM-DD`.
`depositAmount` clamps to `0..total`; optional `invoiceId`, `lmsPlanId`, uppercase `currency` default
`GBP`, `internalNotes`; snake aliases for numeric/date fields. `custom` currently advances monthly,
the same as `monthly`. Penny remainder is distributed over earliest installments.

**Success:** `201 { plan: TravelPackagePaymentPlan & { installments: TravelPackageInstallment[] } }`.
Existing draft/active plans become `cancelled`; new plan is active and audited. This is not
idempotent: each successful call creates a new plan.

**Errors:** `400` total/frequency/start invalid; `401`; `500` plan/installment persistence.

## Package documents and portals

Document categories are `flight | hotel | transport | visa | e_sim | insurance | invoice |
travel_documents | other`; statuses are `draft | ready_for_review | released | revoked | deleted`.
`travel_documents` is agent-only in the customer portal even if visibility is requested.

### GET `/api/travel-packages/[id]/documents`

**Access:** Active staff session.

**Input:** Path `id`.

**Success:** `200 { documents: TravelPackageDocument[], setupRequired: false }`, excluding soft
deleted rows, newest first.

**Errors:** staff-session `401/403`; `500`; missing schema returns empty success with setup hint.

### POST `/api/travel-packages/[id]/documents`

Uploads a primary object, optional backup, and metadata row.

**Access:** Active staff; 20 uploads per user/IP per hour.

**Input:** `multipart/form-data`, bounded to 1.5 MB file plus 256 KiB form overhead. Required `file`
must be non-empty PDF/JPEG/PNG/WebP whose declared MIME, signature, and extension agree. Optional
`category` (invalid becomes `other`), `title` default safe filename, `customerVisible` string exactly
`true`, `publicNotes`, `internalNotes`, `reservationId`, `metadata` JSON object string. Agent-only
`travel_documents` cannot be customer-visible.

**Success:** `201 { document: TravelPackageDocument, setupRequired: false }`. Primary MinIO write is
required; configured R3 backup is attempted and recorded as `copied` or `failed` without failing the
upload. Visible documents start `released`; others `ready_for_review`. Release summary and audit are
synchronized.

**Errors:** `400` malformed multipart/file/name; staff auth; `404` package; `413` too large; `415`
unsupported/mismatched content; `429`; `503` schema/limiter; `500` storage or metadata. If metadata
insert fails, uploaded objects are cleanup-attempted and the failure is operationally reported.

```text
file=<binary PDF>
category=flight
title=E-tickets
customerVisible=true
publicNotes=Your confirmed flight documents
metadata={"source":"airline"}
```

### PATCH `/api/travel-packages/[id]/documents/[documentId]`

**Access:** Authenticated user.

**Input:** JSON with one or more: non-empty `title`, sanitized `fileName/file_name` (max 140 after
sanitization), `category`, `publicNotes`, `internalNotes`, object `metadata` (shallow merge; null
deletes a metadata key), `customerVisible`, or valid `status`. Releasing stamps actor/time;
revoking/deleting hides it. Agent-only category always forces `ready_for_review`, non-visible.

**Success:** `200 { document: TravelPackageDocument, setupRequired: false }`; folder release summary
and audit synchronize.

**Errors:** `400` invalid JSON/title/status or no updates; `401`; `404`; `503` schema; `500`.

### DELETE `/api/travel-packages/[id]/documents/[documentId]`

**Access:** Authenticated user.

**Input:** Path IDs.

**Success:** `200 { document: TravelPackageDocument, setupRequired: false }`. Soft-deletes metadata,
hides it, and audits; stored objects are retained.

**Errors:** `401`; `503` schema; `500`.

### GET `/api/travel-packages/[id]/documents/[documentId]/signed-url`

**Access:** Authenticated user.

**Input:** Path IDs; query `disposition=inline` or default `attachment`.

**Success:** `200 { url: string, expiresIn: 900 }`; URL reads the current non-deleted object and
expires in 15 minutes.

**Errors:** `401`; `404`; `503` schema; signing/provider failures surface as `500`.

### PATCH `/api/travel-packages/[id]/documents/access`

Enables, disables, or rotates the customer document portal token.

**Access:** Authenticated user.

**Input:** JSON `enabled: boolean`, optional `regenerate: boolean`, `expiresAt: future ISO string`.
When enabling without expiry, default is ten months. Regeneration creates a new 28-character token;
disabling retains the token but nulls expiry and marks release state revoked.

**Success:** `200 { access: { id, document_access_token, document_access_enabled,
document_access_expires_at, document_release_status }, setupRequired: false }`.

**Errors:** `400` invalid JSON/future expiry; `401`; `404`; `503` schema; `500`.

### POST `/api/package-portal/access`

Exchanges package reference and surname for an enabled customer portal token.

**Access:** Public; 10 attempts per normalized reference/IP per 15 minutes.

**Input:** JSON requires `reference` and `lastName` (or `last_name`). Reference is normalized by the
portal helper; surname is trimmed/lowercased, diacritics removed, and limited to letters/apostrophe/
hyphen before constant-time comparison. Proxy IP headers are used only to hash the audit attempt.

**Success:** `200 { token: string }`; records success and a package audit event.

**Errors:** `400` invalid/missing input; `404` no match, disabled access, missing token, or surname
mismatch (deliberately indistinguishable); `410` expired; `429`; `503` limiter; persistence failures
can surface as `500`.

### GET `/api/package-documents/[token]`

Returns the released customer package portal.

**Access:** Public enabled unexpired document token; 60 requests per token/IP per 60 seconds.

**Input:** Path `token`.

**Success:** `200 { package, documents, releasedInvoice, transportVoucher,
signedUrlExpiresIn: 900 }`. Package fields are ID/reference/name/email/type/destination/dates, portal
and release state, public summary, and passport status. Documents are released + customer-visible and
contain identity/category/title/file size/type/status/release/public notes/timestamps plus 15-minute
download/preview URLs. Invoice is the latest released snapshot (or reduced live released fallback).
Voucher is latest released/customer-visible voucher.

**Errors:** `400` empty token; `404` unavailable; `410` expired; `429`; `503` limiter; `500` document
query/signing.

### POST `/api/package-portal/extension-request`

Creates a staff task asking for review of customer document-portal access. It never changes the
access expiry itself.

**Access:** Public with either `Authorization: Bearer <document_access_token>` (expired tokens are
accepted for this request only) or JSON `reference` plus `lastName`/`last_name`. Five attempts are
allowed per credential/IP per hour. Token identities are hashed before use in rate-limit keys.

**Input:** Send an empty JSON object with the bearer credential, or JSON `{ reference: string,
lastName: string }` (with `last_name` also accepted). The body is strict and limited to 2 KiB.

**Success:** `202 { requested: true, alreadyRequested: boolean }`. At most one open,
in-progress, or blocked `portal_access_extension` task exists for the package. A new task also
records a `customer_portal_extension_requested` package audit event. Responses are `no-store` and
do not return package, token, surname, or customer data.

**Errors:** `400` missing/invalid credential; `404` package or surname mismatch; `429`; `503`
limiter, task lookup, or task creation failure.

Customer safety: package responsibility IDs, phone, selected quote snapshot, internal metadata,
storage configuration, risk, internal finance, document storage keys/ETags/backup state/internal
notes, hidden/unreleased documents and invoice lines are excluded. Invoice booked costs/margin/
commission/internal notes are absent. Voucher `internalNotes` and each route assignment's
`supplierName` are removed.

## Third-party document shares

### GET `/api/travel-packages/[id]/third-party-document-shares`

**Access:** Authenticated user.

**Input:** Path `id`.

**Success:** `200 { shares: TravelPackageThirdPartyDocumentShare[], setupRequired: boolean,
message?: string }`, newest first. Hashes are never selected; only the access-code hint is returned.

**Errors:** `401`. Database/schema errors are represented as `200` with empty shares and a message;
`setupRequired` is true only for recognized schema/permission codes.

### POST `/api/travel-packages/[id]/third-party-document-shares`

Creates a single-use credential presentation for a bounded document subset.

**Access:** Authenticated user.

**Input:** JSON optional `label` default `Third-party document access`, `recipientName`, `purpose`,
future `expiresAt` default seven days, and `allowedCategories[]`. Only `flight`, `transport`, `visa`,
`hotel`, `travel_documents` survive filtering; empty/invalid input defaults to all five.

**Success:** `201 { share: TravelPackageThirdPartyDocumentShare, shareUrl: string, accessCode:
string, setupRequired: false }`. The plaintext 6-character code and raw token URL are returned only
on creation; only salted/derived hashes and two-character hint persist. Records a creation event.

**Errors:** `400` invalid JSON/expiry; `401`; `404` package; `503` schema; `500` insert.

### PATCH `/api/travel-packages/[id]/third-party-document-shares/[shareId]`

**Access:** Authenticated user.

**Input:** JSON exactly supports `status: "revoked"`.

**Success:** `200 { share: TravelPackageThirdPartyDocumentShare, setupRequired: false }`; stamps
revoker/time and access event.

**Errors:** `400` invalid JSON/action; `401`; `503` schema; `500` not found/update.

### POST `/api/package-third-party-documents/[token]`

Validates third-party terms and returns allowed documents.

**Access:** Public hashed token + access code + named recipient + accepted terms; 10 attempts per
token/IP per 15 minutes; share must be active and unexpired.

**Input:** JSON requires `accessCode/access_code` (trimmed, uppercased),
`recipientName/recipient_name`, and `acceptedTerms: true`.

**Success:** `200 { share: { id, label, recipient_name, purpose, allowed_categories, expires_at,
terms_text }, package, documents, signedUrlExpiresIn: 900 }`. Package is limited to ID/reference/name,
type/destination/dates/public summary. Documents are restricted to allowed categories, exclude
deleted/revoked, and return the reduced public document DTO plus only metadata keys `documentKind`
(`visa_photo`) and linked travel-document ID/title. Acceptance/access hashes and events are updated.

**Errors:** `400` invalid/missing fields; `401` wrong code (also increments failed counter and logs
denial); `404` share/package unavailable; `410` expired/revoked; `429`; `503` limiter; `500` query or
signing.

Customer safety: no customer contact beyond the package display name, internal notes, storage keys,
backup state, supplier/internal finance, unrestricted metadata, invoice/payment data, or documents
outside the explicit category grant are returned. Unlike the customer portal, a staff-created
third-party grant may intentionally include `travel_documents`.

```json
{
  "accessCode": "AB23CD",
  "recipientName": "Consulate Services Ltd",
  "acceptedTerms": true
}
```

## Transport vouchers

Voucher statuses are `draft | generated | released_to_customer | amended | revoked`.
`voucherData` accepts the `TravelPackageTransportVoucherData` fields: booking/passenger counts and
label, flight/airport/landing details, vehicle/baggage/provider contact, up to 20 itinerary rows
`{ type, description, date, time }`, up to 20 route assignments `{ routeName, type, supplierName?,
vehicleType?, date?, time? }`, selected transport IDs/title, digital/QR URLs, quote snapshot,
arrival/departure airports/times, Makkah/Madinah hotels, up to 20 route strings, transport company,
driver/ground contacts, `publicNotes`, and `internalNotes`. Strings trim; counts clamp non-negative.

### GET `/api/travel-packages/[id]/transport-vouchers`

**Access:** Authenticated user.

**Input:** Path `id`.

**Success:** `200 { vouchers: TravelPackageTransportVoucher[], setupRequired?: boolean, message?:
string }`, highest version first.

**Errors:** `401`; `500`; recognized missing schema returns an empty success with setup hint.

### POST `/api/travel-packages/[id]/transport-vouchers`

Generates the next voucher version and PDF/HTML representation.

**Access:** Authenticated user. Node runtime; maximum handler duration 60 seconds.

**Input:** JSON optional `voucherData/voucher_data` object, `reservationId/reservation_id`, and
`customerVisible/customer_visible`. Voucher data normalizes as above and is enriched with portal/quote
information.

**Success:** `201 { voucher: TravelPackageTransportVoucher, storageWarning: string | null,
renderWarning: string | null, documentWarning: string | null }`. Version increments; rendering and
primary/backup writes create a transport document when storage succeeds. A visible version releases
it and amends/revokes older visible vouchers/documents. Version and audit records are written.
Rendering or primary storage degradation can succeed with warning and no linked document.

**Errors:** `400` invalid JSON; `401`; `404` package; `503` schema; `500` generation/document/voucher
persistence.

### PATCH `/api/travel-packages/[id]/transport-vouchers/[voucherId]`

Edits voucher content or release visibility and refreshes the stored generated file.

**Access:** Authenticated user; Node runtime, 60-second maximum.

**Input:** JSON optional `voucherData/voucher_data` and `customerVisible/customer_visible`. With new
data, fields merge through the normalizer. Without new data, false visibility revokes; true releases.

**Success:** `200 { voucher, storageWarning, renderWarning, documentWarning }`. Updates linked
document/version/audit; releasing revokes older visible vouchers. Stored-file refresh failure is a
warning rather than transaction failure.

**Errors:** `400` invalid JSON; `401`; `404` voucher/package; `500` render/update.

### GET `/api/travel-packages/[id]/transport-vouchers/[voucherId]/preview`

**Access:** Authenticated user.

**Input:** Path IDs.

**Success:** `200 text/html` containing stored rendered HTML; private/no-store, nosniff,
`SAMEORIGIN`, inline filename `transport-voucher-vN.html`.

**Errors:** `401`; `404` voucher or missing rendered HTML.

Customer portal voucher responses remove internal notes and route supplier names. Staff voucher JSON
endpoints retain those fields. The HTML preview is authenticated and may contain passenger,
itinerary, provider, and contact information, so it must not be exposed as a public URL.

## Linked package groups

Group statuses are `draft | active | partially_finalised | finalised | cancelled | completed |
archived`; visibility is `private | linked_notice_only | shared_group_view`. Shared service types are
`transport | guide | ziyarat | other`, statuses `draft | quoted | reserved | confirmed | changed |
cancelled`, and allocation modes `per_passenger | equal_per_package | manual | one_package_pays |
no_split_note_only`.

### GET `/api/travel-package-groups`

**Access:** Authenticated user.

**Input:** Optional query `status` (enum or `all`; omission excludes archived), `packageId`,
`quoteId`. If both IDs are sent, `packageId` takes precedence. Maximum 100 newest groups.

**Success:** `200 { groups: TravelPackageGroup[], setupRequired: false }`.

**Errors:** `400` invalid status; `401`; `500`; missing schema returns empty success with hint.

### POST `/api/travel-package-groups`

**Access:** Authenticated user.

**Input:** JSON requires `title`; optional `leadPackageId/lead_package_id`,
`leadQuoteId/lead_quote_id`, `internalNotes`, object `groupMetadata`, and initial-member
`familyLabel`, `customerDisplayName`, `customerVisible`, object `metadata`. Created group starts
`active`, visibility `linked_notice_only`. If either lead ID exists, creates lead member with sort 10.

**Success:** `201 { group: TravelPackageGroup, setupRequired: false }`.

**Errors:** `400` invalid JSON/title; `401`; `503` schema represented as
`{ group: null, setupRequired: true, message }`; `500`.

### PATCH `/api/travel-package-groups`

**Access:** Authenticated staff user.

**Input:** JSON up to 16 KiB with `ids` (at most 100 package-group IDs) and `action` set to
`archive` or `restore`. Invalid IDs are ignored; at least one valid ID is required.

**Success:** `200 { groups: TravelPackageGroup[], updatedCount: number }`. Archiving stamps
`archived_at`; restoring clears it.

**Errors:** `400` invalid body, IDs, or action; `401`; missing schema returns `503` with
`setupRequired: true`; `500`.

### DELETE `/api/travel-package-groups`

**Access:** Staff user with Admin, Master Admin, or Super Admin role.

**Input:** JSON up to 16 KiB with `ids` containing at most 100 package-group IDs. Invalid IDs are
ignored; at least one valid ID is required.

**Success:** `200 { deletedIds: string[], deletedCount: number }`.

**Errors:** `400` invalid body or IDs; `401`; `403`; missing schema returns `503` with
`setupRequired: true`; `500`.

### GET `/api/travel-package-groups/[id]`

**Access:** Authenticated user.

**Input:** Path `id`.

**Success:** `200 { group, setupRequired: false }`; group includes ordered `members` and
`sharedServices`, each service including its allocations.

**Errors:** `401`; `404`; missing schema returns `200 { group: null, setupRequired: true, message }`.

### PATCH `/api/travel-package-groups/[id]`

**Access:** Authenticated user.

**Input:** JSON any of non-empty `title`, valid `status`, valid
`customerVisibilityMode/customer_visibility_mode`, nullable lead package/quote IDs, internal notes,
object `metadata`. Archiving stamps `archived_at`; leaving archived clears it.

**Success:** `200 { group: TravelPackageGroup, setupRequired: false }`.

**Errors:** `400` invalid/empty update; `401`; `503` schema; `500`.

### POST `/api/travel-package-groups/[id]/flights`

Copies one linked quote's flight structure to every other quote member, or disables future shared
flight presentation for the group. Each target retains its own passenger fares; copied targets have
their saved selection and finalisation fields cleared because their available flight structure has
changed.

**Access:** Authenticated user.

**Input:** JSON up to 4 KB: `{ sourceQuoteId: string, enabled: boolean }`. `sourceQuoteId` is trimmed,
capped at 200 characters, and must identify a quote member of group `[id]`. Only literal `true`
enables sharing; every other `enabled` value (including omission) disables it. Unknown fields are
discarded. Enabling requires the source quote to contain at least one flight option.

**Success:** `200 { enabled, syncedQuoteIds: string[], syncedCount: number }`. Enabling copies the
source flight options to every other quote member, sets group metadata `sharedFlightSelection:
true`, and changes non-private customer visibility to `shared_group_view`. Disabling updates only
that metadata flag and returns an empty sync list; it does not remove previously copied flights or
change customer visibility.

**Errors:** `400` invalid JSON, missing/invalid/non-member source, or no source flight option; `401`;
`404` source quote could not be loaded; `413` body over 4 KB; `503` linked-group schema missing;
`500` query/update failure. Enabling is not a single database transaction: a failure after one or
more target updates can leave a partial copy, and a retry rewrites targets and clears their
selection/finalisation fields again.

```json
{ "sourceQuoteId": "quote-id", "enabled": true }
```

### POST `/api/travel-package-groups/[id]/members`

Adds a member or updates an existing member with the same package/quote key.

**Access:** Authenticated user.

**Input:** JSON requires `packageId` or `quoteId`; optional `familyLabel` default `Family`,
`customerDisplayName`, `isLeadFamily`, `customerVisible`, integer `sortOrder` default `0`, object
`metadata`; snake aliases accepted.

**Success:** New: `201 { member, setupRequired: false }`. Existing: `200 { member, setupRequired:
false, linkedExisting: true }`. This key-based upsert behavior makes retries idempotent.

**Errors:** `400` invalid JSON/missing ID; `401`; `503` schema; `500`.

### PATCH `/api/travel-package-groups/[id]/members`

**Access:** Authenticated user.

**Input:** JSON requires `memberId/member_id`; optional non-empty `familyLabel`, nullable
`customerDisplayName`, booleans `isLeadFamily`, `customerVisible`, integer `sortOrder`; snake aliases.

**Success:** `200 { member, setupRequired: false }`.

**Errors:** `400` missing ID/invalid or no changes; `401`; `503` schema; `500`.

### DELETE `/api/travel-package-groups/[id]/members`

**Access:** Authenticated user.

**Input:** Query `memberId` required.

**Success:** `200 { deleted: true, setupRequired: false }`; physical delete.

**Errors:** `400`; `401`; `503` schema; `500`.

### POST `/api/travel-package-groups/[id]/shared-services`

**Access:** Authenticated user.

**Input:** JSON requires `title`; optional valid `serviceType` default `transport`, `description`,
supplier name/reference, `currency` default `GBP`, finite signed `internalTotalCost`, `customerNote`,
allocation mode (invalid defaults `no_split_note_only`), object `allocationPayload`,
`customerVisible` default `true`, object `metadata`; camel/snake aliases accepted. Invalid numeric
cost input becomes `0`. Status starts `draft`.

**Success:** `201 { sharedService: TravelPackageGroupSharedService, setupRequired: false }`.

**Errors:** `400` invalid JSON/title/type; `401`; `503` schema; `500`.

### PATCH `/api/travel-package-groups/[id]/shared-services`

Updates either an allocation or shared service.

**Access:** Authenticated user.

**Input:** If `allocationId/allocation_id` is present, accepts allocation mode, non-negative integer
`passengerCount`, finite signed `allocatedCost`, `allocatedSaleValue`, internal notes, and object
metadata. Otherwise requires `sharedServiceId`/`serviceId` and accepts title, description,
valid service status, supplier fields, currency, internal total, customer note, allocation mode/
payload, visibility. Camel/snake aliases accepted.

**Success:** `200 { allocation, setupRequired: false }` or
`200 { sharedService, setupRequired: false }`.

**Errors:** `400` missing target/invalid status/no changes; `401`; `503` schema; `500`.

### PUT `/api/travel-package-groups/[id]/shared-services`

Creates a package/quote allocation for a shared service.

**Access:** Authenticated user.

**Input:** JSON requires shared-service ID and either package ID or quote ID. Optional allocation
mode (invalid defaults `no_split_note_only`), passenger count, allocated cost/sale value, internal
notes, object metadata; camel/snake aliases.

**Success:** `201 { allocation: TravelPackageGroupServiceAllocation, setupRequired: false }`.

**Errors:** `400` invalid JSON/missing IDs; `401`; `503` schema; `500`. No idempotency key is
accepted; duplicate allocation constraints, if any, come from the database.

```json
{
  "sharedServiceId": "service-id",
  "packageId": "package-id",
  "allocationMode": "per_passenger",
  "passengerCount": 4,
  "allocatedCost": 180,
  "allocatedSaleValue": 240
}
```

### DELETE `/api/travel-package-groups/[id]/shared-services`

**Access:** Authenticated user.

**Input:** Query either `allocationId` or `sharedServiceId`/`serviceId`. Allocation takes precedence.

**Success:** `200 { deleted: true, setupRequired: false }`; physical delete.

**Errors:** `400` no target; `401`; `503` schema; `500`.

Customer safety: these staff endpoints include internal service costs, allocations, internal notes,
supplier identities, and metadata. The public quote group DTO includes only the group
reference/title, shared-flight flag, and customer-visible family quote labels/projected data; it does
not return the group ID, visibility mode, member quote IDs/contact data, or these staff records.

## Backup, migration, and pricing

### GET `/api/travel-packages/backups/reconcile`

**Access:** Super Admin.

**Input:** None.

**Success:** `200 { configured: boolean, pending: number, failed: number, copied: number }`.

**Errors:** Super Admin auth `401/403`. This handler does not distinguish count-query errors from an
actual zero; an affected count is returned as `0`.

### POST `/api/travel-packages/backups/reconcile`

Copies pending/failed primary package objects to configured R3 backup.

**Access:** Super Admin; maximum handler duration 300 seconds.

**Input:** Optional JSON `{ limit?: number }`, clamped `1..100`, default `25`.

**Success:** `200 { processed, copied, failed, results: { id, status: copied | failed, error? }[] }`.
Each row is updated independently; per-object failure is reported in results rather than failing the
batch. Repeating reconciles only pending/failed rows and is safe.

**Errors:** Super Admin auth; `503` R3 not configured; `500` initial query.

### GET `/api/travel-packages/migration/status`

**Access:** Super Admin.

**Input:** None.

**Success:** `200 { configuration: { firebase, sourceStorage }, counts: { migrationRecords,
importedPackages, migratedDocuments, failedBackups }, runs, records }`; last 10 runs and 100 map
records.

**Errors:** Super Admin auth. Individual status-query errors are not exposed; their data/count fields
fall back to empty arrays or zero.

### POST `/api/travel-packages/migration/scan`

Tests legacy integrations or pages through legacy customer summaries.

**Access:** Super Admin.

**Input:** JSON optional `action: "test" | string` (only exact `test` selects connection test;
otherwise scan), `limit` clamped `1..100` default `50`, `pageToken?: string`.

**Success:** Test: `200 { connections }`. Scan: `200 { customers: { id, referenceNumber,
customerName, packageType, destination, status, archived, documentCount }[], summary: {
customerCount, documentCount, missingReferences, missingLastNames }, nextPageToken }`.

**Errors:** Super Admin auth; `502` legacy connection/scan.

### POST `/api/travel-packages/migration/import`

Runs a bounded legacy import page.

**Access:** Super Admin; maximum handler duration 300 seconds.

**Input:** JSON required. `dryRun: boolean` forces mode `dry_run`; otherwise `mode: sample | full |
retry | dry_run` default `sample`; `limit` defaults 5 for sample, otherwise 25, capped at 5 for
sample and 50 otherwise; optional `pageToken`. Retry filters the fetched page to failed/partial map
IDs.

**Success:** `200 { run, nextPageToken }`; run includes status (`completed` or
`completed_with_errors`), imported/skipped/failed and document counts, report `{ results,
nextPageToken, dryRun }`, completion timestamp. A migration-run record is created even for dry-run;
dry-run prevents customer persistence inside the importer.

**Errors:** `400` invalid JSON/mode; Super Admin auth; `502` legacy read; `500` run creation. Item
failures are accumulated in the successful run report.

```json
{ "mode": "sample", "limit": 5, "pageToken": "opaque-source-cursor" }
```

### GET `/api/pricing/umrah-transport`

Returns active transport pricing reference data.

**Access:** Authenticated user.

**Input:** None.

**Success:** `200 { routes, suppliers, vehicles, rates, labels, sarToGbpExchangeRate,
damageRecoveryMarginMode: fixed | percent, damageRecoveryMarginValue, setupRequired: false }`.
Route fields: `id, route_name, is_active, sort_order`; supplier: `id, name, default_currency,
is_active, sort_order`; vehicle: `id, label, passenger_capacity, is_active, sort_order`; rate:
`route_id, supplier_id, vehicle_type_id, currency, cost_price, is_active` (positive active only);
label: `supplier_id, vehicle_type_id, transport_label, is_active`. Invalid numeric settings become
zero; any mode other than `percent` becomes `fixed`.

**Errors:** `401`; `500`; missing schema returns the same shape with empty arrays, zero/fixed
settings, `setupRequired: true`, and a migration hint.
