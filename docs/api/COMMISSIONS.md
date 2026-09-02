# Commission API

Commission has an employee-owned read surface and a separate Admin/HR control surface. Every route
derives the actor from the active staff session and returns private, non-cacheable data. The self
route is hard-scoped to the caller's employee ID. Management routes additionally require Admin
Commission authority or live HR department membership. Employee-profile creation and removal
require database capability `2026083007`, including completed Application commission sources and
recipient routing. Safe editing of a closed previous plan requires `2026083008`; the advanced
shadow engine requires `2026082903`. All calculated values in this release are non-payable shadow
evidence.

### GET `/api/commissions/me`

**Access:** Any active employee, for that employee only.

**Input:** No body, query parameter, or employee identifier. The employee identity is resolved from
the authenticated staff session.

**Success:** `200` with the caller's current and scheduled agreement summaries, own six-month/YTD
analytics, service breakdown, recent current-revision entries, local salary/commission totals and
their audited GBP book equivalent, own open-exception count, and latest calculation time. The
response reports whether the employee-profile schema is available.

**Errors:** `401` for no session; `403` for an inactive or missing employee; `500` for an unexpected
private-data load failure.

### GET `/api/accounting/commissions/review-batches`

**Access:** Active Accounting or Accounts department members, plus Admin, Master Admin, and Super
Admin roles. Membership is resolved from `employee_departments`, and the database repeats the
authority check.

**Input:** Optional integer `limit` from 1 to 100, default 25, and integer `offset` from 0 to
100,000. All other query keys are rejected.

**Success:** `200` with a bounded page of Commission review batches, their reporting periods,
revision/state, staff and entry counts, native-currency subtotals, GBP book total, submission and
approval evidence, and Accounting actions available to the caller.

**Errors:** `400` for invalid filters; `401`/`403` for access failure; `503` when Commission review
is not installed; `500` for an unexpected database failure.

### GET `/api/accounting/commissions/review-batches/[batchId]`

**Access:** Active Accounting or Accounts department members, plus Admin, Master Admin, and Super
Admin roles. The database repeats the authority check.

**Input:** Commission review batch UUID; no body.

**Success:** `200` with the immutable batch summary, staff-level Salary, Ticketing, Application,
Package, bonus, penalty and refund breakdown, native-currency net amounts, GBP book equivalents,
immutable source references and adjustment reasons needed for double-checking, and any review
warnings. Submitted batches include `isStale` and a server-derived `canApprove`; changed source
results must be returned instead of approved.

**Errors:** `400` for an invalid UUID; `401`/`403` for access failure; `404` for a missing or hidden
batch; `503` when Commission review is not installed; `500` for an unexpected database failure.

### POST `/api/accounting/commissions/review-batches/[batchId]/return`

**Access:** Active Accounting or Accounts department members, plus Admin, Master Admin, and Super
Admin roles. The database repeats the authority check and enforces the batch transition.

**Input:** Commission review batch UUID and strict JSON `{ expectedRevision, reason }`. Revision is
a positive integer used for optimistic concurrency; the trimmed audit reason must contain 3-500
characters. Actor fields and additional keys are rejected.

**Success:** `200` after atomically returning the submitted batch to Commission Admin with its
reason and reviewer evidence retained in the audit history.

**Errors:** `400` for invalid input; `401`/`403` for access failure; `404` for a missing batch; `409`
when the batch changed or can no longer be returned; `503` when Commission review is not installed;
`500` for an unexpected database failure.

### POST `/api/accounting/commissions/review-batches/[batchId]/approve`

**Access:** Active Accounting or Accounts department members, plus Admin, Master Admin, and Super
Admin roles. The database repeats the authority check, prevents the submitter from approving their
own batch, and enforces the batch transition.

**Input:** Commission review batch UUID and strict JSON `{ expectedRevision }` containing a positive
integer. Actor fields and additional keys are rejected.

**Success:** `200` after final Accounting approval permanently locks the batch, its statement
membership, totals, and approval evidence. Later corrections belong to a subsequent open period.

