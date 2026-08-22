# Ticketing Module Plan

> **Partial implementation record and remaining roadmap.** This document replaces the March 2026
> brainstorm. The database foundation and TK-only My Sales Ledger are implemented; later Ticketing
> workflows described here remain proposals until their code, migrations, and tests are shipped.

- **Status:** Foundation and first operational slice implemented — TK-only My Sales Ledger
- **Last updated:** August 22, 2026
- **Owner:** PT-Portal Team

### Implementation checkpoint — August 22, 2026

- Connected to and inspected the linked Supabase schema without reading customer rows before any
  database change.
- Confirmed the legacy Ticketing and commission tables are empty, while package operations already
  use `travel_packages` and `travel_package_reservations`.
- Confirmed the legacy service enum does not contain `R-ER`, the legacy package foreign key targets
  `packages`, and the relevant anonymous grants/RLS posture must be replaced.
- Added and deployed the idempotent foundation migration
  `scripts/migrations/20260822_create_ticketing_commission_foundation.sql`, verified live capability
  version `20260822`, and refreshed `types/supabase.generated.ts`.
- Added the TK quick-entry migration
  `scripts/migrations/20260822_create_ticketing_quick_tk.sql`, which raises the required Ticketing
  capability to `2026082201`. It provides one atomic, service-role-only, idempotent operation for
  Held/Issued TK creation, agency-wide airline/PNR duplicate confirmation, automatic package
  matching, owner alignment, starter airlines, audit evidence, and issued Commission source
  variables.
- Replaced the sales-ledger placeholder with a keyboard-first TK quick-entry form and an agent's
  own latest ledger records. Ticketing department membership grants own-ledger access; approved
  oversight roles pass the module guard, while this route still intentionally returns only the
  authenticated agent's records. The ledger does not present calculated commission or profit.
- Added focused route, authorization, component, and disposable PostgreSQL 16 integration coverage
  for the first slice, including retry, rollback, duplicate privacy, package matching, grants, and
  capability checks.
- **Still future:** DC/R-ER entry and completion details, Low Fare, Ticket Vouchers, Sales Targets,
  team Flight Monitoring, Refunds & Claims, and the native cancellation calculator.

## 1. Summary

Ticketing should be a native PT-Portal operations and financial module, not a direct copy of the
existing spreadsheet. Agents need a very fast personal sales ledger, while the system separately
preserves passenger fares, later ticket details, fare adjustments, refunds, vouchers, issued-ticket
metrics, and flight history.

The module will provide:

- **My Sales Ledger** for quick TK, DC, and R-ER entry.
- **Low Fare Queue** shared across ticketing agents.
- **Refunds and Claims** with company profit/loss reporting.
- **Ticket Vouchers** for cancelled tickets awaiting an airline claim or reuse.
- **Sales Targets** showing non-financial weekly and monthly issued-ticket progress.
- **Flight Monitoring** containing upcoming flights from every agent, without exposing unrelated
  financial or commission information.

Ticketing records the source variables needed by the separate Commission module. It does not own
commission structures, calculate or display commission in the sales ledger, or show agent/company
profit in ledger rows.

The existing plan's invented 24-hour time-limit grace period is removed. An unissued booking
expires at its entered airline time limit. The existing flat `ticket_ledger` schema and dormant
commission tables are migration inputs, not sufficient contracts for the new module.

## 2. Locked business decisions

### 2.1 Access and ownership

- Agents see and maintain their own sales ledger, refunds, vouchers, and non-financial target
  progress.
- The Low Fare Queue is shared. Any ticketing agent may record a fare adjustment against a ticket
  in the queue; Ticketing records that agent as the actor and the Commission module decides the
  resulting treatment.
- Flight Monitoring shows operational flight data for all agents and provides an agent filter.
- Manager, Admin, Master Admin, and Super Admin roles can see all ticketing records, resolve
  package matches, make financial corrections, and review team target progress. Commission-policy
  and statement permissions belong to the Commission module.
