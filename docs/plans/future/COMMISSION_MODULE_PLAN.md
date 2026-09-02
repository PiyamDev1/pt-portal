# Commission Module Integration Plan

> **Living implementation record.** This captures the current commission architecture and safety
> boundaries; it is not a fixed product goal. New requirements and live evidence take precedence.
> Commission remains the only module that may calculate employee pay outcomes. It owns policies,
> ordinary commission calculations, employee-attributed sales-profit bonuses, penalties, refund
> treatment, shadow reconciliation, Accounting review evidence, future statements and balances,
> and staff sales targets. Ticketing, Packages, Applications, and future source modules publish
> immutable business facts; they never own commission formulas or outcomes.

- **Status:** Phase 1 shadow capability, employee-owned agreements, Ticketing/Package/Application
  sources, confirmed-refund policy, staff reports, and immutable Accounting review implemented;
  capability `2026090201` passed the full disposable PostgreSQL workflow suite and is deployed to
  linked Supabase; full-month reconciliation pending
- **Last updated:** September 2, 2026
- **Owner:** PT-Portal Team
- **Primary dependency:** [Ticketing Module Plan](TICKETING_MODULE_PLAN.md)
- **First delivery:** Employee-owned setup, Admin/HR reconciliation, and own-employee preview; no
  payable entries

Implementation checkpoint on September 2, 2026: capability `2026090201` extends the
employee-owned shadow engine with independent three-letter pay currencies, audited monthly
units-per-GBP conversion, multiple cumulative profit-bonus targets, optional recurring
post-threshold bonuses, append-only ADM/loss penalties, and an employee-plan choice to retain or
reverse original Ticketing commission after a confirmed supplier refund. It also adds a staff
breakdown in Shadow Console and a versioned handoff to Accounting. Accounting may return a report
with a reason or give final approval through a different reviewer; final approval fixes the report
and its evidence without creating payroll, payment, balances, or payable entries.

### Verified migration route — September 2, 2026

The linked database was re-read after the parallel Ticketing workspace completed its deployment.
Its current state is:

- Ticketing capability `2026090204`, ending at
  `20260902_ticketing_correction_refund_hardening.sql`, is live. Do not rerun Ticketing
  capabilities `2026090201` through `2026090204`.
- The separate `20260902_atomic_staff_assignment_updates.sql` objects are live: the approval table,
  atomic staff-assignment RPC, and staff-review RPC were all found. Do not rerun that script.
- Commission capability `2026090201`, ending at
  `20260902_commission_compensation_accounting_workflow.sql`, is now live. It was applied only after
  Ticketing `2026090204`; do not rerun it.

The deployment verified Commission `2026090201`, all six adjustment/refund/review tables, the
confirmed-refund trigger, public versus private routine grants, and preservation of the 64 existing
`missing_exchange_rate` exception rows. Linked Supabase types were regenerated afterwards. The
combined disposable database runner completed successfully with Ticketing `2026090204` followed by
Commission `2026090201`, including a live-compatibility fixture for the earlier exception code.

The earlier foundation still provides independent Ticket Assistance rates for selected primary
agents, optional Date Change marginal-tier volume, Low/higher-fare handling, closed and reconciled
Package facts, completed Application facts, effective-dated employee-owned snapshots, typed
exceptions, and system-attributed processing. Shared family transport references feed one physical
`Group main transport` row without double-counting booked cost, and received supplier commission
is used instead of its projection. Active HR department membership in Staff Management remains the
HR authority. A complete calendar-month reconciliation remains required before any live/payable
phase.

## 1. Purpose and delivery decision

The Commission module is the only PT-Portal module allowed to define pay rules, calculate employee
credits or debits, evaluate monthly sales-profit bonuses, create statements, carry balances, or
display commission outcomes.

Every employee may have materially different effective-dated rules. Source modules therefore emit
strict variables and stable identities without selecting a rate or calculating money. Commission
matches the employee, service, recipient role, location, and business date to an immutable policy
version.

The first usable delivery is deliberately a **shadow foundation**:

- Authorised Admin/HR users create one complete, independently versioned agreement around an
  employee. Copying an existing agreement is a one-time fork, never a shared mutable link.
- Existing and new Ticketing source events calculate into signed, non-payable shadow entries.
- Closed, reconciled Package sales calculate fixed-per-package, fixed-per-passenger, percentage-of-
  final-profit, or explicit-zero components into the same shadow ledger.
- Completed NADRA, Pakistani passport, British passport, and Visa work calculates a distinct fixed
  per-application or explicit-zero component for the responsible employee.
- Monthly employee-attributed profit can award several cumulative target bonuses and a configurable
  recurring bonus after the final target.
- Confirmed Ticketing refunds apply the employee plan's snapshotted retain/reverse choice; a
  provisional or withdrawn confirmation produces no Commission decision.
- Authorised Admin/HR users can append reasoned ADM/loss/other penalties in the employee's native
  currency without editing calculated source entries.
- Shadow Console snapshots a ready completed month and sends the staff breakdown to Accounting for
  independent return or final locked approval.
- Missing policies, inputs, or unsupported source states remain visible exceptions.
- Employees receive a read-only view of their own agreement and clearly labelled calculation
  preview. They do not receive statements, balances, payouts, or target cards in this delivery.