**Errors:** `400` for invalid input; `401`/`403` for access or separation-of-duties failure; `404`
for a missing batch; `409` when the batch changed or can no longer be approved; `503` when
Commission review is not installed; `500` for an unexpected database failure.

### GET `/api/commissions/admin`

**Access:** Authorised Commission Admin/HR staff only.

**Input:** No body or query parameters.

**Success:** `200` with active employee setup status, employee-owned profile history, recent
monthly rates for configured non-GBP pay currencies, Ticketing/Package/Application source coverage,
open exceptions, bounded shadow overview, latest calculation run, schema version, and mode.

**Errors:** `401`/`403` for access failure; `503` when management capability is unavailable; `500`
for an unexpected load failure.

### POST `/api/commissions/admin/profiles`

**Access:** Authorised Commission Admin/HR staff only. The database repeats the permission check.

**Input:** A valid `Idempotency-Key` and strict complete employee-agreement JSON: employee, label,
effective date, optional location scope and copied-profile provenance, change reason, pay currency
and salary, typed rates for every supported service, Ticket Assistance scope (`all` or
`specific_agents` with an independent rate for every selected primary employee), ticket-tier date
change inclusion, separate normal and urgent/executive NADRA and Pakistani-passport rates, British
passport and Visa rates, Application recipient routing (`self`, `another_employee`, or `none`), and
optional monthly bonus. A redirected Application keeps the completing employee as its operational
owner while resolving the selected recipient's own effective service rate and pay currency.
Application rates are either fixed per completed/collected case or explicit zero. Package sales can
also use a flat package amount selected by the authoritative passenger-count band; the amount is
awarded once per package rather than once per passenger. Per-passenger commission remains a separate
method, and linked group bookings remain one package. Past effective dates are
accepted only when they do not overlap a completed or later plan and do not rewrite calculated
history. Tiered, bonus, salary, and converted-currency agreements use whole-month boundaries.

**Success:** `201` after one transaction creates the employee-owned snapshot plus a distinct policy,
active immutable version, and effective assignment for each service. Copying records provenance but
creates no live link. Current agreements close at the new start date; a current-date profile also
triggers a bounded shadow-processing attempt.

**Errors:** `400` for malformed or unsafe setup; `401`/`403` for access failure; `404` for a missing
employee/location/copy source; `409` when the date overlaps a completed/later plan or protected
calculated history; `503` when `2026083007` is not
installed; `500` for an unexpected transactional failure.

### PUT `/api/commissions/admin/profiles/[id]`

**Access:** Authorised Commission Admin/HR staff only. The database repeats the permission check.

**Input:** Profile UUID, valid `Idempotency-Key`, and the same strict complete agreement JSON used
to create a profile. The employee and branch scope must still identify the selected plan.

**Success:** `200` after one transaction archives the old immutable snapshot, creates the edited
employee-owned plan, re-queues affected source facts, and attempts a bounded shadow recalculation.
For a closed previous plan, its original start and end dates are mandatory and the following plan
is left untouched. Existing accounting evidence remains auditable but the overwritten snapshot is
removed from operational history.

**Errors:** `400` for invalid data or a branch-scope change; `401`/`403` for access failure; `404`
for a missing active profile; `409` for an effective-date conflict; `503` when capability
`2026083008` is absent; and `500` for an unexpected transactional failure.

### DELETE `/api/commissions/admin/profiles/[id]`

**Access:** Authorised Commission Admin/HR staff only. The database repeats the permission check.

**Input:** Profile UUID, valid `Idempotency-Key`, and strict JSON `{ reason }` with an 8-480
character audit reason.

**Success:** `200` after removing the plan from operational history, removing its assignments, and
restoring the previous plan to the next valid boundary. Policy and calculation evidence is retained
internally where required for audit.

**Errors:** `400` for invalid input; `401`/`403` for access failure; `404` for a missing profile;
`409` when the plan is already inactive; `503` when capability `2026083007` is absent; and `500` for
an unexpected transactional failure.

### POST `/api/commissions/admin/exchange-rates`

**Access:** Authorised Commission Admin/HR staff only. The database repeats the permission check.

