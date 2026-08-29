# Commission API

Commission is an internal Admin/HR financial-control surface. Every staff route derives the actor
from the active staff session, requires Admin Commission authority or a live
`manage_commission_policies` grant, enforces database capability `2026082902`, and returns
`Cache-Control: private, no-store`. All calculated values in this release are non-payable shadow
evidence and are not exposed to agents or managers.

### GET `/api/commissions/overview`

**Access:** Authorised Commission Admin/HR staff only.

**Input:** No body or query parameters.

**Success:** `200` with pending, processing, processed, and held source-event counts; open exception
count; active shadow-entry count and total; incomplete bonus-period count; and the latest run
summary.

**Errors:** `401`/`403` for staff or Commission-access failure; `503` when capability `2026082902`
is absent; `500` when the private overview cannot be loaded.

### GET `/api/commissions/setup-options`

**Access:** Authorised Commission Admin/HR staff only.

**Input:** No body or query parameters.

**Success:** `200` with bounded active employee options, locations, active policy-version labels,
and `canManageGrants`. Employee email is returned only inside this restricted setup surface.

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

**Access:** Master Admin and Super Admin only, after normal Commission access verification.

**Input:** No body or query parameters; response is bounded to 200 grant records.

**Success:** `200` with employee identity/active state, fixed capability, grantor, grant time, and
revocation time. This is policy-management access only and does not grant a general administrator
role.

**Errors:** `401`/`403` for session, Commission, or grant-management failure; `503` for missing
capability; `500` when grants or employee labels cannot be loaded.

### POST `/api/commissions/access-grants`

**Access:** Master Admin and Super Admin only.

**Input:** Valid `Idempotency-Key` and strict JSON `{ employeeId }`; capability names, grantor, and
actor fields are server-controlled.

**Success:** `201` with the audited active `manage_commission_policies` grant. Identical retries are
idempotent.

**Errors:** `400` for invalid employee/key; `401`/`403` for access failure; `404` for a missing or
inactive employee; `409` for a conflicting active grant; `503` for missing capability; `500` for an
unexpected database failure.

### DELETE `/api/commissions/access-grants/[id]`

**Access:** Master Admin and Super Admin only.

**Input:** UUID grant ID and valid `Idempotency-Key`; no body fields.

**Success:** `200` with the audited revocation result. Historical grant evidence is retained rather
than deleted.

**Errors:** `400` for invalid ID/key; `401`/`403` for access failure; `404` for a missing active
grant; `503` for missing capability; `500` for an unexpected database failure.

### GET `/api/cron/commissions/process`

**Access:** Exact `Authorization: Bearer <CRON_SECRET>` through the shared fail-closed cron guard.
`COMMISSION_CRON_ACTOR_EMPLOYEE_ID` must identify an active Admin/HR employee with Commission
authority; the UUID is recorded as the calculation/audit actor.

**Input:** No body or query parameters. The daily UTC date forms the idempotency key; the batch is
fixed at 200.

**Success:** `200` with the same non-payable run/count DTO as manual processing. Same-day delivery
retries replay the audited result instead of duplicating entries.

**Errors:** `401` for an invalid bearer; `503` when cron/actor/capability configuration is missing;
`403` if the configured actor is no longer authorised; `500` for an unexpected processing failure.