Shadow results are never promoted into payable history. After a complete month reconciles, the live
release recalculates from the same immutable facts and policy versions into separately posted
entries.

## 2. Non-negotiable boundaries

- Never hard-code an employee rate or bonus target in Ticketing, Packages, UI components, source
  migrations, or seed data.
- Never store calculated employee commission, bonus, earnings, or company profit in Ticketing
  tables or present it in Ticketing ledger/Low Fare views.
- Never accept arbitrary executable formulas. Policies compose reviewed, typed calculation
  components over approved variables.
- An employee without an applicable policy produces `needs_policy`; zero commission requires an
  explicit zero component.
- Every policy version, assignment, location override, and bonus rule is effective-dated.
- Reusable setups are copied into an employee-owned snapshot. A later change creates a new snapshot
  and new immutable per-service policy versions; it cannot mutate another employee or history.
- Future scheduled snapshots can be cancelled with a reason before they become effective. The
  prior agreement is restored atomically and the cancellation is audited.
- A policy version becomes immutable when activated. Draft previews store the exact draft snapshot
  and content hash used, but do not prevent further draft editing; changes to an active version
  require a cloned draft.
- Source events and posted entries are append-only. Corrections use supersession, offsets, and
  replacements linked to the prior facts and calculations.
- Manual penalties are append-only debits with reason, actor, native amount, conversion evidence,
  and exact reversal lineage. They do not alter contributed-profit targets.
- Primary responsible employees, Low Fare actors, and assistants are distinct roles. Assistance and
  Low Fare may earn independently without advancing primary ticket-count tiers or issued-ticket
  targets.
- Ticket Assistance belongs to the assistant's employee-owned plan. It can apply at one shared rate
  when assisting any primary agent or use an independent rate for every explicitly selected primary
  agent; changing that list or its rates creates a new
  effective-dated plan version and never alters another employee's plan.
- Fixed pay rates, salary, bonus rewards, and adjustments may use any normalised three-letter pay
  currency. GBP is the book currency; every non-GBP amount uses an audited month-specific number of
  native units per GBP, and the rate locks once calculations or a review batch use it. One employee
  plan may mix service currencies. Calculations use PostgreSQL `numeric` and actual GBP source
  variables. JavaScript floating point, inferred exchange rates, and currency-ambiguous package
  metadata are never financial authority.
- Refund commission treatment is configured in the employee's effective plan, never in Ticketing.
  Only a non-package refund confirmed after final supplier/airline recovery can retain or reverse
  the original current Commission entries. Withdrawal/voiding supersedes that decision.
- A submitted Accounting batch is independently reviewed. The submitter cannot give final approval;
  stale source evidence blocks approval, and `approved_locked` membership and totals are immutable.
- Missing financial inputs create exceptions; they are not treated as zero.
- Payment state does not gate the initial ticket commission policy. A valid Issued fact earns the
  applicable ordinary issuance component immediately.

## 3. Access and presentation

### 3.1 Access capabilities

Commission HR access follows the existing many-to-many Staff Management department allocation.
The canonical department names `HR`, `Human Resource`, and `Human Resources` are normalised to the
same access boundary.

- Admin, Master Admin, and Super Admin may configure and preview policies company-wide.
- An active employee assigned to HR receives the policy/assignment/preview tools required for that
  responsibility, but no unrelated administrator privileges.
- Master Admin and Super Admin are the only browser users allowed to add or remove HR department
  membership. Removing HR membership removes Commission access immediately.
- Managers cannot create, edit, activate, or assign pay rules.
- Maintenance Admin receives no Commission access by default.
- Policy activation, assignment, preview, and manual reprocessing requests are audited with the
  employee actor and timestamp. Scheduled processing is audited as `system`.

### 3.2 First-delivery UI

Commission has two deliberate front doors:

- `/dashboard/admin-commission` is the normal Admin/HR workspace. It selects an employee first,
  shows their current/scheduled/history state, and saves a complete agreement atomically. An
  administrator may start from an explicit-zero blank agreement, the employee's current agreement,
  or a one-time copy of another agreement. **Edit commission** is a distinct workflow that loads
  only the employee's current values and saves an effective-dated immutable replacement. **New
  commission** starts blank or from a one-time template copy and never changes its source profile.
  Both operations remain local to the target employee. Past effective dates are accepted when they
  do not overlap a completed or later plan and do not rewrite already-calculated history.
- `/dashboard/my-performance` is available to every active employee. Its earnings section exposes
  only that employee's agreement, selected historical month/YTD preview, six-month chart ending at
  that month, service breakdown, and recent calculated entries. Evidence is collapsed by default
  on Activity, Attendance, and Earnings. `/dashboard/my-commissions` remains a compatibility
  redirect.
- `/dashboard/admin-commission/engine` retains the advanced policy, assignment, synthetic preview,
  shadow-entry, bonus-period, exception, and reconciliation tools.
- `/dashboard/commissions` remains only as a role-aware compatibility redirect.

The advanced reconciliation workspace contains:

- Reconcile: readiness guidance, pending/processed/held events, exceptions, and preview totals.
- Calculated results: searchable recipient, service, primary sale owner, amount, revision, and
  Ticket Assistance scope result.
- Action queue: human-readable issue guidance and audited retries after the underlying cause is
  corrected.
- Monthly bonus: contributed profit, commission cost, qualifying result, target, reward, and
  incomplete-input state.