**Input:** Strict JSON `{ currency: "EUR", periodStart: "YYYY-MM-01", unitsPerGbp: number }` and
an optional valid `Idempotency-Key`. `currency` is an uppercase three-letter non-GBP pay-currency
code; the rate is the number of that currency's units represented by one British pound for the
selected month.

**Success:** `200` after recording the audited monthly rate, re-queuing calculations held for that
month, and attempting one bounded shadow-processing batch. A rate may be corrected until a
calculation uses it; it is locked afterwards so recorded GBP book values continue to match the
remittance evidence.

**Errors:** `400` for an invalid currency, month, or value; `401`/`403` for access failure; `409`
when calculations already lock a different rate; `503` when capability `2026083001` is absent; and
`500` for an unexpected failure.

### POST `/api/commissions/admin/profiles/[id]/cancel`

**Access:** Authorised Commission Admin/HR staff only.

**Input:** Profile UUID, valid `Idempotency-Key`, and strict JSON `{ reason }` with an 8-500
character audit reason.

**Success:** `200` when a future, not-yet-effective agreement is cancelled. Its unstarted
assignments are removed and the preceding profile/assignments are restored to the next valid
boundary atomically. Effective or already-cancelled profiles cannot be cancelled.

**Errors:** `400` for invalid input or a profile already in effect; `401`/`403` for access failure;
`404` for a missing profile; `500` for an unexpected transactional failure.

### POST `/api/commissions/admin/process`

**Access:** Authorised Commission Admin/HR staff only.

**Input:** No JSON body. An optional valid `Idempotency-Key` is accepted and the batch is capped at
200 events.

**Success:** `200` with the service-only shadow processor result. No payable entry is created.

**Errors:** `401`/`403` for access failure; `500` for an unexpected processor failure.

### POST `/api/commissions/admin/exceptions/[id]/retry`

**Access:** Authorised Commission Admin/HR staff only.

**Input:** Exception UUID and optional valid `Idempotency-Key`; no actor or override variables.

**Success:** `200` with the service-only retry result.

**Errors:** `400` for an invalid UUID; `401`/`403` for access failure; `500` for an unexpected retry
failure.

### GET `/api/commissions/overview`

**Access:** Authorised Commission Admin/HR staff only.

**Input:** No body or query parameters.

**Success:** `200` with pending, processing, processed, and held source-event counts; open exception
count; active shadow-entry count and total; incomplete bonus-period count; and the latest run
summary.

**Errors:** `401`/`403` for staff or Commission-access failure; `503` when capability `2026082903`
is absent; `500` when the private overview cannot be loaded.

### GET `/api/commissions/setup-options`

**Access:** Authorised Commission Admin/HR staff only.

**Input:** No body or query parameters.

**Success:** `200` with bounded active employee options, locations, and active policy-version
labels. Employee email is returned only inside this restricted setup surface.

**Errors:** `401`/`403` for access failure; `503` when Commission is unavailable; `500` when setup
options or policy labels cannot be loaded.

### GET `/api/commissions/policies`

**Access:** Authorised Commission Admin/HR staff only.

**Input:** Optional integer `limit` from `1` to `100`, default `50`; all other query keys are
rejected.

**Success:** `200` with stable policy identities and their version IDs, numbers, states, content
hashes, and lifecycle timestamps.

**Errors:** `400` for invalid filters; `401`/`403` for access failure; `503` when Commission is not
installed; `500` when policies or versions cannot be loaded.

### POST `/api/commissions/policies`

**Access:** Authorised Commission Admin/HR staff only. The database repeats the permission check.

**Input:** Strict JSON `{ name, description? }`; name is 2-100 characters and description is at
most 500 characters. A valid 8-200 character `Idempotency-Key` header is required. Actor fields are
rejected.

**Success:** `201` with the audited stable policy identity. An identical retry returns the stored
result and does not create another policy.

**Errors:** `400` for malformed input or retry key; `401`/`403` for access failure; `409` for a
duplicate policy identity; `503` for missing capability; `500` for an unexpected database failure.

### GET `/api/commissions/policies/[policyId]/versions`

**Access:** Authorised Commission Admin/HR staff only.

