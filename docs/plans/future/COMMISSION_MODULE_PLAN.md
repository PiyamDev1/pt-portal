# Commission Module Integration Plan

> **Implementation proposal.** This is the authoritative plan for commission structures,
> calculation, statements, and staff sales targets. Source modules such as Ticketing and Packages
> provide facts and variables; they do not contain commission formulas.

- **Status:** Decision-complete integration note
- **Last updated:** August 24, 2026
- **Owner:** PT-Portal Team
- **Primary dependency:** [Ticketing Module Plan](TICKETING_MODULE_PLAN.md)

## 1. Purpose and ownership

The Commission module is the only PT-Portal module allowed to define commission structures,
calculate earnings/debits, create statements, carry balances, or display commission outcomes.

Ticketing, Packages, and future sales modules emit immutable business facts. The Commission module
then applies the effective policy assigned to the employee and source event. This prevents rates or
special cases from being duplicated across ledgers and allows every agent to have a different
structure without changing source-module code.

The Commission module also owns weekly/monthly ticket targets. Ticketing may display a read-only,
non-financial progress card, but target values, periods, counting rules, and corrections are managed
here.

## 2. Non-negotiable boundaries

- Never hard-code an employee's rate in Ticketing, Packages, API routes, UI components, or migration
  seed data.
- Never store a calculated commission/profit value in the Ticketing sales ledger.
- Never add commission, earnings, margin, or company-profit columns/totals to Ticketing ledger or
  Low Fare views.
- Source modules emit variables and stable source identities only. The Commission module owns
  eligibility, formulas, calculation, reversals, statements, and visibility.
- An employee without an applicable policy produces a visible `needs_policy` exception. Do not use
  a silent fallback or assume zero; zero commission must be an explicit rule.
- Every policy and target assignment is effective-dated. A future change must not recalculate a
  locked historical statement or completed target period.
- Posted entries are append-only. Corrections use void/offset/replacement entries linked to the
  original source event and policy snapshot.
- The primary responsible employee and each assistant are different recipient roles. Assistance may
  earn an independently configured amount, but it never contributes issued-ticket target units or
  advances a primary-sale tier counter.
- Calculations and statement totals use PostgreSQL `numeric` values and actual settled GBP source
  variables, not JavaScript floating point or inferred exchange rates.

## 3. Roles and presentation

### Agent view

Agents can open `/dashboard/commissions` to see only their own:

- Weekly and monthly sales-target progress.
- Pending/unresolved source events that need operational completion.
- Commission entries grouped by source/service and period.
- Opening balance, credits, debits, closing balance, carry-forward, and statement payment status.
- A calculation explanation identifying the policy/version and source record without exposing
  another employee's policy or company-wide profit.

Ticketing remains commission-free. Links from a Commission entry may open the permitted source
record, but source ledger rows do not render the earning.

### Manager/Admin view

Manager, Admin, Master Admin, and Super Admin can:

- Configure and version policies/components.
- Assign policies and targets to individual employees or reviewed groups.
- Review `needs_policy`, ambiguous package scope, missing GBP variables, and other exceptions.
- Preview a policy against historical source variables without posting changes.
- Approve/lock monthly statements, record payment, and carry negative balances.
- Add audited manual adjustments with a required reason and supporting source reference.
- Review team target progress and completed periods.

Maintenance Admin receives no finance access by default.

## 4. Source-event variable contract

### 4.1 Common envelope

Every contributing module emits an idempotent, versioned event containing:

| Variable              | Meaning                                                      |
| --------------------- | ------------------------------------------------------------ |
| `source_module`       | Stable producer such as `ticketing` or `packages`            |
| `source_event_id`     | Producer-owned immutable UUID                                |
| `source_record_id`    | Booking, transaction, fare adjustment, refund, or package ID |
| `event_type`          | Stable business event code                                   |
| `event_version`       | Increasing version for corrections to the same source fact   |
| `supersedes_event_id` | Prior source event when this is a correction/reversal        |
| `employee_id`         | Primary responsible employee for the source fact             |
| `owner_employee_id`   | Operational ticket owner; equal to primary after attribution |
| `location_id`         | Branch/location context                                      |
| `occurred_at`         | UTC source-event timestamp                                   |
| `effective_on`        | Business date used for policy and statement selection        |
| `source_path`         | Internal source-record link, never a public URL              |
| `variables`           | Strict versioned payload for the event type                  |
| `idempotency_key`     | Unique retry-safe producer key                               |

The database ingestion envelope uses these exact `snake_case` keys. Every key is present on every
append; `supersedes_event_id`, `owner_employee_id`, and `location_id` use JSON `null` when absent.
For a correction, `supersedes_event_id` is the producer-owned `source_event_id` of the prior event;
the ingestion function resolves the internal database row without exposing that implementation ID.

The Commission module rejects unknown event versions, missing required variables, duplicate
idempotency keys with different payloads, inactive employees, or events whose employee attribution
cannot be resolved.

### 4.2 Ticketing variables

Ticketing emits separate event types for TK, DC, R-ER, low-fare adjustment, higher-fare adjustment,
refund, cancellation, package-match correction, and erroneous-issuance correction.

Relevant variables include:

- Service type and operational/payment states.
- Issued, paid, cancelled, and refunded dates.
- Issued or affected passenger-ticket count; this is never inferred from PNR count.
- Source currency and actual GBP customer receipt/sale value.
- Source currency and actual GBP supplier ticket cost.
- Original/new fares and signed GBP fare difference.
- Immutable acting/entered-by employee, primary responsible employee, and assistant employee IDs.
- `issued_ticket_target_units` for the primary and explicit zero target units for assistants.
- PNR, airline ID, transaction lineage, and refund/source references.
- Package/reservation/group IDs, package type, and resolved commission scope.
- Refund/cancellation values needed to preserve or adjust the original earning.

Ticketing emits a state change even when it does not know whether it is commissionable. The
Commission module evaluates the employee policy and package scope.

Ticketing capability `2026082402` supplies `primary_responsible_employee_id`,
`assistant_employee_ids`, `acting_employee_id`, `issued_ticket_target_units`, and
`assistant_target_units` for the root TK issuance. The event envelope belongs to the primary employee. The Commission
processor must fan out any configured assistant entries from the assistant IDs without adding those
events to the assistant's target or primary-tier basis. A source-event correction replaces the
recipient set and target ownership through normal event-version lineage. DC/R-ER events must not
inherit this root-TK assistant list; a later transaction-scoped Ticketing attribution contract will
be required before those services can record independent assistants.

Ticketing capability `2026082401` implements the first Low Fare producer contract. A positive
whole-PNR GBP difference (`original_fare_gbp - new_fare_gbp`) emits
`ticket_low_fare_adjusted`; a negative difference emits `ticket_higher_fare_adjusted`. The common
envelope attributes the event to the authenticated acting employee and their branch while retaining
the original ticket owner and booking branch in the source variables. Equal source/GBP
original/new/difference pairs, passenger-ticket count, adjustment lineage, airline/PNR, root
service/operational/payment lifecycle, and server-snapshotted package scope are included;
`issued_ticket_target_units` is zero. A same-fare observation emits no adjustment event in this
slice. Ticketing still emits no calculated commission amount.

### 4.3 Package variables

Packages emits:

- Package ID/type and responsible sales employee.
- Passenger count used by a fixed-per-passenger package policy.
- Actual settled GBP revenue, cost, refunds, ticket variances, discounts, and final package profit.
- Package lifecycle/earned date and version.
- Links to source ticket changes, cancellations, reissues, or refunds that altered profitability.

Ticket-related package events use package scope. They do not also earn a ticketing commission unless
an explicit future policy is designed to do so.

### 4.4 Interim package commission capture