- Formula preview: test a draft against synthetic or authorised historical variables without writing an
  entry.
- Policy lab and Manual assignments: retained as explicitly advanced diagnostic tools; normal
  employee setup belongs in Admin commission.
- Access is managed in Staff Management by assigning or removing the HR department.
- Staff report: a completed-month employee breakdown across salary, Ticketing, Applications,
  Packages, refund decisions, bonuses, and penalties, with native-currency totals and GBP book
  equivalents. A ready report can be prepared and submitted to Accounting.

`/dashboard/accounting/commissions` is restricted to active Accounting/Accounts department members
and portal administrators. It exposes submitted reports, immutable source evidence, return reasons,
staleness, separation-of-duties guidance, and final fixed approval. Accounting approval is an audit
lock, not a payroll/payment action.

Shadow money is exposed to its employee only as an unmistakable non-payable calculation preview.
Future live visibility is:

- Employee: own entries, sales-bonus progress, statements, and balances.
- Manager: read-only results for their direct/indirect reporting subtree.
- Admin/authorised finance roles: company-wide review and statement operations.

Dashboard navigation contains **My performance** for all active employees and **Admin commission**
only when the database-backed Commission management capability succeeds. The persisted dashboard
module ID remains `my-commissions` so existing favourites and mobile shortcuts survive the rename.

## 4. Source-event and attribution contract

### 4.1 Common envelope

Keep the implemented `commission_source_events` ingestion boundary and strict versioned envelope:

| Field                 | Meaning                                                    |
| --------------------- | ---------------------------------------------------------- |
| `source_module`       | Producer such as `ticketing` or `packages`                 |
| `source_event_id`     | Producer-owned immutable UUID                              |
| `source_fact_key`     | Stable identity for successive versions of one fact        |
| `source_record_id`    | Producer record UUID                                       |
| `event_type`          | Stable business event code                                 |
| `contract_version`    | Source-variable contract version                           |
| `event_version`       | Increasing correction version                              |
| `supersedes_event_id` | Producer source-event UUID being corrected, or JSON `null` |
| `employee_id`         | Event recipient/actor according to the event contract      |
| `owner_employee_id`   | Primary operational/profit owner when different            |
| `location_id`         | Source branch/location                                     |
| `occurred_at`         | UTC fact creation timestamp                                |
| `effective_on`        | Business date for the event                                |
| `source_path`         | Internal authorised source link                            |
| `variables`           | Strict payload for `event_type` and `contract_version`     |
| `idempotency_key`     | Retry-safe producer identity                               |

Unknown contract versions, conflicting idempotency replays, invalid lineage, inactive recipients,
and incomplete attribution fail into typed exceptions rather than partial calculations.

### 4.2 Calculation identities

A calculated entry must store both identities:

- `recipient_employee_id`: employee receiving the credit/debit.
- `profit_owner_employee_id`: primary employee whose originating sale owns the contributed profit.

It also stores a stable `source_case_key` that groups a root sale and its later assistance, Low Fare,
higher-fare, refund, and correction facts. This prevents a Low Fare finder or assistant from being
mistaken for the seller whose monthly profit is being measured.

### 4.3 Ticketing facts

The implemented Ticketing boundary already publishes root TK issuance/sale/payment facts,
DC/R-ER service events, Low/higher fare adjustments, primary/assistant attribution, actual GBP
values, passenger counts, package scope, and correction lineage.

Commission applies these rules:

- Root TK issuance and its assistant components use the root issue date.
- DC/R-ER ordinary entries use their service issue date.
- Low/higher fare ordinary entries use the adjustment date and the acting employee's effective
  policy.
- The profit effect of a Low/higher fare adjustment remains attached to the root sale owner and root
  sale bonus period.
- `ticket_paid` remains an operational fact and does not gate the initial issuance commission.
- Root assistance uses each assistant's own effective assistant policy. That plan may apply to all
  primary agents or an explicit selected-agent list; an out-of-scope assistance fact produces a
  transparent zero preview result.
- Current root attribution supplies assistants only for TK. DC/R-ER assistance remains unsupported
  until Ticketing emits transaction-scoped assistant facts.
- Package-scoped Ticketing facts do not also receive ordinary Ticketing commission unless a future
  policy explicitly enables dual treatment.

The Ticketing refund workflow now publishes a Commission fact only after the responsible agent or
an administrator confirms the recovered supplier/airline result as correct. Until then the refund
is provisional and cannot close. The confirmed fact contains lifecycle/ownership references rather
than a caller-selected pay outcome. Commission snapshots the effective employee plan's
`retain`/`reverse_original` choice; Package-scoped refunds remain under authoritative Package profit
and cannot also reverse Ticketing commission. Later supplier evidence, voiding, or confirmation
withdrawal publishes a superseding fact so the prior decision and any reversal are neutralised
without deletion.

### 4.4 Package facts and interim metadata

The implemented closed-Package producer provides:

- Package/reservation/group identity and type.
- Primary sales responsible employee and any separately attributed recipients.
- Passenger count for fixed-per-passenger rules.
- Actual settled GBP revenue, costs, received supplier commissions, discounts, supplier/customer
  refunds, and final profit before employee commission.
- Earned date, package lifecycle/version, location, and correction lineage.