**Input:** UUID `policyId` path parameter; no body.

**Success:** `200` with up to 100 versions and their immutable typed components, source variables,
recipient roles, rates/caps, bonus fields, eligible services, config, and ordered marginal tiers.

**Errors:** `400` for an invalid policy UUID; `401`/`403` for access failure; `503` for missing
capability; `500` when versions, components, or tiers cannot be loaded.

### POST `/api/commissions/policies/[policyId]/versions`

**Access:** Authorised Commission Admin/HR staff only.

**Input:** UUID `policyId`, valid `Idempotency-Key`, and strict JSON `{ components }` containing
1-50 typed components. Supported kinds are fixed per unit/event, percentage or signed percentage
of a named variable, explicit zero, marginal ticket tiers, package types reserved for authoritative
package facts, and threshold-gated sales bonus. Arbitrary formulas and actor identities are
rejected.

**Success:** `201` with an audited draft version identity, version number, state, and component
count. Draft children remain editable only through creation of a new immutable version contract.

**Errors:** `400` for invalid UUID, retry key, type, variable, rate, tier, or bonus configuration;
`401`/`403` for access failure; `404` for a missing policy; `503` for missing capability; `500` for
an unexpected database failure.

### POST `/api/commissions/policies/[policyId]/versions/[versionId]/activate`

**Access:** Authorised Commission Admin/HR staff only.

**Input:** Policy/version UUIDs, valid `Idempotency-Key`, and an exactly empty JSON object. No
override or effective-date fields are accepted.

**Success:** `200` with the activated version and immutable content hash. The prior active version
is retired atomically.

**Errors:** `400` for invalid identifiers/body/retry key or an invalid draft; `401`/`403` for access
failure; `404` for a missing policy version; `409` for conflicting state; `503` for missing
capability; `500` for an unexpected database failure.

### GET `/api/commissions/assignments`

**Access:** Authorised Commission Admin/HR staff only.

**Input:** No body or query parameters. The response is bounded to the latest 200 assignments.

**Success:** `200` with employee and policy labels, policy version, source module, service,
recipient role, optional location override, effective dates, creator, and update timestamp.

**Errors:** `401`/`403` for access failure; `503` for missing capability; `500` when assignments or
their private labels cannot be loaded.

### POST `/api/commissions/assignments`

**Access:** Authorised Commission Admin/HR staff only.

**Input:** Valid `Idempotency-Key` and strict JSON containing `employeeId`, `policyVersionId`,
`sourceModule`, `serviceCode`, `recipientRole`, optional nullable `locationId`, `effectiveFrom`, and
optional nullable `effectiveTo`. Aggregate bonus policies must cover whole calendar months.

**Success:** `201` with the audited effective assignment. A new matching assignment automatically
requeues held `needs_policy` source events; it does not force a financial result.

**Errors:** `400` for invalid scope/dates/key; `401`/`403` for access failure; `404` for missing
employee/version; `409` for an overlapping assignment; `503` for missing capability; `500` for an
unexpected database failure.

### POST `/api/commissions/preview`

**Access:** Authorised Commission Admin/HR staff only.

**Input:** Valid `Idempotency-Key` and strict synthetic JSON `{ component, variables }`. Variables
may contain bounded units, a signed GBP basis, qualifying profit, and incomplete-input count as
required by the component. No employee, source record, or customer identity is accepted.

**Success:** `200` with `previewMode: "synthetic_non_authoritative"`, validated input evidence, and
the typed calculated amount or bonus threshold/reward result. Preview is audited but writes no
entry, period result, source state, or balance.

**Errors:** `400` for missing variables or invalid component/input/key; `401`/`403` for access
failure; `503` for missing capability; `500` for an unexpected preview failure.

### GET `/api/commissions/shadow-entries`

**Access:** Authorised Commission Admin/HR staff only.

**Input:** Optional `employeeId`, ISO `periodStart`, ISO `periodEnd`, `limit` 1-100, and opaque
filter-bound `cursor`. Unknown keys, reversed dates, and mismatched cursors are rejected.

