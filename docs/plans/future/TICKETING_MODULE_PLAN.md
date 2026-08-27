# Ticketing Module Plan

> **Partial implementation record and remaining roadmap.** This document replaces the March 2026
> brainstorm. The database foundation, TK ledger/detail completion, issued DC/R-ER financial
> service entry, shared whole-PNR GBP Low Fare queue, audited root-TK staff attribution, and
> privileged admin-on-behalf TK completion are implemented. Root-TK itinerary entry and all-agent
> Flight Monitoring and its manual schedule-change workflow are also live. Later workflows
> described here remain proposals until their code, migrations, and tests are shipped.

- **Status:** Foundation, sales ledger, shared Low Fare, root-TK completion/attribution, itinerary entry, Flight Monitoring, and manual schedule changes implemented
- **Last updated:** August 27, 2026
- **Owner:** PT-Portal Team

### Implementation checkpoint — August 23, 2026

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
- Added the own-only TK completion drawer and deployed
  `scripts/migrations/20260822_ticketing_tk_completion.sql`, including the atomic
  `ticketing_complete_tk_details(uuid, uuid, text, jsonb)` operation. Live capability
  `2026082202` and service-role-only execution were verified, and the linked Supabase types were
  refreshed. It supports partial customer, journey, grouped sale/payment, and stable passenger-slot
  completion; optimistic conflicts, idempotent replay, posted-sale locks, and Part Paid records fail
  closed. The ledger derives `needs_details`/`complete` without storing another status column.
- Completing Issued sale values and moving Unpaid to Paid emit separate immutable variable-only
  Commission facts. PII-only edits emit no Commission fact, no-op saves emit no audit/fact, and the
  ledger still exposes no calculated commission or profit.
- Added a PNR-first own-ledger flow for issued DC and R-ER service movements. Exact PNR lookup
  prefills the root TK/customer/airline and passenger mix; agents enter only affected quantities,
  full GBP unit supplier cost/customer charge, service/issue dates, and Paid/Unpaid state. A later
  transaction-level Unpaid-to-Paid action is independent from the root TK payment state.
- Added and integration-tested `scripts/migrations/20260823_ticketing_dc_rer_entry.sql`, the
  auditable `20260823_ticketing_rer_chronology_guard.sql` follow-up, and the live-safe
  `20260823_ticketing_service_response_dates.sql` adapter, followed by the forward-only
  `20260823_ticketing_service_response_lineage_guard.sql` ratchet. Capabilities `2026082301` through
  `2026082304` provide optimistic/idempotent atomic writes, immutable root facts,
  affected-quantity ceilings, an Issued-root requirement, a serialized one-successor R-ER chain
  that rejects backdating before its predecessor, exact branch-local response dates, replay
  stability after later payment/lifecycle changes, and historical lineage after cancellation or
  refund.
- Deployed and verified live Ticketing capability `2026082304`, refreshed the linked Supabase
  types, confirmed the public service RPC grants, inaccessible versioned helpers, migration-ratchet
  tombstones, historical-lineage trigger/index, and confirmed that all live Ticketing booking,
  transaction, fare, passenger, audit, and Commission source-event tables remain empty.
- Added an immediate forward-version guard to every Ticketing migration. Fresh installs and exact
  same-version reruns remain supported; any older script presented to a later installed capability
  fails before changing routines, grants, triggers, policies, tables, or readiness metadata. The
  disposable suite also preserves simulated `2026082305` routine definitions against a 2304 replay.
- Made exact-PNR selection overflow-safe with ten-record keyset pages and a visible continuation,
  while every page remains exact-PNR and own-agent scoped. Journey, root booking date, passenger
  mix, and a stable record suffix distinguish otherwise identical matches.
- DC/R-ER issuance publishes `ticket_date_changed` or `ticket_reissued`; Paid-at-create and later
  payment publish a separate `ticket_paid` fact. These variable-only events inherit server-derived
  package scope, leave policy/calculation to Commission, and never emit the generic target-counting
  `ticket_issued` event.