- Maintenance Admin receives no ticketing-finance privilege by default.
- Agents may edit their own draft or held records. Once a ticket is issued and paid, financial
  corrections are append-only Manager/Admin adjustments; historical values are not silently
  rewritten.

### 2.2 Commission-variable contract

- Ticketing owns operational facts only. It must not hard-code rates, select a commission formula,
  create statements, or calculate/display an agent's commission or company profit in the ledger.
- On every relevant state change, Ticketing emits a versioned, idempotent source event for the
  Commission module containing variables rather than a calculated amount.
- Core variables include source event/transaction IDs, acting and owning employee IDs, location,
  service type, issued/paid/cancelled/refunded timestamps and states, passenger-ticket count,
  source/GBP sale and supplier costs, original/new fare and GBP difference, package link/type, and
  package-exemption state.
- "Passenger-ticket count" means issued passenger tickets, not PNRs. Three passengers issued under
  one PNR emit a count of three.
- TK, DC, and R-ER remain separate service variables. The Commission module may configure any of
  them as fixed, percentage-based, combined, or zero without a Ticketing code change.
- Low-fare adjustments emit the signed difference and acting agent. Refunds emit source values and
  preserve the original event identity; only the Commission module decides whether earnings remain,
  reverse, or adjust.
- Package-matched events include the matched package/reservation IDs and package type so the
  Commission module can use package-level rules instead of ticket-level rules.
- The authoritative cross-module design is documented in
  [Commission Module Plan](COMMISSION_MODULE_PLAN.md).

### 2.3 Package-ticket exemption

- A ticket PNR is normalized and matched against `travel_package_reservations.booking_reference`
  for flight reservations.
- A match to an active **Umrah**, **Holiday**, or **Ziyarat** package automatically marks the
  ticket as a package item and emits `commission_scope=package`. These are the package types
  currently supported by the native Packages module; any future type needs an explicit scope rule
  before Ticketing treats it as exempt.
- The match stores the package and reservation IDs; no agent-entered exemption checkbox is used.
- A matched package may prefill customer, passenger, and itinerary context. Ticket status and
  ticketing variances are visible from the package workspace, but Ticketing does not overwrite
  package invoice or reservation amounts in the first release.
- Positive and negative fare differences on a package ticket are surfaced as package profitability
  variables rather than pre-calculated ticketing earnings.
- Package commission remains authoritative for every ticket sale, change, cancellation, reissue,
  refund, and fare variance attached to that package. Per-agent package policies must support a
  fixed amount based on package passenger count or a percentage of final package profit.
- Package and ticket PNR changes both rerun matching. A late match emits a versioned correction to
  the Commission module, which owns any void or compensating statement entry.
- If one PNR matches multiple packages in the same linked package group, the group is treated as
  one valid match. Multiple unrelated matches emit an unresolved scope so the Commission module can
  hold calculation until Manager/Admin resolves the link.

### 2.4 Currency and time

- GBP is the default base currency for emitted financial variables.
- Other ISO currencies may be stored. Each non-GBP supplier cost, customer payment, refund,
  recovery, or voucher use also requires the actual settled GBP amount; the portal does not
  calculate or store a synthetic exchange rate.
- Downstream P&L and commission calculations use actual GBP settlement values. Original-currency
  values stay visible for reconciliation.
- Timestamps are stored as `timestamptz`/UTC. Entry and display use the employee's branch timezone,
  defaulting UK branches to `Europe/London` with daylight-saving support.
- Add an IANA timezone to each location and allow a per-booking or per-sector override when the
  operational timezone differs from the branch default. Store the timezone identifier used for
  entry alongside each deadline or sector.

## 3. User experience and workflows

### 3.1 Ticketing dashboard

Replace the current placeholder cards with these mini modules:

| Module           | Agent view                                      | Manager/Admin addition                       |
| ---------------- | ----------------------------------------------- | -------------------------------------------- |
| My Sales Ledger  | Own TK/DC/R-ER records and quick entry          | All-agent ledger and correction queue        |
| Low Fare         | Shared fare-check queue and own adjustments     | All adjustments and attribution correction   |
| Refunds & Claims | Own refunds and airline claims                  | Team P&L, approvals, and unresolved recovery |
| Ticket Vouchers  | Own unclaimed/reusable cancelled tickets        | Team expiry and recovery oversight           |
| Sales Targets    | Weekly/monthly issued-ticket progress, no money | Set/review team targets in Commission module |