Until the Commission module processor, policy assignments, and statements are complete, Package
folders may capture **provisional agent commission deductions** in package metadata. This is an
operational estimate only; it is not a posted Commission entry, approved statement, payroll fact,
or permanent policy definition.

Each provisional line records:

- `employees.id` for the recipient
- package role: ticketing agent, assisting agent, main dealer, or other
- manual earning basis: per issued ticket, fixed assistance amount, or explicit no commission
- ticket quantity and per-ticket amount when applicable
- whether the calculated amount should be subtracted from the package profit estimate
- an internal explanation

The interim package profit display is:

```text
provisional package profit =
  sold price
  - discounts
  - booked cost
  + supplier commission
  - selected provisional agent commission deductions
```

Required example supported by this interim capture:

| Employee | Package role    | Interim basis     | Treatment                                      |
| -------- | --------------- | ----------------- | ---------------------------------------------- |
| Agent 1  | Ticketing agent | Per issued ticket | Five issued tickets earn ticket commission     |
| Agent 2  | Assisting agent | Fixed amount      | Full agreed fixed assistance commission        |
| Agent 3  | Main dealer     | No commission     | No commission; remains responsible for package |

When the Commission module is completed, it must ingest or reconcile these provisional records,
replace manual rates with effective-dated policy results, prevent duplicate payment, and retain the
original package metadata as audit evidence. Package pages must then display the Commission
module's posted result instead of recalculating the amount locally.

## 5. Policy model

### 5.1 Policy assignment

- Each employee may have different effective-dated assignments by product/service and location.
- Assignments have `effective_from` and optional `effective_to`; overlapping applicable assignments
  are rejected unless an explicit priority/override is configured.
- Policy versions become immutable after they are used by a posted entry.
- A policy may explicitly produce zero for a service while remaining valid.
- A Manager/Admin may schedule a future policy without changing current or historical periods.

### 5.2 Supported components

The first release supports composable components:

- Fixed amount per issued passenger-ticket.
- Fixed amount per affected DC/R-ER passenger-ticket.
- Fixed amount per transaction/booking.
- Independent fixed or percentage assistance component whose count basis is the assisted fact and
  whose primary-sale tier/target basis is always zero.
- Percentage of positive low-fare saving.
- Configurable treatment of a negative fare difference, including full signed debit and negative
  carry-forward.
- Fixed package amount.
- Fixed package amount per passenger.
- Percentage of final package profit.
- Optional tiers based on a defined count or GBP basis.
- Explicit zero component for a service.

Each component declares its input variable, sign/rounding rule, combination order, minimum/maximum
if used, and recipient. A missing input creates an exception rather than being treated as zero.

Tier counters must declare their eligible recipient role. The first Ticketing policies count only
primary issued sales: an assistant entry can pay its own fixed/percentage component but cannot move
the assistant from one primary-sales tier to another.

### 5.3 Eligibility and event timing

- The policy, not Ticketing, defines whether an event requires Issued, Paid, both, or another
  lifecycle condition before posting.
- The initial ticket-policy default is Issued + Paid because that is the agreed operating rule, but
  it remains a Commission policy condition rather than Ticketing logic.
- Refund policies preserve the original ticket earning by default. The refund event remains linked
  so a future authorised policy can change that behaviour without altering Ticketing.
- Package-scope events wait for the package earned/final-profit condition defined by the package
  policy.
- An unresolved package match or missing GBP settlement holds calculation in an exception queue.

### 5.4 Illustrative Agent 1 configuration

This is an example assignment, not a global default or seed:

| Service           | Component                                                                     |
| ----------------- | ----------------------------------------------------------------------------- |
| TK                | £5 per issued passenger-ticket after the configured Issued + Paid condition   |
| DC                | £5 per affected passenger-ticket after the configured Issued + Paid condition |
| R-ER              | Explicit £0; a future policy version may change it                            |
| Positive low fare | 10% of the GBP saving                                                         |
| Higher fare       | Full signed GBP increase debited and eligible for negative carry-forward      |
| Refund            | Preserve the original ticket earning                                          |
| Package scope     | Do not apply ticket components; use the assigned package policy               |