- The implemented DC/R-ER entry is intentionally an aggregate issued financial service movement.
  Exact passenger allocation, the changed itinerary, Held child services, and a component split
  between fare difference and airline/change fee remain future workflows.
- **Still future:** itinerary sectors, no-change fare-check observations, non-GBP/partial-passenger
  fare adjustments, Ticket Vouchers, Sales Targets, team Flight Monitoring, Refunds & Claims, and
  the native cancellation calculator.

### Implementation checkpoint — August 24, 2026

- Reverified linked Ticketing capability `2026082304` and confirmed the operational/Commission
  tables in scope were empty without reading customer rows. After the disposable-database suite
  passed, applied `scripts/migrations/20260824_ticketing_low_fare_adjustments.sql` to the linked
  project and verified `ticketing_schema_status()` ready at `2026082401`, service-only grants, RLS,
  lineage/immutability/package-serialization triggers, and unchanged zero row counts. The required
  Supabase CLI, PostgreSQL client, Docker, Node, and test tooling were already available; no
  dependency or global add-on was needed for this slice.
- Capability `2026082401` adds immutable linear whole-PNR GBP fare history, paired source/GBP
  facts, server-snapshotted original fare, monotonic issue dates, optimistic/idempotent cross-agent
  writes, booking-first package-scope serialization, redacted audit evidence, and target-safe
  positive/higher-fare Commission source variables.
- Added the shared `/dashboard/ticketing/low-fare` queue and strict
  `GET/POST /api/ticketing/fare-adjustments` contract. It supports exact PNR, airline, owner, and
  departure filters, query-bound keyset pagination, fast inline entry, and lower/higher signed-fare
  presentation. It exposes supplier-fare operations only—never customer/contact data, sale values,
  commission scope or amount, markup, margin, earnings, or profit.
- Kept Commission policy ownership intact: the authenticated acting agent is the event recipient,
  the original ticket owner and both branch contexts remain auditable source variables, package
  scope is server-derived, and Ticketing never calculates a credit/debit or emits an issued-target
  event for a fare movement.
- The first slice intentionally rejects a same-fare observation rather than mixing operational
  checks into financial adjustment lineage. A later append-only fare-check fact can provide true
  `last checked` tracking without inventing a Commission event or bloating the active-fare chain.
- Added, integration-tested, and deployed capability `2026082402`, then refreshed the linked
  Supabase types. It separates the immutable authenticated entry actor from the responsible ticket
  agent and up to ten assistants. Admin, Master Admin, and Super Admin can assign these roles during
  TK entry or make an optimistic, reason-required correction later. Attribution corrections append
  history, align booking/transaction ownership, and supersede the issued source fact rather than
  rewriting it. Live verification confirmed the capability marker, six invariant triggers, RLS,
  service-only mutation grants, an inaccessible transient write-context table, and unchanged zero
  rows across the Ticketing and Commission source tables in scope.
- Issued passenger-ticket target units belong only to the responsible agent. Assistants are emitted
  as independent downstream Commission inputs with zero target units, so assistance never advances
  an assistant's ticket target or primary-sale tier. Ticketing still stores no rate, calculated
  commission, statement, payout, margin, or profit.
- Implemented and deployed capability `2026082403` for Admin, Master Admin, and Super Admin to finish a
  responsible employee's root-TK customer, journey, sale, and payment details without impersonating
  them. The database derives the current owner, preserves the authenticated admin as the acting
  employee, requires a bounded reason when actor and owner differ, and carries the corrected
  primary/assistant attribution through issued, sale-completed, and paid source facts.

### Implementation checkpoint — August 26, 2026

- Reverified the linked capability and the first saved root TK using aggregate-only integrity
  checks. Capability `2026082403`, the authorised completion RPC, service-only grants, RLS, ten
  attribution/invariant triggers, owner alignment, source attribution, zero assistant target units,
  supersession lineage, and empty transient write contexts all passed.