Dashboard summaries should show the current agent's open time limits, issued-but-unpaid items,
weekly/monthly issued-ticket target progress, refund recovery pending, and vouchers nearing expiry.
Manager/Admin can switch operational and target summaries to a team view.

The Sales Ledger never displays commission, earnings, margin, or company profit columns, badges,
totals, or tooltips. Financial inputs required for later reconciliation remain editable only where
operationally necessary. Earnings and commission statements live exclusively under
`/dashboard/commissions`.

Flight Monitoring remains a full-width dashboard section and always reads all agents' active
itineraries. It shows owning agent, lead passenger, PNR, contact number, flight/route, local
departure time, passenger count, and schedule status. It does not show fare, refund, P&L, or
commission figures.

### 3.2 Sales targets

- Manager/Admin sets each agent's weekly and monthly ticket target in the Commission module. The
  Ticketing dashboard consumes only a read-only progress DTO: target, completed, remaining,
  percentage, period dates, and achieved state.
- The default metric counts TK passenger-tickets exactly once when their operational state first
  becomes Issued. One PNR with three issued passengers adds three; creating the PNR or marking it
  Paid adds nothing.
- DC, R-ER, low-fare, refund, and voucher events do not inflate the default issued-ticket sales
  target. The Commission module may define a separate target metric later without changing the
  Ticketing ledger.
- Package-linked TK passenger-tickets count toward the issued-ticket target even though their
  earnings use the package commission structure.
- Cancellation or refund after genuine issuance does not remove target credit. A privileged
  correction proving that issuance was recorded in error emits a reversal event and removes it.
- Weekly periods default to Monday-Sunday and monthly periods to calendar months in the agent's
  branch timezone. Target assignments are effective-dated so changing a future target does not
  rewrite completed periods.
- Agent cards show a progress bar, completed/target count, remaining tickets, period end, and an
  achieved state. They show no commission, earnings, sales margin, or profit.

### 3.3 Keyboard-first quick entry

The ledger's first row is a compact entry surface designed for Tab and Enter navigation. It uses
one save action and immediately resets for the next record.

Minimum quick-save fields:

1. Main passenger/customer name.
2. PNR.
3. Airline code.
4. Service type: TK, DC, or R-ER.
5. Booking date.
6. Airline time limit for a held booking, or issued date for an already-issued entry.
7. ADT, CHD, and INF groups, each with quantity and fare cost when its quantity is non-zero.

Fast-entry defaults:

- Agent comes from the authenticated staff session and is never accepted from the browser as the
  acting user.
- Booking date defaults to today in the operational timezone.
- Payment defaults to Unpaid; passenger mix defaults to one ADT.
- Currency defaults to GBP.
- Airline is an autocomplete by IATA code, retaining recent selections.
- Return date, contact number, departure details, sale prices, individual passenger names, and
  ticket numbers can be completed after the quick save.

Completion rules:

- A held booking requires a time limit.
- Marking a transaction Issued requires an issued date and at least one passenger.
- Marking it Paid requires complete grouped buy/sale values and actual GBP values for any non-GBP
  movement.
- Issued, payment, passenger-count, fare, and package-match changes emit source variables; Ticketing
  does not decide whether or when commission posts.
- Flight Monitoring requires at least one completed itinerary sector; departure/return dates alone
  may appear in a separate "details incomplete" queue.

Useful speed behaviours:

- Tab moves through fields; Enter saves from the final field; Escape clears an unsaved row.
- Saving keeps the current filters and focus position.
- Reusing an existing PNR offers to attach a new DC or R-ER transaction and prefills customer,
  passenger, airline, and current itinerary data.
- Duplicate TK entries for the same airline/PNR receive a blocking confirmation with the existing
  record link.
