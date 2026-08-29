# Commission API

Commission has an employee-owned read surface and a separate Admin/HR control surface. Every route
derives the actor from the active staff session and returns private, non-cacheable data. The self
route is hard-scoped to the caller's employee ID. Management routes additionally require Admin
Commission authority or live HR department membership. Employee-profile mutations require database
capability `2026082904`; the advanced shadow engine requires `2026082903`. All calculated values in
this release are non-payable shadow evidence.

### GET `/api/commissions/me`

**Access:** Any active employee, for that employee only.

**Input:** No body, query parameter, or employee identifier. The employee identity is resolved from
the authenticated staff session.

**Success:** `200` with the caller's current and scheduled agreement summaries, own six-month/YTD
analytics, service breakdown, recent current-revision entries, own open-exception count, and latest
calculation time. The response reports whether profile capability `2026082904` is installed.

**Errors:** `401` for no session; `403` for an inactive or missing employee; `500` for an unexpected
private-data load failure.

### GET `/api/commissions/admin`

**Access:** Authorised Commission Admin/HR staff only.

**Input:** No body or query parameters.

**Success:** `200` with active employee setup status, employee-owned profile history, open
exceptions, bounded shadow overview, latest calculation run, schema version, and mode.

**Errors:** `401`/`403` for access failure; `503` when management capability is unavailable; `500`
for an unexpected load failure.

### POST `/api/commissions/admin/profiles`

**Access:** Authorised Commission Admin/HR staff only. The database repeats the permission check.

**Input:** A valid `Idempotency-Key` and strict complete employee-agreement JSON: employee, label,
effective date, optional location scope and copied-profile provenance, change reason, typed rates for
every supported service, and optional monthly bonus. Replacements cannot be backdated. Initial
agreements may start at the beginning of the current month. Tiered/bonus agreements use whole-month
boundaries.

**Success:** `201` after one transaction creates the employee-owned snapshot plus a distinct policy,
active immutable version, and effective assignment for each service. Copying records provenance but
creates no live link. Current agreements close at the new start date; a current-date profile also
triggers a bounded shadow-processing attempt.

**Errors:** `400` for malformed or unsafe setup; `401`/`403` for access failure; `404` for a missing
employee/location/copy source; `409` for an effective-date conflict; `503` when `2026082904` is not
installed; `500` for an unexpected transactional failure.

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

**Success:** `200` with shadow entry IDs, kind, source case, recipient and profit-owner labels,
policy/component IDs, earning/period dates, signed GBP amount, explanation, revision lineage, and
`nextCursor`. Rows are newest first and include historical revisions.

**Errors:** `400` for invalid filters/cursor; `401`/`403` for access failure; `503` for missing
capability; `500` when entries or employee labels cannot be loaded.

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