- Added and deployed capability `2026082601` to track Supabase's `extensions.pgcrypto` runtime
  dependency, replace the dynamic digest lookup with a fixed trusted extension bridge, preserve all
  predecessor capability tokens, and make `ticketing_schema_status()` report verified runtime
  readiness. Linked Supabase types were regenerated afterward.
- Centralized Supabase object/singleton-array capability parsing across every Ticketing route,
  retained each route's minimum feature floor, and removed raw database details from quick-entry
  logs. Malformed, multirow, stale, and unready responses fail closed.
- The disposable PostgreSQL runner now reproduces Supabase's extension layout and passes through
  foundation, TK completion, DC/R-ER, Low Fare, attribution, admin completion, and runtime readiness.

### Implementation checkpoint — August 27, 2026

- Added, integration-tested, and deployed capability `2026082602` through
  `scripts/migrations/20260826_ticketing_sector_itinerary.sql`. It adds 29 active airport-directory
  seeds for common UK, Pakistan, Saudi, Turkey, and Gulf hubs; airport-derived IANA zones and UTC
  instants; deterministic daylight-saving overlap handling; daylight-saving gap rejection; and a
  dedicated monotonic root-TK itinerary version without advancing unrelated booking versions.
- Root-TK owners can replace one to twelve active sectors for Held or Issued bookings. Admin,
  Master Admin, and Super Admin can cover another employee with a required reason while preserving
  the responsible owner and authenticated actor. Exact retries use an immutable response snapshot
  before mutable employee, ownership, airport, airline, or booking-state checks.
- Itinerary replacements retire rather than delete previous sectors, append a redacted audit event,
  use an inaccessible transient write context and invariant trigger, and emit no Commission source
  fact. The service role has read-only table access and mutation access only through the hardened
  replacement RPC.
- Connected the ledger itinerary drawer and the dashboard's shared Flight Monitoring section. The
  monitor returns future active sectors from every agent's Issued root TK, with responsible agent,
  persisted lead-passenger fallback, PNR, contact, flight/route, local departure/timezone,
  passenger count, and schedule status—never fare, payment, package-profit, or commission fields.
- Linked verification passed at ready capability `2026082602`: 29 active airports, RLS on the
  airport/sector/context tables, least-privilege grants, the enabled sector guard, a hardened
  service-only RPC, unique preserved capability tokens, zero open write contexts, and zero existing
  itinerary sectors. Linked Supabase types were refreshed afterward.
- Added, integration-tested, and deployed capability `2026082701` through
  `scripts/migrations/20260827_ticketing_schedule_changes.sql`. Any authorised Ticketing employee
  may mark a flight-number/time change discovered in the shared monitor. The responsible employee,
  or Admin/Master Admin/Super Admin acting with a reason, may review, dismiss, or finalise it.
- Marked proposals become immutable case facts. Review/finalisation calls cannot replace the
  proposal from the browser, status changes require an inaccessible single-use write context, and
  direct service-role event inserts are denied. Finalisation delegates to root-itinerary
  replacement, retaining the previous sector and advancing only the itinerary version.
- Flight Monitoring now displays the proposed departure, case evidence, and only the schedule
  actions permitted for the current employee. Route/airport/airline changes remain in the full
  itinerary editor; this fast operational workflow handles the common flight-number and time case.
- Linked verification passed at ready capability `2026082701`: security-definer/service-only RPC,
  denied browser execution, read-only service event projection, active sector guard, unique
  capability tokens, and zero transient contexts, schedule events, or open cases before use.
  Linked Supabase types were refreshed afterward. The workflow emits no Commission source fact.

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
- Planned team oversight remains available to Manager, Admin, Master Admin, and Super Admin where a
  workflow explicitly permits it. Staff-attribution overrides and corrections are narrower: only
  Admin, Master Admin, and Super Admin may perform them. A Manager may still be selected as the
  responsible employee or an assistant.