- Agents can clone the previous passenger mix and currency but never its PNR, customer, or money.
- Validation is inline; successful saves use a toast and do not open a modal.

### 3.4 Booking and transaction lifecycle

A booking represents the customer/PNR and current itinerary. Its ledger contains immutable service
transactions:

- **TK** creates the initial ticket sale or hold.
- **DC** creates a new date-change transaction linked to the same booking.
- **R-ER** creates a reissue transaction linked to the same booking.
- DC and R-ER never overwrite the original TK financial event. They may update the booking's
  current itinerary after the new transaction is issued.

Operational states are Draft, Held, Issued, Expired, Cancelled, and Refunded/Part Refunded. Payment
states are Unpaid, Part Paid, and Paid and remain independent of operational status.

An unissued Held booking becomes Expired exactly at its airline time limit. There is no 24-hour
grace period. The owning agent receives in-app and email warnings at 24 hours, 6 hours, and 2 hours
before expiry, followed by one expiry notification. Notification delivery is idempotent.

### 3.5 Passenger fares and later details

Quick entry stores one grouped line for each non-zero passenger type:

- Passenger type: ADT, CHD, or INF.
- Quantity.
- Unit fare cost and unit sale price when known.
- Computed source-currency and GBP totals.

The completion drawer allows individual passengers to be added later with name, passenger type,
ticket number, contact details where different, and optional per-passenger cost override. Grouped
totals must reconcile with individual passenger assignments before a refund or voucher is attached
to an individual ticket. The main passenger name remains available even while the passenger list is
incomplete.

### 3.6 Low Fare Queue

The queue contains eligible issued tickets from all agents and supports PNR, airline, departure,
owner, and last-checked filters. It exposes only the operational and fare information needed to
perform a fare check; it exposes no commission, earnings, margin, or company-profit information.

An adjustment records original fare, new fare, issue/reissue date, acting agent, source currency,
actual GBP values, and notes. The original fare is a server snapshot of the current active fare, not
a caller-trusted value.

For GBP values:

```text
difference = original fare - new fare
```

The adjustment appends history and then becomes the active fare; it never deletes or rewrites an
earlier adjustment. Ticketing emits the signed difference, acting agent, passenger count, and
package-match variables. The Commission module alone decides whether the event creates a credit,
debit, or no entry. Manager/Admin may correct acting-agent attribution through an audited source
correction event.

### 3.7 Refunds and company loss

Refunds are append-only events linked to the affected transaction and, when known, its passenger or
ticket number. Capture:

- Customer amount refunded and actual GBP paid.
- Airline gross entitlement, airline penalty, and actual net airline recovery when confirmed.
- Other supplier or processing fees.
- Claim status and dates.
- Reason, notes, and supporting reference.

#### Native cancellation calculator