The producer runs only for a closed package and treats the source as authoritative only when it has
an active sales owner, branch, passenger rows, completed reservations, a settled active invoice,
paid package state, no pending payment, and GBP financial rows. Missing readiness becomes
`package_source_not_authoritative`; it is never silently treated as zero. Reservation, invoice,
payment, passenger, or package corrections append a superseding source version and shadow entry
revision. Existing closed records that pre-date event capture are surfaced in the Admin module
coverage view rather than backfilled without review.

Group package transport follows the Packages accounting model: family allocation rows are retained
as invoice references, their sold/discount/refund/received-commission values roll into the single
physical main transport row, and their allocated booked values are excluded from Package profit.

The existing `provisionalAgentCommissions` package metadata remains audit evidence only. It may be
currency-ambiguous, calculated with browser numbers, edited manually, or already settled outside
Commission. It must never generate an automatic shadow or payable entry.

A later reconciliation queue will let an authorised reviewer:

1. Resolve the package/reservation currency and actual GBP value.
2. Match the employee and package role.
3. Mark the provisional line as unpaid, already paid, replaced, or invalid.
4. Compare it with the effective policy result.
5. Post only through the live Commission workflow while retaining the original metadata evidence.

### 4.5 Application facts

Applications publish one immutable fact only when staff work reaches its operational terminal
state: `Completed` for NADRA, British passport, and Visa records, and `Collected` for Pakistani
passports. The employee stored on that application is the recipient; their current branch supplies
the source location. Package-linked Visa processing remains separate application work and can earn
its fixed Application rate without reusing Package profit.

Application commission supports only fixed-per-completed-application or explicit zero. Mutable
pricing tables are not a safe historical profit basis across all four Application services. A
refund, cancellation, reopened status, employee reassignment, or deletion appends a superseding
source fact and zeroes the prior active shadow earning before any corrected earning is created.
Existing terminal Application rows are backfilled using their first recorded terminal status date
where history exists, otherwise their recorded application date. They remain `needs_policy` until
an applicable employee-owned plan covers that date.

## 5. Policy model

### 5.1 Per-service assignments

Policy matching uses:

```text
employee + source module + service + recipient role + business date + source location
```

- Assignments have `effective_from` and optional `effective_to`.
- Assignment services include at least TK primary, TK assistance, DC, R-ER, Low Fare, higher fare,
  Package sale, and monthly sales bonus.
- An employee-wide assignment applies at every location unless one exact location-specific
  assignment covers that source date.
- An exact location assignment wins over the employee-wide assignment.
- Overlaps at the same specificity are rejected; there is no numeric priority or silent winner.
- Bulk assignment previews and confirms individual effective-dated rows.
- Policies containing monthly count tiers or sales-bonus aggregation may start/end only on the
  first day of a calendar month.

### 5.2 Typed components

The engine supports these reviewed component types:

- Fixed pay-currency amount per issued/affected passenger-ticket.
- Fixed pay-currency amount per transaction/event.
- Percentage of an approved positive or signed GBP variable.
- Independent fixed or percentage assistant component.
- Explicit zero for a supported service.
- Signed debit treatment for adverse movements.
- Marginal ticket-count tiers.
- Fixed package amount or fixed amount per passenger.
- Percentage of authoritative final package profit.
- Monthly threshold-gated sales bonus.
- Optional component minimum, maximum, and policy-level floor/cap.

Each component declares its source variable, recipient role, eligibility state, sign behaviour,
rounding rule, and combination order. Components sum in their declared order; caps/floors apply only
where the policy explicitly configures them.

Rates use `numeric` precision. Source money and final entries round to GBP pennies using PostgreSQL
round-half-away-from-zero semantics. Percentage rates retain sufficient precision until the final
component result is rounded.

### 5.3 Ordinary earning and marginal tiers

- Issued root TK earns its configured fixed/tier component without waiting for payment.
- A missing customer sale value does not block a fixed-per-ticket component, but it holds any
  profit-dependent component.
- Tier counters reset by calendar month in the source branch timezone.
- Tiers are marginal: tickets 1-30 keep their first rate; ticket 31 onward receives the next rate.
- Only primary issued units count by default. An employee agreement can explicitly include completed
  Date Change passenger-ticket units. Assistance, Low Fare, R-ER, refund, voucher, and payment
  events always contribute zero to the primary TK tier count.
- Within a period, issued units order by the immutable `issued_at` source variable and stable source
  identity so replay produces the same tier allocation.
- A correction may re-rank an open/shadow period and append superseding shadow entries.

### 5.4 Monthly employee sales-profit bonus

The sales bonus is a separate aggregate component managed for the employee by authorised Admin/HR
staff. It is not a Ticketing target and is never displayed in the Ticketing dashboard.

```ts
type SalesBonusRule = {
  period: 'calendar_month'
  eligibleServices: string[]
  payCurrency: string
  steps: Array<{
    thresholdGbp: string
    rewardKind: 'fixed_gbp' | 'percentage_of_qualifying_profit'
    rewardValue: string
  }>
  recurring?: {
    startsAtGbp: string
    intervalGbp: string
    rewardKind: 'fixed_gbp' | 'percentage_of_qualifying_profit'
    rewardValue: string
    maxOccurrences?: number
  }
}
```

- The period is a calendar month in the originating sale's branch timezone.
- Targets, eligible services, reward currency, and recurrence are employee-specific and
  effective-dated variables.