- The implemented attribution ledger gives Admin, Master Admin, and Super Admin the bounded latest
  team rows needed to discover corrections. Manager and regular staff remain owner-only. Complete
  team pagination/search remains a later ledger-hardening task.
- Maintenance Admin receives no ticketing-finance privilege by default.
- Agents may edit their own draft or held records. Once a ticket is issued and paid, financial
  corrections are append-only Manager/Admin adjustments; historical values are not silently
  rewritten.
- Every ticket distinguishes the authenticated `entered by` employee from its responsible agent.
  The acting/entry employee is never accepted from the browser and does not change when an admin
  later corrects responsibility.
- The responsible agent owns the booking and its transactions, receives the issued TK
  passenger-ticket target units, and is the primary recipient supplied to Commission. Assistants are
  separately recorded facts for that root TK sale; they receive no target units and do not advance
  primary-sale tiers. A later DC or R-ER does not inherit the TK assistant list—those services need
  their own transaction-scoped attribution workflow before assisted service entry is supported.
- An admin entering while another employee is unavailable selects the responsible agent and any
  assistants, with a reason. A later correction requires a fresh reason, optimistic booking version,
  idempotency key, immutable audit row, and superseding source-event version.

### 2.2 Commission-variable contract

- Ticketing owns operational facts only. It must not hard-code rates, select a commission formula,
  create statements, or calculate/display an agent's commission or company profit in the ledger.
- On every relevant state change, Ticketing emits a versioned, idempotent source event for the
  Commission module containing variables rather than a calculated amount.
- Core variables include source event/transaction IDs, immutable acting employee, primary
  responsible employee, assistant employee IDs, primary/assistant target units, location, service
  type, issued/paid/cancelled/refunded timestamps and states, passenger-ticket count, source/GBP sale
  and supplier costs, original/new fare and GBP difference, package link/type, and package-exemption
  state.
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
- Booking deadlines use the server-resolved branch IANA timezone. Itinerary sectors derive their
  timezone from the selected airport directory entry; browsers never submit a timezone or UTC
  instant. A future airport-directory correction must be an audited server-side operation rather
  than a free-form per-sector override.

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
- All issued TK units count for the current responsible agent. Every assistant receives zero target
  units from that assistance and must make primary sales separately to hit their own weekly/monthly
  target. Correcting the responsible agent transfers the source fact through versioned correction
  lineage; it does not leave target credit with the entry actor.
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

- The acting/entered-by employee comes from the authenticated staff session and is never accepted
  from the browser.
- For ordinary staff, the responsible agent defaults permanently to the acting employee and there
  are no assistant controls. Admin, Master Admin, and Super Admin see a fast responsible-agent
  selector defaulted to **Me**, may add up to ten unique assistants, and must enter a reason when
  responsibility differs or assistance is recorded.
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

The implemented first DC/R-ER slice records only an Issued aggregate financial service movement.
Every child points to the immutable root TK; each R-ER additionally supersedes the current issued
replacement-chain tail. Booking and issue dates cannot predate that predecessor, including when
multiple reissues happen on the same business date. Affected ADT/CHD/INF quantities cannot exceed
the root mix. The child does not yet assert exact affected passenger identities or a changed
itinerary, and it never mutates the root booking/transaction lifecycle or payment facts.

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

The implemented completion drawer adds customer contact, departure/return dates, grouped sale
values, Paid/Unpaid state, and stable individual passenger slots with name, ticket number, optional
date of birth, and a different contact number when needed. Existing Part Paid records stay read-only
until an amount-paid/payment-correction workflow exists. Per-passenger fare overrides are deferred;
the grouped fare lines remain authoritative. Grouped quantities and passenger assignments must
reconcile before a refund or voucher is attached to an individual ticket. The main passenger name
remains available even while the persisted passenger list is incomplete.