Acceptance example: three passengers issued as TK produce £15. A later DC affecting all three
produces another £15. R-ER produces £0 under this version.

### 5.5 Illustrative tier and profit configurations

These are separate employee policy examples, not shared defaults:

| Example | Primary ticket components                                                                  |
| ------- | ------------------------------------------------------------------------------------------ |
| Agent A | £5 for each of primary tickets 1–30 in the policy period; £10 from ticket 31 onward        |
| Agent B | £5 for primary tickets 1–30; £10 for 31–60; £15 from ticket 61 onward                      |
| Agent C | £5 per primary ticket plus 10% for each completed £1,000 profit band under a defined basis |

The Agent C profit basis must be defined precisely before implementation—period, eligible source
modules, gross versus net profit, treatment of refunds/packages, band rounding, and statement lock.
Ticketing provides facts only and must not calculate that profit component. For all examples, an
assistant payment is evaluated independently and adds zero to the tier count.

## 6. Ticket targets

### 6.1 Configuration

- Manager/Admin sets independent weekly and monthly targets per employee.
- The default metric is `issued_tk_passenger_ticket_count`.
- Weekly periods run Monday-Sunday and monthly periods use calendar months in the employee's branch
  timezone unless the assignment explicitly selects another supported period definition.
- Target assignments are effective-dated and may be scheduled in advance.
- Bulk assignment is allowed only through preview/confirmation and writes individual audited rows.

### 6.2 Counting rules

- Count each TK passenger-ticket exactly once when Ticketing first emits a valid Issued state.
- One PNR with three issued passengers adds three.
- Only the primary responsible employee receives those units. The authenticated entry actor gets
  none unless they are also primary; every assistant gets zero from the assisted booking.
- Payment does not change target count.
- DC, R-ER, low-fare, refund, cancellation, and voucher events do not count toward the default ticket
  target.
- Package-linked TK passenger-tickets count unless a target assignment explicitly excludes them.
- A later cancellation/refund does not remove genuine issuance credit.
- An audited erroneous-issuance correction reverses the count.
- An audited attribution correction transfers the versioned source fact from the former primary to
  the corrected primary; it never credits the assistant list or leaves a duplicate count.
- Duplicate/retried source events never increment progress twice.

### 6.3 Progress contract

Commission exposes a read-only progress DTO to Ticketing:

```ts
type TicketTargetProgress = {
  employeeId: string
  period: 'weekly' | 'monthly'
  periodStart: string
  periodEnd: string
  target: number
  completed: number
  remaining: number
  percentage: number
  achieved: boolean
  updatedAt: string
}
```

Ticketing displays only these non-financial values. Commission may also show historical periods and
team progress to authorised users.

## 7. Statements and balances

- Commission entries are signed GBP values linked to one source event and one immutable policy
  version.
- Positive credits and negative debits share one running employee balance.
- A higher-fare debit may reduce the balance below zero; the unpaid negative amount carries into the
  next statement.
- Calendar-month statements snapshot opening balance, included entries, credits, debits, closing
  balance, approved amount, payment state, approver, and timestamps.
- Approval/lock freezes membership and calculations. Later corrections post an offset in the next
  open period rather than rewriting the locked statement.
- Payment recording is an audited state change; payroll/Frappe transfer is outside the first
  release.

## 8. Data and API design

### 8.1 Existing Supabase baseline

The generated snapshot already describes `commission_rules`, `commission_rate_components`,
`commission_tiers`, and `employee_commission_assignments`. The current `/dashboard/commissions`
route is a placeholder. These facts must be verified against the live linked Supabase project before
choosing ALTER/backfill/replacement migrations.

The August 24 Ticketing verification found those rule/component/tier/assignment tables and the
Ticketing-owned `commission_source_events` boundary empty. Ticketing capability `2026082402` can
now publish signed Low Fare/higher-fare variables and root-TK primary/assistant attribution facts
atomically. This producer boundary still implies no Commission processor, policy assignment,
calculated entry, statement, payout, or target-progress UI.

