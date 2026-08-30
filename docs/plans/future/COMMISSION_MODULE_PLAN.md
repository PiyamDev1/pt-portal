# Commission Module Integration Plan

> **Living implementation record.** This captures the current commission architecture and safety
> boundaries; it is not a fixed product goal. New requirements and live evidence take precedence.
> Commission remains the only module that may calculate employee pay outcomes, while
> policies, ordinary commission calculations, employee-attributed sales-profit bonuses, shadow
> reconciliation, statements, balances, and staff sales targets. Ticketing, Packages, and future
> source modules publish immutable business facts; they never own commission formulas or outcomes.

- **Status:** Phase 1 shadow capability, employee-owned agreements, and authoritative closed-Package
  source integration implemented; month reconciliation pending
- **Last updated:** August 30, 2026
- **Owner:** PT-Portal Team
- **Primary dependency:** [Ticketing Module Plan](TICKETING_MODULE_PLAN.md)
- **First delivery:** Employee-owned setup, Admin/HR reconciliation, and own-employee preview; no
  payable entries

Implementation checkpoint on August 30, 2026: capability `2026083003` includes employee-owned GBP or
PKR compensation, audited monthly PKR-per-GBP book conversion, independent Ticket Assistance rates
for each selected primary agent, optional Date Change marginal-tier volume, fixed Low Fare amounts,
the complete supplier-fare-increase debit, and archive-safe marginal recalculation. The additive
migrations retain employee-owned agreement snapshots, copy-on-create reuse, atomic per-service
policies and assignments, effective-dated replacement, and cancellation of future changes. Closed,
paid, reconciled Package folders now publish correction-linked source snapshots from database
finance records. Shared family transport references feed the one physical `Group main transport`
row without double-counting booked cost, and received supplier commission is used instead of the
projected value. The calculation engine, typed
exceptions, Admin/HR reconciliation console, and daily cron route remain the same audited shadow
foundation. Active HR department membership in Staff Management is the HR access source.
Scheduled runs use an explicit system audit actor and do not impersonate an employee. A complete
calendar-month reconciliation remains required before any live/payable phase.

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
- Monthly employee-attributed profit and sales-bonus results are reconciled internally.
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
- Primary responsible employees, Low Fare actors, and assistants are distinct roles. Assistance and
  Low Fare may earn independently without advancing primary ticket-count tiers or issued-ticket
  targets.
- Ticket Assistance belongs to the assistant's employee-owned plan. It can apply at one shared rate
  when assisting any primary agent or use an independent rate for every explicitly selected primary
  agent; changing that list or its rates creates a new
  effective-dated plan version and never alters another employee's plan.
- Fixed pay rates and salary may be denominated in GBP or PKR. PKR agreements use an audited,
  month-specific PKR-per-GBP rate for the accounting equivalent; the rate locks once calculations
  use it. Calculations use PostgreSQL `numeric` and actual GBP source variables. JavaScript floating point,
  inferred exchange rates, and currency-ambiguous package metadata are never financial authority.
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
- `/dashboard/my-commissions` is available to every active employee and exposes only that
  employee's agreement, monthly/YTD preview, six-month chart, service breakdown, and recent
  calculated entries.
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

Shadow money is exposed to its employee only as an unmistakable non-payable calculation preview.
Future live visibility is:

- Employee: own entries, sales-bonus progress, statements, and balances.
- Manager: read-only results for their direct/indirect reporting subtree.
- Admin/authorised finance roles: company-wide review and statement operations.

Dashboard navigation contains **My commissions** for all active employees and **Admin commission**
only when the database-backed Commission management capability succeeds.

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

Refund/cancellation Commission variables remain unavailable until the Ticketing refund workflow
publishes an authoritative source event. The processor must hold unsupported events rather than
inventing refund treatment.

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
  thresholdGbp: string
  eligibleServices: string[]
  reward:
    | { type: 'fixed_gbp'; amountGbp: string }
    | { type: 'percentage_of_qualifying_profit'; rate: string }
}
```

- The period is a calendar month in the originating sale's branch timezone.
- The target, eligible services, and reward are employee-specific and effective-dated.
- The employee receives nothing below the target.
- A fixed reward pays once when the target is met.
- A percentage reward applies to the full qualifying contributed profit after the threshold is
  met. Example: a £1,000 threshold at 10% pays £0 at £999, £100 at £1,000, and £150 at £1,500.
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

## 8. Statements and balances are a later release

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
| `commission_monthly_exchange_rates` | Audited month-specific PKR-per-GBP accounting conversion    |
| `commission_access_grants`          | Retained legacy grant audit; no longer an authority source  |
| `commission_source_events`          | Existing immutable producer facts                           |
| `commission_source_event_states`    | Existing claim/retry/held processing state                  |
| `commission_calculation_runs`       | Preview/shadow/live run metadata and policy snapshot        |
| `commission_entries`                | Signed shadow/live revisions with recipient/profit owner    |
| `commission_period_results`         | Monthly profit/threshold/reward calculation snapshots       |
| `commission_exceptions`             | Typed held facts and resolution/retry evidence              |
| `commission_audit_events`           | Access, policy, assignment, processing, and statement audit |
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
- Add authoritative Ticketing refund/cancellation producers.
- Add provisional package metadata reconciliation and duplicate-payment prevention.
- Add refund/late-correction impacts through signed offsets without rewriting locked statements.

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
- PKR fixed earnings retain their local amount and use the locked monthly rate for the GBP book
  equivalent.
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
- One complete month reconciles from source event to policy component, shadow entry, qualifying
  profit, and bonus result before live statements are authorised.