- The employee receives nothing below the first target. Each reached one-off step contributes its
  configured reward, allowing several cumulative targets in one month.
- A fixed reward is recorded in the configured pay currency and converted to GBP book value with
  that month's audited rate. The stored `fixed_gbp` discriminator is retained for backward
  compatibility even though its value follows `payCurrency`. A percentage reward applies to
  qualifying contributed profit and is recorded in the same pay currency.
- An optional recurring rule starts strictly after the highest one-off target and adds its reward
  at each configured GBP interval, with an optional occurrence cap. Example: £100 at £2,000 plus
  £50 for every further £1,000 awards £100 at £2,000, £150 at £3,000, and £200 at £4,000.
- The bonus entry itself is excluded from its own qualifying basis, preventing recursion.
- Missing sale-profit inputs keep the period `incomplete`; they never count as zero or produce a
  premature bonus.

For each eligible primary sale:

```text
gross contributed profit
  = actual GBP customer sale value
  - actual GBP supplier cost
  + signed Low Fare/higher-fare supplier adjustments
  + other authoritative signed profit movements

ordinary commission cost
  = sum of all non-bonus signed Commission entries attached to that sale
    across the primary seller, assistants, and Low Fare actors

qualifying contributed profit
  = sum(gross contributed profit) - sum(ordinary commission cost)
```

A positive commission credit is a company cost and reduces qualifying profit. A negative employee
debit reduces company commission cost, so subtracting that signed debit increases the retained
contribution. Refund/package movements join the formula only after their producer supplies
authoritative signed GBP facts.

#### Low Fare and assistance attribution

- The primary responsible employee owns the sale's contributed profit.
- A positive Low Fare saving increases that primary seller's gross contribution.
- The Low Fare actor earns under their own effective Low Fare policy.
- That Low Fare earning reduces the originating primary sale's qualifying contribution.
- Each assistant earns under their own effective assistant policy.
- Assistant earnings reduce the originating primary sale's qualifying contribution.
- Low Fare and assistance earnings do not create sales-profit progress for the finder/assistant.
- If the primary seller is also the Low Fare actor, both the saving and commission naturally affect
  the same employee period.

#### Supplier fare increase adjustment

This optional rule is the negative side of the same verified supplier-fare comparison used for Low
Fare. It is not a customer sale, an automatic penalty, or a percentage of the customer price.

```text
difference = original supplier fare - replacement supplier fare
GBP 500 - GBP 540 = -GBP 40
10% configured adjustment = -GBP 4 for the acting employee
```

Selecting **No adjustment** stores an explicit zero component. A configured percentage applies to
the signed difference, so a supplier decrease remains the separate positive Low Fare case and a
supplier increase produces a negative preview adjustment. Selecting **Full fare increase
difference** applies 100% of that signed difference, so the example produces a -GBP 40 employee
adjustment rather than -GBP 4.

Required example:

```text
50 tickets x £25 gross profit                    £1,250
50 tickets x £5 primary ticket commission         -£250
                                                   -----
qualifying contributed profit                    £1,000
configured target                                £1,000
configured fixed sales bonus                       £100
```

Required extended example:

```text
gross primary ticket profit                      £1,250
primary ticket commission                         -£250
assistant commission                               -£50
Low Fare saving                                    +£100
Low Fare finder commission                          -£10
                                                   -----
qualifying contributed profit                    £1,040
£1,000 target reached                               yes
configured fixed sales bonus                       £100
```

### 5.5 Corrections and locked periods

During shadow mode, any source correction or policy replay appends a new calculation revision and
recomputes the affected monthly result. Prior shadow evidence remains traceable.

A draft review batch snapshots the current source hash for one completed month. Changes before
submission make that draft stale; preparing again retains it as superseded evidence and creates a
fresh batch. A submitted stale batch must be returned by Accounting. Final `approved_locked`
batches cannot be rewritten, and new exchange rates or penalties for a period under active review
are rejected rather than silently changing its totals.

In the future live release:

- Open periods recalculate through offset/replacement entries.
- Locked statements and bonus results are not rewritten.
- A late correction calculates the signed difference from the historical locked result and posts it
  into the next open statement, linked to the original sale/month/policy snapshot.
- An attribution correction transfers the sale contribution and all attached commission costs to
  the corrected primary employee without crediting the entry actor or assistants.

## 6. Shadow processing and exception lifecycle

### 6.1 Processing model

Commission processing must not make Ticketing writes fail because an employee lacks a policy.

1. Ticketing/Packages append their source event atomically with the authoritative source change.
2. The existing source-event state starts `pending`.
3. A Commission worker claims bounded batches with `FOR UPDATE SKIP LOCKED`.
4. The worker validates contract/version/lineage and resolves policy assignments.
5. It writes an immutable calculation run and signed shadow entry revisions.
6. Aggregate bonus periods recompute after ordinary entries for the affected source case settle.
7. Expected business problems become held typed exceptions; transient failures retry with bounded
   backoff.

The first delivery uses a daily scheduled worker plus an authorised `Process now` operation. New
source writes never synchronously depend on the complete calculation engine.

All existing supported source history is processed. There is no arbitrary launch cutoff; old facts
without policies or inputs become visible exceptions for reconciliation.

### 6.2 Required exception codes