Expected resulting capabilities:

| Table/capability                    | Responsibility                                              |
| ----------------------------------- | ----------------------------------------------------------- |
| `commission_policy_versions`        | Immutable policy metadata and conditions                    |
| Existing rule/component/tier tables | Reviewed calculation components, extended where safe        |
| `employee_commission_assignments`   | Effective-dated employee/service policy assignment          |
| `commission_source_events`          | Versioned idempotent facts from source modules              |
| `commission_entries`                | Signed calculated result and full input/rule snapshot       |
| `commission_statements`             | Monthly balances, approval, lock, and payment               |
| `commission_statement_entries`      | Immutable statement membership                              |
| `sales_target_assignments`          | Effective-dated employee metric/period targets              |
| `sales_target_periods`              | Progress and closed-period snapshot                         |
| `commission_audit_events`           | Policy, assignment, adjustment, statement, and target audit |

Prefer extending usable current tables over parallel duplicates. Preserve existing rows and create
an explicit migration/backfill report if current production data exists.

### 8.2 APIs

Agent endpoints:

- `GET /api/commissions/me`
- `GET /api/commissions/me/entries`
- `GET /api/commissions/me/statements`
- `GET /api/commissions/me/targets`

Manager/Admin endpoints:

- `GET/POST/PATCH /api/commissions/policies`
- `GET/POST/PATCH /api/commissions/assignments`
- `GET/POST/PATCH /api/commissions/statements`
- `GET/POST/PATCH /api/commissions/targets`
- `GET/POST /api/commissions/adjustments`
- `GET /api/commissions/exceptions`

Source ingestion is not a browser endpoint. Ticketing/Packages transactional PostgreSQL functions
append `commission_source_events` in the same transaction as the authoritative source change. A
retry-safe processor calculates or refreshes the resulting entry.

The cancellation calculator uses a server-only Commission resolver to obtain the retained
commission variable for its selected source ticket. It never accepts the amount from the browser
and never adds the amount to Ticketing ledger presentation.

## 9. Phase 0: Mandatory environment and database discovery

Implementation starts with all of the following; none may be skipped:

1. Connect to the intended linked Supabase project using configured credentials without printing
   secrets, tokens, connection strings, or customer rows.
2. Inspect live commission/ticket/package/employee/location tables, columns, enums, constraints,
   indexes, row-level-security policies, grants, functions, triggers, and existing row counts.
3. Compare live schema with `scripts/migrations/`, `types/supabase.generated.ts`, and
   `types/supabase.ts`; document drift and choose a data-preserving migration path.
4. Verify/install repository dependencies, Supabase CLI, PostgreSQL client/test tooling, Playwright
   browser support, and any diagnostic program/add-on required to complete implementation and
   verification.
5. If network, permissions, or environment restrictions block an installation or live diagnostic,
   request approval and report the blocker. Do not silently skip the check or replace live schema
   verification with assumptions.
6. Add dependencies through the package manager, review the lockfile, and document any required
   external/runtime tool. Do not rely on undocumented global software.
7. Implement reviewed, idempotent migrations; test on disposable PostgreSQL/staging, apply through
   the intended Supabase deployment workflow, then run `npm run types:supabase` and review the
   generated diff.

Never run migration tests against production or a database containing data that may be destroyed.
Never put Supabase secrets or customer/employee financial data in source, logs, chat, or plan files.

## 10. Delivery phases

### Phase 1: Verified schema and source contract

- Complete Phase 0 and reconcile existing commission tables.
- Add policy versions, effective-dated assignments, source events, exception handling, audit, and
  transactional producer functions.
- Publish strict event-variable contracts shared with Ticketing and Packages.

### Phase 2: Policy engine and Agent 1 validation

- Implement deterministic component evaluation, eligibility, rule snapshots, idempotency, and
  correction lineage.