Integrate the company's existing
[Ticket Cancellation Calculator](https://github.com/Hiro-Vasilias/ticket-cancellation-calculator)
as a native PT-Portal calculation, not an iframe or separately deployed app. Extract the confirmed
business rules into a pure, server-tested TypeScript function and rebuild the input/result UI using
the portal's components.

For one passenger-ticket, define:

```text
S = original ticket sale price
B = original supplier ticket cost
A = airline cancellation fee
C = supplier cancellation charge
K = retained posted agent commission
M = desired company markup/profit

minimum cancellation charge for company net £0 = A + C + K
total cancellation charge                        = A + C + K + M
customer refund                                  = S - total cancellation charge
expected airline recovery                        = B - A
final company cancellation result                = M
```

The final-result identity assumes the airline recovery and customer refund settle at the calculated
values and there are no other costs. Actual P&L continues to use settled refund/recovery events.

The calculator should:

- Prefill sale price and supplier ticket cost. Resolve `K` server-side from the Commission module's
  immutable source-event result; do not accept it from the browser or calculate it in Ticketing.
- Ask for airline cancellation fee, supplier cancellation charge, and desired company markup.
- Show the net-zero cancellation charge, proposed total charge, customer refund, expected airline
  recovery, and expected company result.
- Use `K` inside the total without adding commission or profit columns to the Sales Ledger. The
  agent-facing calculator may show the total required cancellation charge; detailed commission
  attribution remains in the Commission module and Manager/Admin audit views.
- Allow the user to target either net £0 or a positive company result by changing the markup.
- Never return a negative customer refund. If costs exceed the sale price, show the shortfall and
  require Manager/Admin review before a refund event is saved.
- Treat the calculation as a preview until the user explicitly records the refund. Saving stores all
  inputs, outputs, acting user, formula version, and resulting claim/voucher state.
- Keep the supplier's reissue charge out of the cancellation calculation. Record that charge only
  if the ticket credit is later reused/reissued; it then affects the new transaction or linked
  package profitability.
- For package tickets, emit the cancellation/reissue cost and package-match variables. The
  Commission module applies the package's fixed-per-passenger or profit-percentage policy.

Unknown airline recovery is `null`, not zero. Until it is confirmed, the UI labels company P&L as
pending rather than presenting a false final loss.

```text
refund cash impact = net airline recovery - customer refund - other refund costs

ticket lifecycle result = customer receipts - supplier ticket costs
                          + refund cash impact - posted agent commission
```

The refund event preserves its link to the original issued event; the Commission module owns the
rule that keeps the original earning posted. Agents see the operational refund and claim status;
company P&L and team totals are limited to Manager/Admin views and never appear in the Sales Ledger.
Package-linked refunds are also surfaced in the package workspace without overwriting released
package invoices.

### 3.8 Cancelled-ticket vouchers and claims

Cancelling an issued ticket that has no completed airline refund creates an unclaimed voucher/claim
record. This record represents a right to approach or reuse with the airline; it does not invent a
monetary asset value.

Initial fields:

- Source booking, transaction, passenger, ticket number, PNR, and airline.
- Owning agent and follow-up owner.
- Ticket issue date, cancellation date, and claim-by date.
- Notes and airline/supplier reference.
- Confirmed value and remaining value set to `null`.

The claim-by date defaults to 11 calendar months after the original issue date. Manager/Admin can
correct it for airline-specific rules with an audit reason. Owners receive in-app and email reminders
at 90, 30, and 7 days before the claim-by date and one expiry notice.

Statuses are Unclaimed, Claim Submitted, Airline Credit Confirmed, Part Used, Used on New Ticket,
Refund Received, Expired, and Closed. The airline-confirmed amount is entered only when known. From
that point, reuse/refund events allocate the confirmed amount, may be partial, and calculate a
remaining balance. Reuse must link to a new ticket from the same airline; a mismatch is blocked.

## 4. Data and service design

### 4.1 Schema strategy

Use a committed, idempotent migration under `scripts/migrations/`. The generated schema currently
contains `ticket_ledger`, `airlines`, `commission_rules`, `commission_rate_components`,
`commission_tiers`, and `employee_commission_assignments`, but the repository has no operational
Ticketing migration/API using them. Ticketing migrations must not redesign those commission tables;
their reconciliation belongs to the Commission module plan.

The normalized module will use:

| Table                         | Responsibility                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `ticket_bookings`             | PNR/customer owner, current lifecycle, package match, and current itinerary summary                |
| `ticket_transactions`         | Immutable TK/DC/R-ER financial and issuance events                                                 |
| `ticket_passenger_fare_lines` | Grouped ADT/CHD/INF quantities and source/GBP buy/sale values                                      |
| `ticket_passengers`           | Later passenger names, types, ticket numbers, and per-person allocation                            |
| `ticket_itinerary_sectors`    | Flight numbers, airports, local/UTC times, timezone, and active schedule                           |
| `ticket_schedule_events`      | Marked, reviewed, and finalised manual schedule changes                                            |
| `ticket_fare_adjustments`     | Low/higher fare history and acting-agent attribution                                               |
| `ticket_refunds`              | Customer refund, airline recovery, fees, calculator/formula snapshot, claim status, and P&L inputs |
| `ticket_vouchers`             | Claim entitlement, deadline, confirmed value, remaining value, and status                          |
| `ticket_voucher_events`       | Submission, confirmation, partial use, refund receipt, expiry, and closure                         |
| `ticket_package_links`        | PNR-derived package/reservation links and match resolution                                         |
| `ticket_audit_events`         | Before/after metadata for every privileged correction or lifecycle event                           |
| `ticket_notification_events`  | Idempotent time-limit and voucher reminder delivery records                                        |

Do not delete the existing `ticket_ledger` in the first release. Backfill any existing rows into the
new model with a migration map, then stop new application writes to the legacy table. Excel history
will not be imported; PT-Portal starts fresh for operational use.

Ticketing's transactional write functions also append immutable, versioned rows to the Commission
module's `commission_source_events` contract. They emit variables only and never store a calculated
commission amount in Ticketing tables.

Upgrade `airlines` with an active flag and case-insensitive unique IATA code. Manager/Admin may add
or deactivate an airline without deleting historical references.

Add `locations.timezone` with an `Europe/London` backfill/default for current UK locations. Validate
all stored timezone identifiers against the supported IANA list.

### 4.2 Package PNR reconciliation

Persist a normalized PNR on bookings and package flight reservations. Normalization trims input,
uppercases it, and removes internal whitespace; it does not perform fuzzy matching.

Run the same reconciliation function when:

- A ticket booking/PNR is created or changed.
- A package flight reservation/booking reference is created or changed.
- A package type or archive/status state changes.

The function creates or retires `ticket_package_links`, determines exemption, and returns an
ambiguity state. Ticket issuance may continue while a match is ambiguous, but the source event must
carry the unresolved state. Link creation/correction and its emitted Commission source event must be
atomic.

### 4.3 Money contract

Every financial movement stores:

- ISO source currency.
- Source amount.
- Actual GBP settlement amount.

For GBP, the source and GBP values are identical and the UI fills both. For non-GBP, GBP settlement
is explicitly entered and required before the movement can emit complete downstream calculation
variables. Derived totals round to two decimals in PostgreSQL using numeric types; JavaScript
floating-point values are never the financial source of truth.

### 4.4 API surface

Use resource-based staff APIs rather than the old proposed `/add`, `/list`, and `/low-fare` action
routes:

- `GET/POST /api/ticketing/bookings`
- `GET/PATCH /api/ticketing/bookings/{id}`
- `POST /api/ticketing/bookings/{id}/transactions`
- `GET/POST/PATCH /api/ticketing/bookings/{id}/passengers`
- `GET/POST/PATCH /api/ticketing/bookings/{id}/sectors`
- `GET/POST /api/ticketing/fare-adjustments`
- `POST /api/ticketing/refunds/preview` and `GET/POST /api/ticketing/refunds`
- `GET/POST/PATCH /api/ticketing/vouchers` and
  `/api/ticketing/vouchers/{id}/events`
- `GET /api/ticketing/flight-monitor`
- `GET /api/ticketing/targets/progress` as a read-only projection from the Commission module
- `GET/POST/PATCH /api/ticketing/airlines`

All routes must:

- Resolve the actor and employee ID from `requireStaffSession`; never trust caller-supplied acting
  or owner IDs.
- Apply the own-record/team-oversight rules on the server, even when a UI control is hidden.
- Use strict request schemas, bounded pagination, ISO dates/currencies, and semantic response DTOs.
- Use idempotency keys for quick create, issuance/payment posting, fare adjustment, refund, voucher
  events, source-event emission, and reminder delivery.
- Perform multi-table financial changes through transactional PostgreSQL functions with unique
  source constraints so retries cannot duplicate operational or Commission source events.

### 4.5 Audit and deletion policy

- Draft records may be archived; posted financial events are never hard-deleted through the app.
- Corrections create offset/replacement entries and record actor, timestamp, reason, and before/after
  values.
- Customer contact, ticket number, fare, refund, voucher, and commission fields remain internal and
  are never returned by public package routes.

## 5. Delivery plan

### Phase 0: Tooling and live Supabase verification — complete

- Connect to the intended linked Supabase project before designing or applying Ticketing DDL. Use
  the configured credentials without printing secrets, tokens, connection strings, or customer
  data.
- Inspect the live `ticket_ledger`, `airlines`, employee/location, package reservation, commission,
  accounting, RLS policy, grant, enum, function, trigger, and index definitions. Compare live schema
  with `scripts/migrations/`, `types/supabase.generated.ts`, and `types/supabase.ts`; record and
  resolve drift instead of assuming generated types are current.
- Install every program, CLI, package, browser driver, database client, or diagnostic add-on needed
  to implement and verify the module. At minimum verify the repository Node dependencies, Supabase
  CLI, PostgreSQL client/test tooling, and Playwright browser support. Do not skip a required check
  because a tool is missing; install it, or request the necessary approval and report a genuine
  blocker.
- Add justified runtime/development dependencies through the project package manager and review the
  lockfile. Do not use untracked global tooling as an undocumented release dependency.
- Create schema changes as reviewed, idempotent migrations. Test them first against disposable
  PostgreSQL/staging, then apply them to the intended Supabase project through the deployment
  workflow; do not issue ad hoc production DDL from an API route.
- Regenerate linked types with `npm run types:supabase` after the migration is applied and remove any
  obsolete type overlay. Implementation does not begin from an unverified schema snapshot.

### Phase 1: Foundation — complete for the first operational slice

- Add the normalized schema, RLS/service-role policies, strict TypeScript contracts, airline
  normalization, location timezones, package PNR reconciliation, and legacy-ledger backfill.
- Add tested domain functions for money, time-limit status, package exemption, refund P&L, fare
  differences, issued passenger-ticket metrics, and versioned Commission source-event emission.
- Seed/configure active airlines and branch timezones.

### Phase 2: Sales ledger and flight operations — partially implemented

- **Implemented:** replace the ledger placeholder with keyboard-first Held/Issued TK quick entry,
  grouped ADT/CHD/INF supplier fares, own-record search/status filters, duplicate confirmation, and
  package-match status. The API and database operation use verified actor identity and idempotency.
- **Future:** add DC/R-ER entry against an existing PNR, the completion drawer, customer contact,
  sale/payment details, passenger details, ticket numbers, and itinerary sectors.
- Connect the dashboard's all-agent Flight Monitoring, manual schedule-change workflow, and
  24/6/2-hour time-limit reminders.
- Add Manager/Admin all-agent ledger and correction tools.

### Phase 3: Targets and low fare — future

- Add the shared Low Fare Queue, signed fare-difference source variables, and audited attribution
  corrections without calculating or displaying commission.
- Connect issued TK passenger-ticket events to Commission-owned weekly/monthly targets and show the
  read-only non-financial progress card in Ticketing.
- Verify that Ticketing emits every variable required by the separate Commission module plan.

### Phase 4: Refunds, vouchers, and package views — future

- Port the company cancellation calculator into a versioned, server-tested native calculation;
  replace the refund placeholder with its preview/save workflow, the refund register, airline
  recovery lifecycle, company P&L, and commission-preservation rules.
- Add voucher creation, claim/reuse events, unknown-to-confirmed value workflow, expiry reminders,
  and same-airline enforcement.
- Surface ticket status, linked refunds, vouchers, and fare variances in the matched package view
  without mutating released package financial records.

### Phase 5: Hardening and rollout — future

- Run authorization, concurrency, accessibility, responsive layout, email deduplication, DST, and
  large-ledger performance testing.
- Pilot with a small agent group and verify one issued-ticket target period, refund, voucher claim,
  package match, positive low fare, and negative fare adjustment source event.
- Enable the module for all agents only after the Commission module accepts the source contract and
  Manager/Admin confirms target assignments. Existing spreadsheets remain read-only archives rather
  than import sources.

## 6. Test and acceptance plan

### Domain and database tests

- ADT/CHD/INF totals reconcile for one and multiple passenger groups.
- Non-GBP transactions remain incomplete until actual GBP settlement values are entered; GBP
  calculations never infer an exchange rate.
- A held ticket expires exactly at the airline time limit in Europe/London and non-UK branch zones,
  including both daylight-saving transitions.
- Time-limit emails are emitted once at 24/6/2 hours and once at expiry.
- Three TK passengers emit one idempotent issued event with `passenger_ticket_count=3`; payment,
  refund, or cancellation does not duplicate the issued-target count.
- The default weekly/monthly target counts issued TK passenger-tickets, includes package tickets,
  excludes DC/R-ER/low-fare/refunds, and reverses only an erroneous issuance correction.
- TK, DC, R-ER, low-fare, refund, package-match, and package-correction events emit complete,
  versioned variables without a calculated commission amount.
- Exact package PNR matches emit package scope/type; ambiguous unrelated matches emit unresolved
  scope; late corrections preserve event lineage.
- An unclaimed voucher starts with no monetary value, defaults to issue date plus 11 months, and
  becomes allocatable only after airline confirmation.
- Voucher use rejects a different airline and maintains correct remaining value across partial
  events.
- Refund P&L remains pending while airline recovery is unknown and becomes exact once settled.
- The cancellation calculator produces net £0 when markup is zero, produces markup as expected
  final company profit, keeps reissue supplier cost separate, and reports rather than returns a
  negative customer refund.

### API and permission tests

- An agent cannot list, edit, or refund another agent's private record through direct API calls.
- The shared Low Fare Queue and Flight Monitoring return only their intentionally shared fields.
- The acting agent is always session-derived, including cross-agent low-fare adjustments.
- Manager/Admin can perform audited corrections and team actions; Maintenance Admin cannot.
- Duplicate requests and concurrent issue/payment/fare/refund submissions do not double-create a
  transaction, source event, target count, voucher allocation, or notification.
- Public package endpoints never expose ticketing financial/customer-internal fields.

### UI acceptance

- A trained agent can enter the minimum ticket record using only the keyboard and immediately start
  the next row.
- An existing PNR prefills a DC/R-ER transaction without overwriting the original TK.
- Agents can complete grouped passenger details later and see a clear incomplete-state queue.
- Flight Monitoring includes flights from every agent, supports agent/date/status filters, and
  displays each time in the correct operational timezone.
- Agents see weekly/monthly issued-ticket target progress without commission, earnings, margin, or
  profit anywhere in the Ticketing ledger/dashboard.
- Manager/Admin can trace every financial total back to its ticket/refund/fare event and audit
  history.

### Repository validation

Run at minimum:

```bash
npm run typecheck
npm run lint
npm run format:check:changed
npm run docs:check
npx vitest run --maxWorkers=4
npx next build --webpack
```

Add focused migration/SQL tests for atomic source-event emission and idempotency, unit tests for all
domain calculations, component tests for keyboard entry/target visibility, route tests for every
access boundary, and a Playwright smoke flow covering TK entry through issued-target progress.

## 7. Explicit first-release boundaries

- No import of the historical Excel workbook; operational records start fresh.
- No live airline/flight-status provider. Flight status and schedule changes are entered manually.
- No automatic foreign-exchange conversion or rate lookup.
- No commission-policy, statement, or payout UI inside Ticketing; those belong to the Commission
  module.
- No automatic airline claim submission or settlement integration.
- No automatic mutation of package invoices or booked/sold reservation amounts.
- No customer-facing ticketing portal or customer reminder messages.
- No hard deletion of posted financial history.

## 8. Success criteria

The module is ready for general use when:

- Agents can enter minimum ticket data faster than the current spreadsheet workflow and complete
  detail later without losing financial accuracy.
- Each agent sees their own ledger and issued-ticket targets, while the Low Fare Queue and flight
  monitor provide the agreed shared operational visibility.
- The Ticketing ledger contains no commission/profit presentation, and every downstream calculation
  variable can be explained from immutable source events.
- Cancelled tickets remain visible until claimed, reused, or expired even when the airline value is
  initially unknown.
- Manager/Admin can trace issued-target counts back to passenger-ticket issuance events.
- Package PNR matches emit the correct commission scope without requiring agents to remember an
  exemption checkbox or Ticketing to know the applicable rate.