- `needs_policy`
- `ambiguous_assignment`
- `unsupported_contract_version`
- `missing_required_variable`
- `inactive_recipient`
- `invalid_source_lineage`
- `unresolved_package_scope`
- `package_source_not_authoritative`
- `bonus_period_incomplete`
- `calculation_failed`

Policy activation or corrected source input requeues matching held events. An authorised user may
retry an exception but cannot manually mark a financial result successful.

### 6.3 Preview contract

Preview uses the same policy resolver and calculator as shadow processing but writes no source
state, entry, bonus period, or balance. It returns:

- Matched assignment and policy version.
- Validated input variables.
- Component-by-component calculation and rounding.
- Recipient and profit owner.
- Tier/bonus-period context where applicable.
- Signed total or typed exception.

Historical preview requires the caller to have access to that employee/source record. Synthetic
preview contains no customer data and is always labelled non-authoritative.

## 7. Ticket-count targets remain separate

The monthly GBP sales-bonus target is not the non-financial Ticketing sales target.

Future target delivery remains Commission-owned:

- Independent weekly and monthly issued-TK passenger-ticket targets per employee.
- Default weekly Monday-Sunday and calendar-month periods in branch timezone.
- Primary TK issuance counts once; payment adds nothing.
- Assistants receive zero units.
- DC, R-ER, Low Fare, refund, cancellation, and voucher events do not count.
- Package-linked TK issuance counts unless an explicit target assignment excludes it.
- Genuine later cancellation/refund keeps issuance credit; erroneous issuance reverses it.
- Attribution correction transfers units through source-event lineage.

The future read-only Ticketing DTO remains:

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

It contains no commission, sales bonus, or profit values.

## 8. Accounting review is implemented; payable statements remain later

The current Shadow Console handoff creates immutable, explicitly non-payable review batches. Each
batch stores employee statements, included current entry/adjustment evidence, native-currency
subtotals, GBP book totals, source hash, revisions, and reviewer events. Accounting can return a
submitted batch with a reason or approve it with a different reviewer. Final approval fixes that
evidence but does not create a balance, payment, payroll instruction, or live Commission entry.

After one full shadow month reconciles:

- Posted Commission entries are signed GBP values linked to one source event/case, recipient,
  profit owner, and immutable policy/component snapshot.
- Positive credits and negative debits share one running employee balance.
- Monthly statements snapshot opening balance, entries, credits, debits, sales bonus, closing
  balance, approved amount, payment state, approver, and timestamps.
- Approval locks membership/calculations; later corrections post into the next open statement.
- Negative balances carry forward. A non-positive closing payable amount pays £0 while retaining the
  signed carry-forward.
- Payment recording is audited. Payroll/Frappe transfer is outside the initial live statement
  release.
- Manual adjustments require an authorised actor, reason, source reference, and signed GBP amount;
  they never edit a source-calculated entry.

## 9. Data and API design

### 9.1 Existing baseline and migration strategy

The generated schema already contains legacy `commission_rules`, `commission_rate_components`,
`commission_tiers`, and `employee_commission_assignments`, plus the implemented
`commission_source_events` and `commission_source_event_states` boundary. The legacy rule tables are
too narrow for service-specific effective versions, signed entries, bonus aggregation, and
department-derived HR access.

Before DDL, verify the linked database objects, policies, grants, functions, triggers, row counts,
and drift. Preserve any production rows. If the expected legacy tables remain empty, evolve them
through a clean versioned migration; if rows exist, migrate each legacy rule into an explicit v1
policy version and produce a backfill report.

Expected capabilities:

| Table/capability                    | Responsibility                                              |
| ----------------------------------- | ----------------------------------------------------------- |
| `commission_rules`                  | Stable named policy identity                                |
| `commission_policy_versions`        | Immutable draft/active/retired policy versions              |
| `commission_policy_components`      | Typed component configuration and ordering                  |
| `commission_tiers`                  | Marginal threshold bands tied to policy versions            |
| `employee_commission_assignments`   | Per-service/role/location effective assignments             |
| `employee_commission_profiles`      | Employee-owned, effective-dated agreement snapshots         |
| `commission_monthly_exchange_rates` | Audited month/native-currency units-per-GBP conversion      |
| `commission_access_grants`          | Retained legacy grant audit; no longer an authority source  |
| `commission_source_events`          | Existing immutable producer facts                           |
| `commission_source_event_states`    | Existing claim/retry/held processing state                  |
| `commission_calculation_runs`       | Preview/shadow/live run metadata and policy snapshot        |
| `commission_entries`                | Signed shadow/live revisions with recipient/profit owner    |
| `commission_period_results`         | Monthly profit/threshold/reward calculation snapshots       |
| `commission_exceptions`             | Typed held facts and resolution/retry evidence              |
| `commission_audit_events`           | Access, policy, assignment, processing, and statement audit |
| `commission_adjustments`            | Append-only ADM/loss/other debits and exact reversals       |
| `commission_refund_decisions`       | Confirmed-refund retain/reverse snapshots and lineage       |
| `commission_review_batches`         | Versioned Shadow-to-Accounting period handoff               |
| `commission_review_statements`      | Fixed per-employee batch totals                             |
| `commission_review_batch_entries`   | Included immutable entry/adjustment evidence                |
| `commission_review_events`          | Prepare/submit/return/approval audit trail                  |
| Future statement/target tables      | Live balances, statements, membership, and ticket targets   |