- Configure Agent 1 through normal Manager/Admin UI/API and prove the £5 TK/DC, £0 R-ER, 10%
  low-fare, refund preservation, and package-scope cases.
- Configure the distinct Agent A/B/C tier examples and an independent assistance component; prove
  assisted events do not advance either targets or primary-sale tier counters.
- Add dry-run policy preview that never posts or changes history.

### Phase 3: Targets and agent experience

- Add weekly/monthly target assignment, issued-ticket aggregation, correction handling, progress
  DTO, and Ticketing progress-card integration.
- Replace the current Commission placeholder with own-agent entries/statements/targets and
  role-scoped management views.

### Phase 4: Statements and rollout

- Add monthly review, lock, payment, offsets, and negative carry-forward.
- Pilot with a small group whose individual policies are entered and reviewed.
- Reconcile one complete target week/month and one statement back to immutable source events before
  enabling all staff.

## 11. Test and acceptance plan

### Database/domain tests

- Live-schema discovery is recorded and migrations preserve any current rule/assignment rows.
- Policy assignment rejects unintended overlap and selects the correct effective version by date.
- Missing policy/input creates an exception; explicit zero creates a valid £0 result.
- Source-event retries are idempotent, conflicting duplicate keys fail, and corrections preserve
  lineage.
- Primary/assistant attribution fans out the configured recipient entries once; changing primary or
  assistants supersedes the prior result, transfers target ownership, and never advances an
  assistant's primary tier.
- Agent 1's three TK passengers calculate £15; three-person DC calculates another £15; R-ER is £0;
  positive low fare is 10%; higher fare uses the configured debit; refund preserves the original.
- Package ticket events use package rules, with fixed passenger/package and percentage-profit cases.
- Statement lock prevents mutation; later correction offsets in the next period; negative balance
  carries correctly.
- Target counting uses issued TK passenger count, includes package TK by default, ignores payment
  and non-TK events, retains real cancellations/refunds, and reverses erroneous issuance once.

### Authorization/UI tests

- Agents can view only their own Commission data and target history.
- Manager/Admin can configure policies/targets and close statements; Maintenance Admin cannot.
- Ticketing pages and APIs expose no calculated commission/profit fields.
- Ticketing target cards expose only the documented non-financial DTO.
- Source links respect the destination module's ownership/access rules.
- Every policy/assignment/adjustment/statement/target mutation writes an audit event.

### Required repository checks

```bash
npm run types:supabase
npm run typecheck
npm run lint
npm run format:check:changed
npm run docs:check
npm run docs:check-api
npm run api:check-boundaries
npx vitest run --maxWorkers=4
npx next build --webpack
```

Add disposable PostgreSQL integration tests for migrations, event idempotency, calculation
transactions, statement locking, and target concurrency. Add component/route tests for every role
boundary and a Playwright smoke flow from issued ticket to target progress and Commission entry.

## 12. First-release boundaries

- No commission/rate editor inside Ticketing or Packages.
- No calculated commission/profit display in the Ticketing ledger/dashboard.
- No silent default policy for an unassigned employee.
- No automatic exchange-rate lookup.
- No payroll/Frappe payout transfer.
- No public leaderboard or disclosure of another agent's earnings/policy.
- No hard deletion or retroactive mutation of posted/locked history.

## 13. Success criteria

- Any agent's structure can be configured without changing Ticketing or Packages code.
- Ticketing and Packages emit complete, idempotent variables but no calculated earnings.
- The Ticketing ledger contains no commission/profit presentation.
- Agent 1 and materially different policies can coexist through effective-dated assignments.
- Weekly/monthly targets count issued passenger-tickets exactly once and motivate agents without
  exposing money in Ticketing.
- Agent-specific tiers and independent assistant components coexist without placing a commission
  formula in Ticketing or allowing assistance to inflate targets/tier counts.
- Every statement amount and target count traces to source events, policy/target versions, and audit
  history.
- Implementation begins from verified live Supabase truth with all required tooling installed and
  every required validation executed.