**Success:** `200` with shadow entry IDs, kind, service code, source case, recipient and profit-owner
labels, Ticket Assistance scope mode/match when relevant, policy/component IDs, earning/period
dates, signed GBP amount, explanation, revision lineage, and `nextCursor`. Rows are newest first and
include historical revisions.

**Errors:** `400` for invalid filters/cursor; `401`/`403` for access failure; `503` for missing
capability; `500` when entries or employee labels cannot be loaded.

### GET `/api/commissions/admin/staff-report`

**Access:** Authorised Commission Admin/HR staff only. The database repeats the management check;
all responses are private and non-cacheable.

**Input:** Required calendar-month query `period=YYYY-MM`. Unknown query fields and invalid months
are rejected. Employee identity is never accepted as an authority override.

**Success:** `200` with current-revision staff and native-currency totals plus grouped Ticketing,
Applications, Packages, refund, bonus, salary, and adjustment rows. `companyTotalGbp` is the common
book value, while `readiness` reports pending events, period-scoped open exceptions, and incomplete
bonus periods. `reviewBatch` is either `null` or the latest non-superseded exact-period batch with
`id`, `revision`, `state`, `contentHash`, `entryCount`, and `isStale`, so a prepared or submitted
review can be resumed safely after a refresh.

**Errors:** `400` for invalid filters; `401`/`403` for access failure; `503` for missing workflow
capability; `500` for an unexpected database or report-shape failure.

### POST `/api/commissions/admin/adjustments`

**Access:** Authorised Commission Admin/HR staff only. The database repeats the management check.

**Input:** Valid 8-200 character `Idempotency-Key` and strict JSON `{ employeeId, category, amount,
currency, periodStart, reason, evidence? }`. `category` is `adm`, `loss`, or `other`; `currency` is a
three-letter code; `periodStart` is the first day of a month; and `reason` is 3-500 trimmed
characters. This route creates debit penalties only. Actor, direction, and reversal fields are
rejected.

**Success:** `201` with the immutable adjustment, native amount, exchange-rate evidence, GBP book
amount, and replay state. Adjustments are append-only and cannot be updated or deleted. Periods
with a draft, submitted, or approved Accounting batch reject new penalties with `409`; a returned
period can receive a correction before its replacement batch is prepared.

**Errors:** `400` for invalid input/key or unavailable exchange-rate evidence; `401`/`403` for
access failure; `404` for an inactive/missing employee; `503` for missing capability; `500` for an
unexpected database failure.

### POST `/api/commissions/admin/review-batches/prepare`

**Access:** Authorised Commission Admin/HR staff only. The database repeats the management check.

**Input:** Valid `Idempotency-Key` and strict JSON `{ periodStart }`, where `periodStart` is the
first day of a completed calendar month. Actor or result overrides are rejected.

**Success:** `200` with the draft batch ID, revision, immutable content hash, entry count, and
`payable: false`. Preparation snapshots the current staff/source values only when the month has no
pending/held events, period-scoped open exceptions, or incomplete bonus periods. Repeating the
operation for an unchanged draft resumes that draft. If its sources changed before submission, the
database retains the old draft as superseded audit evidence and creates the next immutable
revision.

**Errors:** `400` for invalid input/key or an open month; `401`/`403` for access failure; `409` when
the month is not ready or already has a submitted/approved batch; `503` for missing capability;
`500` for an unexpected database failure.

### POST `/api/commissions/admin/review-batches/[batchId]/submit`

**Access:** Authorised Commission Admin/HR staff only. The database repeats the management check.

**Input:** UUID batch ID, valid `Idempotency-Key`, and strict JSON `{ expectedRevision }`. The
positive revision is required for optimistic concurrency; actor and content fields are rejected.

**Success:** `200` with the batch changed atomically from `draft` to `submitted_to_accounting`, its
incremented revision, original content hash, submission time, and replay state. The database
recomputes the source hash before accepting the handoff.

**Errors:** `400` for invalid input/key; `401`/`403` for access failure; `404` for a missing batch;
`409` for stale revision/state or changed source results; `503` for missing capability; `500` for
an unexpected database failure.

### GET `/api/commissions/bonus-periods`