Use strict constraints for component kinds, recipient roles, service codes, policy states, entry
modes, and exception states. Browser roles receive no direct table mutation grants; authorised API
routes call service-only transactional functions after server-side session/permission checks.

### 9.2 First-delivery APIs

- `GET /api/commissions/me` (caller-owned agreement and preview only)
- `GET /api/travel-packages/{packageId}/commission-readiness` (pay-free source readiness and
  shadow-processing state for staff who can already view that Package)
- `GET /api/commissions/admin`
- `POST /api/commissions/admin/profiles`
- `POST /api/commissions/admin/exchange-rates`
- `GET /api/commissions/admin/staff-report?period=YYYY-MM`
- `POST /api/commissions/admin/adjustments`
- `POST /api/commissions/admin/review-batches/prepare`
- `POST /api/commissions/admin/review-batches/{batchId}/submit`
- `POST /api/commissions/admin/profiles/{profileId}/cancel`
- `POST /api/commissions/admin/process`
- `POST /api/commissions/admin/exceptions/{exceptionId}/retry`

- `GET/POST /api/commissions/policies`
- `GET/PATCH /api/commissions/policies/{policyId}` for stable metadata only
- `GET/POST /api/commissions/policies/{policyId}/versions`
- `POST /api/commissions/policies/{policyId}/versions/{versionId}/activate`
- `GET/POST /api/commissions/assignments`
- `PATCH /api/commissions/assignments/{assignmentId}`
- `POST /api/commissions/preview`
- `GET /api/commissions/shadow-entries`
- `GET /api/commissions/bonus-periods`
- `GET /api/commissions/exceptions`
- `POST /api/commissions/exceptions/{exceptionId}/retry`
- `POST /api/commissions/process`
- Legacy access-grant handlers return `410`; Staff Management owns HR access.
- `GET /api/cron/commissions/process`
- `GET /api/accounting/commissions/review-batches`
- `GET /api/accounting/commissions/review-batches/{batchId}`
- `POST /api/accounting/commissions/review-batches/{batchId}/return`
- `POST /api/accounting/commissions/review-batches/{batchId}/approve`

All list endpoints use bounded filter-bound keyset pagination and return semantic DTOs. Mutation
routes validate strict request schemas, derive actor identity from `requireStaffSession`, enforce
the Commission capability server-side, use idempotency keys, and return no customer PII that the
caller is not authorised to see.

Source ingestion is never a browser endpoint.

Future agent/statement/target endpoints are added only with their delivery phase; do not publish
empty or misleading contracts in the shadow release.

## 10. Mandatory environment and database discovery

Implementation starts with all of the following:

1. Confirm the intended linked Supabase project without printing credentials or customer/employee
   financial rows.
2. Inspect live commission, Ticketing, Packages, employees, locations, RLS, grants, enums,
   constraints, functions, triggers, indexes, and aggregate row counts.
3. Compare live schema with migrations and generated types; record drift and the preservation plan.
4. Verify repository dependencies, Supabase CLI, PostgreSQL disposable-test tooling, and browser
   test support.
5. Test idempotent migrations on disposable PostgreSQL/staging before the linked deployment.
6. Apply through the intended Supabase migration workflow, regenerate linked types, and review the
   complete generated diff.
7. Never run destructive migration tests against production or expose secrets/financial data in
   source, logs, chat, or documentation.

## 11. Delivery phases

### Phase 1: Shadow foundation and policy setup

- Complete live discovery and reconcile legacy commission tables.
- Add department-derived HR access, policy versions/components, per-service assignments, signed
  shadow entries, period results, exceptions, audit, and processing functions.
- Implement typed fixed/percentage/zero/signed/tier/assistant/package/bonus components.
- Replace the placeholder with the Admin/HR policy, preview, shadow, bonus-period, and exception
  console.
- Add mixed-currency staff reports, append-only penalties, confirmed-refund treatment, and the
  versioned Shadow-to-Accounting review/return/final-lock workflow.
- Replay all supported Ticketing history and reconcile at least one full calendar month.
- Keep every result explicitly non-payable. An employee may see only their own preview through the
  dedicated self endpoint; managers receive no Commission access by role alone.

### Phase 2: Live entries, statements, and agent experience

- Recalculate approved policies into separate posted entries; never promote shadow rows.
- Promote the existing own-agent preview to approved live entries, then add bonus progress, monthly
  statements, signed balances, locks, offsets, and payment recording.
- Enable manager subtree read-only visibility and company-wide authorised review.
- Pilot a small employee group and reconcile source facts, ordinary entries, bonus result, statement,
  and payment evidence.

### Phase 3: Non-financial Ticketing targets

- Add weekly/monthly issued-ticket target assignments and correction-safe period aggregation.
- Publish the non-financial progress DTO and add the Ticketing target card.
- Keep sales-bonus GBP progress inside Commission only.

### Phase 4: Packages and refunds

- Authoritative settled-GBP closed-Package production and configured Package components are now
  enabled in shadow mode.
- Package Operations now checks the same authoritative Commission snapshot before closure, explains
  reconciliation issues without exposing employee pay or package profit, and shows the immutable
  source version's pending/processed/held state after closure. Readiness problems warn without
  blocking the operational Package closure; the existing sales-owner attribution requirement still
  must be satisfied.