### 3.6 Low Fare Queue

The implemented queue contains eligible issued tickets from all agents and supports exact PNR,
airline, owner, and departure-date filters with bounded keyset pagination. It exposes only the
operational and supplier-fare information needed to record a changed fare; it exposes no customer
contact, sale value, commission scope/amount, earnings, markup, margin, or company-profit
information. Its owner dropdown learns agents from pages already loaded in this first slice; a
future bounded Ticketing-agent options endpoint can provide complete up-front owner discovery.

The first slice is GBP-only and records a whole-PNR supplier total, not a partial-passenger change.
For the first adjustment, the original fare is a server snapshot of the immutable issued root TK's
complete GBP supplier total. Thereafter it is the current tail's new fare. The caller submits only
the replacement fare, effective issue date, notes, optimistic versions, and expected predecessor;
acting agent, owner, passenger count, branch, package scope, original fare, and difference are all
server-derived.

For GBP values:

```text
difference = original fare - new fare
```

The adjustment appends history and then becomes the active fare; it never deletes or rewrites an
earlier adjustment or the issued root TK. Its date cannot predate the root issue date or the current
tail. A positive difference emits `ticket_low_fare_adjusted`; a negative difference emits
`ticket_higher_fare_adjusted`. Both carry the acting agent, original owner, signed difference,
passenger count, branch, and package-match variables but zero target units and no calculated
commission. The Commission module alone decides whether the event creates a credit, debit, or no
entry. Zero-difference observations, non-GBP settlement, partial-passenger allocation, automatic
R-ER creation, and transaction-scoped DC/R-ER attribution remain later workflows.

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

Use committed, idempotent migrations under `scripts/migrations/`. The generated schema now contains
the normalized Ticketing foundation and implemented TK/DC/R-ER/Low Fare capabilities alongside the
frozen legacy `ticket_ledger`, `airlines`, `commission_rules`, `commission_rate_components`,
`commission_tiers`, and `employee_commission_assignments`. Ticketing migrations must not redesign
those commission tables; their reconciliation belongs to the Commission module plan.

The normalized module will use:

| Table                                   | Responsibility                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `ticket_bookings`                       | PNR/customer owner, current lifecycle, package match, and current itinerary summary                |
| `ticket_transactions`                   | Immutable TK/DC/R-ER financial and issuance events with aligned operational ownership              |
| `ticket_booking_attribution_versions`   | Immutable primary/entered-by/change-actor versions for each root TK booking                        |
| `ticket_booking_attribution_assistants` | Immutable independent assistants attached to one attribution version                               |
| `ticket_passenger_fare_lines`           | Grouped ADT/CHD/INF quantities and source/GBP buy/sale values                                      |
| `ticket_passengers`                     | Later passenger names, types, ticket numbers, and per-person allocation                            |
| `ticket_itinerary_sectors`              | Flight numbers, airports, local/UTC times, timezone, and active schedule                           |
| `ticket_schedule_events`                | Marked, reviewed, and finalised manual schedule changes                                            |
| `ticket_fare_adjustments`               | Low/higher fare history and acting-agent attribution                                               |
| `ticket_refunds`                        | Customer refund, airline recovery, fees, calculator/formula snapshot, claim status, and P&L inputs |
| `ticket_vouchers`                       | Claim entitlement, deadline, confirmed value, remaining value, and status                          |
| `ticket_voucher_events`                 | Submission, confirmation, partial use, refund receipt, expiry, and closure                         |
| `ticket_package_links`                  | PNR-derived package/reservation links and match resolution                                         |
| `ticket_audit_events`                   | Before/after metadata for every privileged correction or lifecycle event                           |
| `ticket_notification_events`            | Idempotent time-limit and voucher reminder delivery records                                        |

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
- `PATCH /api/ticketing/ledger/{id}/attribution` for admin-only, audited attribution correction
- `POST /api/ticketing/bookings/{id}/transactions`
- `GET/POST/PATCH /api/ticketing/bookings/{id}/passengers`
- `GET/PUT /api/ticketing/bookings/{id}/sectors`
- `GET /api/ticketing/airports`
- `GET/POST /api/ticketing/fare-adjustments`
- `POST /api/ticketing/refunds/preview` and `GET/POST /api/ticketing/refunds`
- `GET/POST/PATCH /api/ticketing/vouchers` and
  `/api/ticketing/vouchers/{id}/events`