**Access:** Authorised Commission Admin/HR staff only.

**Input:** Optional `employeeId`, `achieved=true|false`, `limit` 1-100, and opaque filter-bound
`cursor`; no other query keys.

**Success:** `200` with employee/location, calendar period, gross contributed profit, ordinary
commission cost, qualifying profit, target, achieved flag, reward, incomplete-input count, revision
lineage, and `nextCursor`.

**Errors:** `400` for invalid filters/cursor; `401`/`403` for access failure; `503` for missing
capability; `500` when periods or employee labels cannot be loaded.

### GET `/api/commissions/exceptions`

**Access:** Authorised Commission Admin/HR staff only.

**Input:** Optional `status` (`open`, `resolved`, or `dismissed`), typed exception `code`, `limit`
1-100, and opaque filter-bound `cursor`. Status defaults to `open`.

**Success:** `200` with exception/run/source IDs, employee label, typed code, status, bounded details,
retry evidence, resolution note, creation time, and `nextCursor`.

**Errors:** `400` for invalid filters/cursor; `401`/`403` for access failure; `503` for missing
capability; `500` when exceptions or labels cannot be loaded.

### POST `/api/commissions/exceptions/[id]/retry`

**Access:** Authorised Commission Admin/HR staff only.

**Input:** UUID exception ID, valid `Idempotency-Key`, and exactly empty JSON object. Callers cannot
override variables, force success, or resolve the exception manually.

**Success:** `200` with exception/source IDs and `queued: true`. The source event returns to pending;
the next successful processor run resolves the exception with actor and timestamp evidence.

**Errors:** `400` for invalid ID/body/key; `401`/`403` for access failure; `404` when an open
exception is absent; `409` when it has no retryable source; `503` for missing capability; `500` for
an unexpected database failure.

### POST `/api/commissions/process`

**Access:** Authorised Commission Admin/HR staff only. The browser cannot call the processor
function directly.

**Input:** Valid `Idempotency-Key` and strict JSON `{ limit? }`; limit is 1-200 and defaults to 50.

**Success:** `200` with run ID, busy flag, processed/held counts, ordinary-entry and bonus-period
counts, `nonPayable: true`, and idempotent-replay state. The worker claims rows with a bounded
skip-locked batch; expected business issues become typed held exceptions.

**Errors:** `400` for invalid body/key; `401`/`403` for access failure; `503` for missing processor
capability; `500` for an unexpected processing failure.

### GET `/api/commissions/access-grants`

**Access:** Authenticated Commission Admin/HR staff; retained only as a compatibility endpoint.

**Input:** Ignored.

**Success:** None. Returns `410 Gone` because access is managed by HR department allocation in
Staff Management. Historical grant rows remain immutable audit evidence but grant no authority.

**Errors:** `401`/`403` for access failure; otherwise `410`.

### POST `/api/commissions/access-grants`

**Access:** Authenticated Commission Admin/HR staff; retained only as a compatibility endpoint.

**Input:** Ignored.

**Success:** None. Returns `410 Gone`; Master/Super Admin assigns HR in Staff Management instead.

**Errors:** `401`/`403` for access failure; otherwise `410`.

### DELETE `/api/commissions/access-grants/[id]`

**Access:** Authenticated Commission Admin/HR staff; retained only as a compatibility endpoint.

**Input:** Ignored.

**Success:** None. Returns `410 Gone`; removing HR in Staff Management removes Commission access.

**Errors:** `401`/`403` for access failure; otherwise `410`.

### GET `/api/cron/commissions/process`

**Access:** Exact `Authorization: Bearer <CRON_SECRET>` through the shared fail-closed cron guard.
The scheduled worker uses the service-only processor boundary and records `actor_type: system` with
no employee actor.

**Input:** No body or query parameters. The daily UTC date forms the idempotency key; the batch is
fixed at 200.

**Success:** `200` with the same non-payable run/count DTO as manual processing. Same-day delivery
retries replay the audited result instead of duplicating entries.

**Errors:** `401` for an invalid bearer; `503` when cron/capability configuration is missing; `500`
for an unexpected processing failure.