- Existing Package allocation metadata is labelled as provisional costing only: it may reduce the
  Package profit estimate but cannot create or pay a staff Commission entry. The employee's
  effective Commission plan remains the sole earnings calculation source.
- Authoritative Ticketing refund/cancellation facts are enabled only after final supplier recovery
  is marked correct; Commission applies the employee plan's retain/reverse choice in shadow mode.
- Add provisional package metadata reconciliation and duplicate-payment prevention.
- Extend refund/late-correction impacts into the future live ledger through signed offsets without
  rewriting locked Accounting evidence or statements.

## 12. Test and acceptance plan

### 12.1 Domain/database tests

- Policy version immutability, activation, location override, overlap rejection, and effective-date
  selection.
- Missing policy/input creates a typed exception; explicit zero creates a valid £0 result.
- Idempotent source retries and worker retries produce one active calculation result.
- Source correction/attribution lineage appends superseding results without duplication.
- Monthly marginal tiers apply higher rates only after each threshold.
- Archived Ticketing facts have zero current Commission and cannot remain in marginal-tier volume;
  later entries in the same month are superseded with recalculated tier positions.
- Selected Ticket Assistance primary agents can each resolve to a different fixed rate.
- Non-GBP fixed earnings retain their local amount and use the locked monthly rate for the GBP book
  equivalent.
- Different services, salary, bonus, and penalty rows may retain different three-letter currencies
  in one employee report while reconciling to one audited GBP book total.
- Assistants use their own policies and receive zero primary tier/target/bonus units.
- Fixed issuance commission calculates before Paid and before unrelated profit variables complete.
- Profit-dependent components remain incomplete until actual GBP inputs exist.
- The £1,250 minus £250 example reaches £1,000 and awards a £100 fixed bonus.
- £999.99 earns no threshold bonus.
- At a £1,000 threshold, a 10% reward pays £100 at £1,000 and £150 at £1,500.
- £50 assistant cost moves a £1,000 qualifying result to £950 and removes the bonus.
- A £100 Low Fare saving and £10 finder commission increase the originating seller's qualifying
  contribution by a net £90 while giving the finder no bonus progress.
- Low Fare by the primary seller does not double-count either saving or commission.
- A higher-fare loss and signed debit produce the configured retained-company result.
- Multiple reached bonus targets accumulate their configured rewards; recurring rewards begin only
  after the highest one-off target and respect their interval and optional cap.
- ADM/loss penalties are immutable debits, do not change qualifying profit, reject conflicting
  idempotency replays, and cannot be appended while a draft/submitted/approved period review exists.
- Provisional refunds create no decision. Confirmed non-package refunds retain or reverse according
  to the effective employee plan, and withdrawal/voiding supersedes any prior reversal exactly once.
- Review preparation rejects an open/incomplete month, replaces stale drafts with retained audit
  lineage, blocks stale approval, enforces submitter/reviewer separation, and makes final approval
  immutable under concurrent retries.
- Package metadata alone never creates an entry.
- Parallel workers claim each source event once and recover stale claims safely.

### 12.2 Authorization/UI/API tests

- Admin/Master/Super Admin and active HR department staff can manage policies as documented.
- Only Master/Super Admin can change HR department membership through browser workflows.
- Manager and Maintenance Admin roles cannot access shadow money or mutations. Ordinary employees
  can read only their own agreement/preview and cannot call any management mutation.
- Every mutation and retry writes an audit event.
- Preview writes no source state, entry, period, or balance.
- Policy forms expose only typed components/approved variables.
- Pagination cursors are bound to filters and employee access scope.
- Ticketing pages/APIs continue to expose no calculated commission, bonus, or profit values.
- Accounting navigation/report APIs remain hidden and forbidden for staff outside the
  Accounting/Accounts departments unless they hold an approved portal admin role.

### 12.3 Required validation

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

Add disposable PostgreSQL coverage for migrations, HR department access, policy matching, component math,
worker concurrency, source corrections, monthly tiers, bonus aggregation, and shadow supersession.
Add route/component coverage for the Admin/HR console and a browser smoke flow from policy creation
through historical shadow reconciliation.

## 13. First-delivery boundaries and success criteria

The shadow foundation includes no payable entry, statement, balance, payment, payroll transfer,
Manager money view, Ticketing target card, payable Package posting, automatic exchange rate, public
leaderboard, or hard deletion. Automatic Package source capture creates calculation evidence only.

It is successful when:

- Any employee's ordinary and bonus structure can be configured without source-module code changes.
- HR receives narrowly scoped policy-management access through Staff Management department
  allocation without becoming a portal admin.
- Ticketing facts process deterministically into explainable, signed, non-payable shadow entries.
- Authoritative closed-Package facts process into correction-safe, explainable, non-payable shadow
  entries without trusting browser commission metadata or double-counting group transport.
- Recipient and profit owner remain distinct through primary, assistance, and Low Fare cases.
- Monthly qualifying profit subtracts every ordinary commission cost attached to the employee's own
  sales and never includes the bonus being tested.
- Fixed and percentage bonus rewards both remain zero below their configured threshold.
- Every supported historical fact is processed or appears in a typed exception queue.
- A ready completed month can be restored after refresh, submitted once, independently returned or
  approved, and permanently fixed without creating a payable or payroll side effect.
- One complete month reconciles from source event to policy component, shadow entry, qualifying
  profit, and bonus result before live statements are authorised.