- `GET /api/ticketing/flight-monitor`
- `GET /api/ticketing/targets/progress` as a read-only projection from the Commission module
- `GET/POST/PATCH /api/ticketing/airlines`

All routes must:

- Resolve the actor and employee ID from `requireStaffSession`; never trust caller-supplied acting
  IDs. A caller-supplied responsible/assistant selection is accepted only by the explicitly
  admin-authorised attribution contracts and is revalidated inside the service-only database RPC.
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
- **Implemented:** lazy own-record completion for customer/journey details, grouped sale values,
  Paid/Unpaid transition, and individual passenger names, contacts, dates of birth, and ticket
  numbers. Saves are atomic, versioned, retry-safe, and do not calculate/display commission.
- **Implemented:** exact-PNR issued DC/R-ER entry with affected passenger-group quantities, full
  GBP supplier/customer unit values, immutable root/reissue lineage, Paid-at-create or later Paid
  state, package-scope variables, and target-safe service-specific source facts.
- **Implemented:** audited admin-on-behalf root-TK detail and payment
  completion that never impersonates the responsible employee and preserves current attribution in
  all root-completion source facts.
- **Implemented:** one-to-twelve-sector root-TK itinerary replacement for Held/Issued bookings,
  server-owned airport/timezone derivation, immutable revision history, dedicated optimistic
  itinerary versions, and audited administrator cover without Commission facts.
- **Implemented:** the dashboard's all-agent Flight Monitoring projection for future active Issued
  sectors, with operational contact/passenger context and no financial or commission fields.
- **Implemented:** shared manual marking of flight-number/time changes, responsible-owner or
  reasoned administrator review/dismissal/finalisation, immutable case events, and finalised
  itinerary revisions without Commission facts.
- **Future:** add exact affected-passenger allocation, component fee/fare-difference costs, Held
  DC/R-ER, changed child-service itinerary allocation, and transaction-scoped admin/assistant
  attribution for DC/R-ER service completion.
- Connect the 24/6/2-hour time-limit reminders and exact expiry processing.
- Complete admin team-ledger pagination/search; audited admin-on-behalf root-TK completion is
  implemented.

### Phase 3: Targets and low fare — partially implemented

- **Implemented:** shared GBP whole-PNR Low Fare Queue, immutable signed fare-difference source
  variables, acting-agent attribution, package snapshots, and no commission/profit presentation.
- **Implemented:** admin entry-time and later correction of responsible/assistant TK attribution,
  immutable attribution history, owner alignment, primary-only target variables, assistant zero
  target units, and issued source-event correction lineage.
- **Future:** same-fare check observations, non-GBP and partial-passenger adjustments, and complete
  owner-filter options.
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
- Admin entry for another employee keeps the admin as immutable actor, assigns all issued-target
  units to the responsible employee, and gives every assistant zero target units. A correction moves
  attribution through one linear source-event version without changing the original actor.
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
- The acting agent is always session-derived, including cross-agent low-fare adjustments and admin
  ticket entry on behalf of staff.
- Admin, Master Admin, and Super Admin can perform audited attribution corrections; Manager and
  Maintenance Admin cannot. Recipient lists may still contain any active employee.
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
npm run test:db:ticketing
npm run typecheck
npm run lint
npm run format:check:changed
npm run docs:check
npm run docs:check-api
npm run api:check-boundaries
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
