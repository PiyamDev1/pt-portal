# Applications, Passports, Visas, Documents, and Issue Reports API

Last verified against source: August 12, 2026.

All routes in this document return JSON unless an entry explicitly describes a
stream or redirect. Staff routes authenticate with the Supabase session cookie.
IDs are opaque strings; clients should not infer their format.

## Application note-read state

### GET `/api/applications/notes-read`

**Access:** Any authenticated Supabase user. The user ID is always taken from
the verified cookie session.

**Input:** Query `context` is required and must be `nadra` or `pk-passport`.
`recordIds` is a comma-separated list; blanks are removed, duplicates are
collapsed, and at most 500 IDs are queried.

**Success:** `200 { "readSignatures": { "record-id": "note-signature" } }`.
An omitted or empty `recordIds` returns an empty map.

**Errors:** `400` invalid context; `401` no valid user; `500` missing Supabase
configuration or database failure.

### POST `/api/applications/notes-read`

**Access:** Any authenticated Supabase user.

**Input:** JSON `{ context, recordId, noteSignature }`; `context` is `nadra` or
`pk-passport`, `recordId` is required, and `noteSignature` is trimmed. An empty
signature clears the saved read state.

**Success:** `200 { recordId, noteSignature }` after an upsert, or
`200 { recordId, removed: true }` after clearing it.

**Errors:** `400` invalid context or missing record ID; `401` unauthenticated;
`500` configuration, parsing, or database failure.

### DELETE `/api/applications/notes-read`

**Access:** Any authenticated Supabase user.

**Input:** JSON `{ context, recordId }`, with the same context values as GET.

**Success:** `200 { recordId, unread: true }` after deleting this user's marker.

**Errors:** `400` invalid context or missing record ID; `401` unauthenticated;
`500` configuration or database failure.

## NADRA applications

### POST `/api/nadra/add-application`

**Access:** Authenticated staff.

**Input:** JSON fields `applicantCnic`, `applicantName`, `applicantEmail`,
`familyHeadCnic`, `familyHeadName`, `familyHeadPhone`, `serviceType`,
`serviceOption`, `trackingNumber`, and `pin`. `trackingNumber` is required and
is stored trimmed and uppercase. A blank applicant CNIC creates a newborn
applicant. This legacy route does not yet apply a bounded body schema, so
callers must send the documented scalar values only.

**Success:** `200 { createdNadraServiceId, applicationId, applicantId,
trackingNumber, status }`. The initial status is `Pending Submission`; the
route creates or reuses applicants, creates the application/service rows, and
records initial history.

**Errors:** `400` missing tracking number; `401`/`403` session failure; `409`
duplicate tracking number, CNIC, or record, with `errorCode` and bounded
conflict details; `500` database or configuration failure.

### GET `/api/nadra/agent-options`

**Access:** Authenticated staff. Master Admin sees every employee; other staff
see themselves and their recursive reports.

**Input:** No request fields. A legacy `managerId` query is ignored; the
verified user determines the hierarchy root.

**Success:** `200 { canChangeAgent, agentOptions, role }`, where each option is
`{ id, name }` and the list is name-sorted.

**Errors:** `401`/`403` session failure; `404` authenticated user has no employee
row; `500` database failure.

### POST `/api/nadra/complaint`

**Access:** Authenticated staff; the authenticated user is recorded as actor.

**Input:** JSON, maximum 16 KiB: `nadraId` (1–200 characters),
`complaintNumber` (1–100), and `details` (1–10,000), all required strings.

**Success:** `200 { complaintRecordedForNadraId, complaintNumber }`; a complaint
history entry is appended without changing the service's current status.

**Errors:** `400` malformed/oversized fields; `404` NADRA service not found;
`401`/`403` session failure; `500` database failure.

### POST `/api/nadra/manage-record`

**Access:** Authenticated staff. Reassignment is limited to Master Admin or a
manager above the selected employee. Deletion additionally requires a fresh
TOTP or backup code.

**Input:** JSON `{ action, type, id, data?, verificationCode?,
verificationMethod?, authCode? }`. `action` is `update` or `delete`; `type` is
`family_head` or `application`; `id` is required. `verificationMethod` is
`totp`, `backup`, or `auto`; `authCode` is a compatibility alias.
In `auto` mode, formatted six-digit authenticator codes are normalized before
TOTP verification; other values are normalized as case-insensitive backup
codes without first creating an unnecessary TOTP challenge.

For `family_head` updates, `data` may contain `firstName`, `lastName`, `cnic`,
and `phone`. Application updates may contain `applicantId`, `firstName`,
`lastName`, `cnic`, `email`, `newBorn`, `serviceType`, `serviceOption`,
`trackingNumber`, `pin`, `notes`, `employeeId`, and `applicationId`.

**Success:** Update returns `200 { updatedRecordType, updatedRecordId }`.
Deletion returns `200 { deletedRecordType, deletedRecordId }` and writes a
deletion log. Application deletion removes its service, parent application,
and applicant; family-head deletion is refused while related applications
exist.

**Errors:** `400` invalid shape/action; `401` unauthenticated; `403` stale or
invalid second factor, or unauthorized reassignment; `404` employee or record
not found; `409` family head still has linked applications; `500` database
failure.

### GET `/api/nadra/metadata`

**Access:** Authenticated staff.

**Input:** None.

**Success:** `200 { serviceTypes, serviceOptions, pricing }`. Service types are
`{ id, name }`; options are `{ id, name, service_type_id }`; pricing rows are
`{ id, cost, price, serviceType, serviceOption }`. Only active pricing rows are
returned.

**Errors:** `401`/`403` session failure; `500` lookup failure.

### POST `/api/nadra/refund`

**Access:** Authenticated staff; the actor is recorded in history and receipt
generation.

**Input:** JSON up to 4 KiB: `{ "nadraId": "..." }` (1–200 characters).

**Success:** `200 { refundedAt }`. Repeating an already completed refund returns
`200 { refundedAt, alreadyRefunded: true }`. The service must already be
`Cancelled`; the route updates refund state, appends history, and attempts
receipt generation.

**Errors:** `400` invalid input or non-cancelled status; `404` service not found;
`401`/`403` session failure; `500` database failure.

### GET `/api/nadra/status-history`

**Access:** Authenticated staff.

**Input:** Required query `nadraId`.

**Success:** `200 { history }`, newest first. Each item is `{ id, entryType,
status, complaintNumber, details, changed_by, date }`; `changed_by` falls back
to `System`.

**Errors:** `400` missing ID; `401`/`403` session failure; `500` database error.

### POST `/api/nadra/update-status`

**Access:** Authenticated staff; the authenticated user is the history actor.

**Input:** JSON up to 8 KiB: `nadraId` (1–200 characters) and `status` (1–100),
both required. The route accepts a free-form status string rather than a fixed
enum.

**Success:** `200 { updatedNadraId, status }`; updates the service, appends
status history, and attempts triggered receipt generation.

**Errors:** `400` invalid input; `401`/`403` session failure; `500` update or
history failure.

## GB passport applications

### POST `/api/passports/gb/add`

**Access:** Authenticated staff.

**Input:** JSON `applicantName`, `applicantPassport`, `dateOfBirth`,
`phoneNumber`, `pexNumber`, `pricingId`, `ageGroup`, `serviceType`, and `pages`.
Pricing must resolve to an active row, by `pricingId` first and otherwise by
the age/pages/service combination. This legacy handler does not yet use a
bounded body schema.

**Success:** `200 { applicantId, applicationId }`. The route creates or updates
the applicant, generates a `GB-xxxxxx` tracking number, stores the resolved
cost/sale prices, and starts at `Pending Submission`.

**Errors:** `401`/`403` session failure; `500` pricing not found, invalid legacy
body, or database failure.

### POST `/api/passports/gb/delete`

**Access:** Authenticated staff plus a fresh TOTP/backup factor.

**Input:** JSON `{ id, verificationCode?, verificationMethod?, authCode? }`.
`id` is required; method is `totp`, `backup`, or `auto`; `authCode` remains a
compatibility alias.
The application UI sends the canonical `verificationCode` and `auto` method.
Copied six-digit codes may contain spaces or a separator; backup codes may be
entered with or without their display hyphen and are normalized before use.

**Success:** `200 { deletedPassportId }`. The route audit-logs the record,
removes it and its parent application, and removes the applicant only when no
other GB, Pakistani, or NADRA applications refer to that person.

**Errors:** `400` invalid body; `401` unauthenticated; `403` failed/stale second
factor; `404` record not found; `500` audit or deletion failure.

### GET `/api/passports/gb/metadata`

**Access:** Authenticated staff.

**Input:** None.

**Success:** `200 { ages, pages, services, pricing }` with private `no-store`
caching. Lookup rows are merged with labels present in active pricing; pricing
items expose normalized `id`, `cost`, `price`, age, page, and service values.

**Errors:** `401`/`403` session failure; `500` lookup failure.

### GET `/api/passports/gb/status-history`

**Access:** Authenticated staff.

**Input:** Optional query `passportId`.

**Success:** `200 { history }`, newest first. When the ID is omitted the array
is empty; otherwise rows include their joined `employees.full_name` data.

**Errors:** `401`/`403` session failure; `500` database failure.

### POST `/api/passports/gb/update`

**Access:** Authenticated staff.

**Input:** JSON requires a usable `id` in practice and may contain `status`,
`notes`, `applicantName`, `applicantPassport`, `dateOfBirth`, `phoneNumber`,
`pexNumber`, `pricingId`, `ageGroup`, `pages`, and `serviceType`. Pricing is
always re-resolved. This legacy handler has no bounded body schema.

**Success:** `200 { updatedPassportId }`. Applicant fields and pricing are
updated; a changed status appends history and attempts receipt generation.

**Errors:** `401`/`403` session failure; `500` missing application, unresolved
pricing, malformed legacy input, or database failure.

## Pakistani passport applications and drafts

### POST `/api/passports/pak/add-application`

**Access:** Authenticated staff.

**Input:** JSON `applicantCnic`, `applicantName`, `applicantEmail`,
`applicantPhone`, `familyHeadEmail`, `applicationType`, `category`, `pageCount`,
`speed`, `oldPassportNumber`, `trackingNumber`, and `fingerprintsCompleted`.
`oldPassportNumber` is forced to `null` for `First Time`. This legacy route has
no bounded schema.

**Success:** `200 { createdApplicationId, applicantId, trackingNumber, status }`
with status `Pending Submission`.

**Errors:** `401`/`403` session failure; `500` malformed legacy data or database
failure.

### GET `/api/passports/pak/drafts`

**Access:** Authenticated staff.

**Input:** Optional query `includeClosed=true`; otherwise `Converted` and
`Cancelled` drafts are excluded. Results are newest-updated first, capped at
1,000 rows.

**Success:** `200 { drafts, documentCounts }`. Each draft includes its stored
application/contact/service/payment/assignment/conversion/cancellation fields
and joined assignee/creator names. `documentCounts` maps each public `draft_id`
to its active non-ZIP document count.

**Errors:** `401`/`403` session failure; `500` database failure.

### POST `/api/passports/pak/drafts`

**Access:** Authenticated staff. Client-supplied `currentUserId`/`userId` is
overwritten with the verified session user.

**Input:** JSON `action`, defaulting to `create`:

- `create`: requires `applicantName`, `applicantCnic`, `applicationType`,
  `category`, and `speed`; accepts `applicantEmail`, `applicantPhone`,
  `familyHeadEmail`, `pageCount`, `oldPassportNumber`, `notes`, `status`,
  `paymentStatus`, `paymentAmount`, `paymentNote`, and `assignedEmployeeId`.
- `update`: requires `draftId` or `id`; accepts the same mutable fields under
  `data` or at top level. Assignment email is attempted only when assignee
  changes.
- `cancel`: requires `draftId`/`id`; accepts `reason` or
  `cancellationReason`.
- `convert`: requires `draftId`/`id` and `trackingNumber`. It creates the live
  applicant/application/passport hierarchy. Draft-scoped document ownership
  and object keys remain unchanged; the registered application resolves the
  linked draft ID as a server-side read alias.

Payment amount must be finite and non-negative. Draft status is one of `Draft`,
`Documents Pending` (the create default), `Ready to Process`,
`With External Staff`, `Tracking Received`, `Converted`, or `Cancelled`.
Payment status is `unknown` (the default), `not_taken`, `taken`, or `refunded`.

**Success:** Create/update returns `200 { draft, assignmentNotification }`;
cancel returns `{ draft }`; convert returns `{ convertedDraftId, draftId,
applicationId, passportApplicationId, trackingNumber, draft }`.

**Errors:** `400` required/invalid fields or constraint errors; `401`/`403`
session failure; `404` draft not found during conversion; `409` cancelled or
already-converted draft, or duplicate tracking number (with
`errorCode: "DUPLICATE_TRACKING"`); `500` database/conversion failure.

### POST `/api/passports/pak/manage-record`

**Access:** Authenticated staff. `delete` additionally requires a fresh TOTP or
backup code.

**Input:** JSON `{ action, id, passportId?, data?, verificationCode?,
verificationMethod?, authCode? }`. `action` is `update`, `delete`, or
`mark_page_provided`. Update `data` may include `applicationId`, `passportId`,
`trackingNumber`, `applicantId`, `applicantName`, `applicantCnic`,
`applicantEmail`, `applicantPhone`, `applicationType`, `category`, `pageCount`,
`speed`, `oldPassportNumber`, `fingerprintsCompleted`, `familyHeadEmail`,
`requestedPageNumber`, and `requestedPageProvided`.
Deletion UI sends `verificationCode` with method `auto`; `authCode` is retained
only for older callers. Copied authenticator and backup-code formatting is
normalized by the shared fresh-factor verifier.

**Success:** Update returns `{ updatedPassportApplicationId,
updatedApplicationId }`; delete returns `{ deletedPassportApplicationId }`;
marking a page returns both IDs plus `requestedPageProvided: true`.

**Errors:** `400` invalid action/data, missing IDs, or no requested page; `401`
unauthenticated; `403` failed/stale second factor; `404` delete target absent;
`500` database failure.

### GET `/api/passports/pak/metadata`

**Access:** Authenticated staff.

**Input:** None.

**Success:** `200 { categories, speeds, applicationTypes, pageCounts, pricing }`
with `private, max-age=300`. Active pricing rows expose `{ id, cost, price,
category, speed, applicationType, pages }`; `Lost` is always present in the
application-type list.

**Errors:** `401`/`403` session failure; `500` lookup failure.

### GET `/api/passports/pak/notes`

**Access:** Authenticated staff.

**Input:** Query requires either `applicationId` or `passportId`; passport ID is
tried first and application ID is the fallback.

**Success:** `200 { notes }`; an unresolved record deliberately returns an empty
string.

**Errors:** `400` neither ID supplied; `401`/`403` session failure; `500`
database or missing-migration failure.

### POST `/api/passports/pak/notes`

**Access:** Authenticated staff; the route records the authenticated user as the
owning employee.

**Input:** JSON `{ applicationId?, passportId?, notes }`; one ID is required and
`notes` must be a string. Blank notes are stored as `null`.

**Success:** `200 { updatedPassportId, notes }`.

**Errors:** `400` missing ID/non-string notes; `404` passport row absent;
`401`/`403` session failure; `500` database or missing-migration failure.

### GET `/api/passports/pak/status-history`

**Access:** Authenticated staff.

**Input:** Query `passportId` or `applicationId`. Application ID is resolved to
the passport row, with a legacy direct-ID fallback.

**Success:** `200 { history }`, newest first; entries are `{ id, status,
changed_by, date, description }`. An unresolved supplied application ID returns
an empty history.

**Errors:** `404` neither usable ID resolves; `401`/`403` session failure; `500`
database failure.

### POST `/api/passports/pak/update-custody`

**Access:** Authenticated staff.

**Input:** JSON up to 8 KiB: `passportId` (1–200 characters), `action` equal to
`return_old`, `record_new`, or `toggle_fingerprints`, and optional `newNumber`
(1–100). `record_new` requires the number.

**Success:** `200 { updatedPassportId, action }`; `record_new` also returns the
uppercased `newPassportNumber` and sets status `Completed`; toggle also returns
`fingerprints_completed`.

**Errors:** `400` invalid/missing action data; `404` toggle target not found;
`401`/`403` session failure; `500` database failure.

### POST `/api/passports/pak/update-status`

**Access:** Authenticated staff; actor is derived from the session.

**Input:** JSON up to 16 KiB: `passportId`, `status`, optional
`newPassportNo`, `isCollected`, `oldPassportReturned`, and `isRefunded`.
Allowed statuses are `Pending Submission`, `Biometrics Taken`, `Processing`,
`Approved`, `Passport Arrived`, `Collected`, and `Cancelled`. `isCollected` is
accepted for compatibility but does not change persistence; use `status`.

**Success:** `200 { updatedPassportId, status }`; updates custody/refund fields,
appends history, and attempts receipt generation. `Collected` requires a new
passport number either already stored or supplied.

**Errors:** `400` invalid status, missing data, or collection without passport
number; `401`/`403` session failure; `500` database failure.

## Visa applications

### POST `/api/visas/add-application`

**Access:** Authenticated staff.

**Input:** JSON `applicantName`, `applicantPassport`, `countryId`, `visaTypeId`,
`customerPrice`, `basePrice`, `costCurrency`, `notes`, and
`internalTrackingNo`. This legacy creation route does not have a bounded schema;
new callers should prefer `/api/visas/save`.

**Success:** `200 { applicationCreatedForApplicantId, internalTrackingNo }`.
Creates/reuses the applicant and starts the visa at `Pending`.

**Errors:** `401`/`403` session failure; `500` malformed legacy data or database
failure.

### GET `/api/visas/metadata`

**Access:** Authenticated staff.

**Input:** None.

**Success:** `200 { countries, types }` with `private, max-age=300`. Countries
are `{ id, name }`; types include `id`, `name`, `default_cost`, `default_price`,
`default_validity`, `country_id`, and `allowed_nationalities`.

**Errors:** `401`/`403` session failure; `500` lookup failure.

### POST `/api/visas/save`

**Access:** Authenticated staff.

**Input:** JSON up to 32 KiB. `applicantName` is required (1–300 characters) and
`countryId` is a numeric string or number. Optional fields: `id` (update rather
than create), `applicantPassport` (max 100), `applicantDob` (20),
`applicantNationality` (100), `visaTypeName` (200), `validity` (200),
`internalTrackingNo` (200), non-negative `customerPrice`/`basePrice` up to
10,000,000, `costCurrency` (3–10), `isPartOfPackage`, and `status` (100).
Unknown compatibility fields are tolerated.

**Success:** `200 { operation: "created" | "updated" }`. A missing visa type is
created within the selected country; applicant details are created/refreshed.

**Errors:** `400` invalid body or country; `401`/`403` session failure; `500`
applicant/type/application database failure.

### POST `/api/visas/update-status`

**Access:** Authenticated staff.

**Input:** JSON `{ id, status }`, both non-empty strings; status max 100
characters.

**Success:** `200 { updatedVisaId: id, status }`.

**Errors:** `400` invalid body; `401`/`403` session failure; `500` update
failure.

## Private document vault

All document read routes resolve a live, non-deleted database record before
accessing object storage. Legacy `key` lookups never allow arbitrary bucket
reads. Private responses use `no-store`, `nosniff`, and restrictive disposition
headers where applicable.

### GET `/api/documents/[documentId]/download`

**Access:** Authenticated staff.

**Input:** Path `documentId`.

**Success:** `307` redirect to a short-lived signed download URL, with private
no-store caching.

**Errors:** `400` missing path ID; `404` live document not found; `401`/`403`
session failure; `500` signing failure.

### GET `/api/documents/[documentId]/preview`

**Access:** Authenticated staff.

**Input:** Path `documentId`.

**Success:** `200 { url }`, a short-lived signed preview URL, with private
no-store caching.

**Errors:** `400` missing path ID; `404` document not found; `401`/`403` session
failure; `500` signing failure.

### DELETE `/api/documents/[documentId]`

**Access:** Authenticated staff.

**Input:** Path `documentId`; no body.

**Success:** `200 { deletedDocumentId }`. Database access is revoked before the
exact object is removed. If object deletion fails, the route attempts to
restore the database record.

**Errors:** `404` document not found; `503` referenced fallback storage is not
configured; `401`/`403` session failure; `500` database/storage deletion
failure.

### GET `/api/documents/[documentId]/thumbnail`

**Access:** Authenticated staff.

**Input:** Path `documentId`.

**Success:** `200 { thumbnailUrl }`, a short-lived signed URL, with private
no-store caching.

**Errors:** `400` missing ID; `404` document not found; `401`/`403` session
failure; `500` signing failure.

### GET `/api/documents/download`

**Access:** Authenticated staff.

**Input:** Query `documentId` preferred, or legacy `key`; one is required.

**Success:** `200` binary stream with the stored MIME type and an attachment
`Content-Disposition`; response is private/no-store and `nosniff`.

**Errors:** `400` neither selector supplied; `404` record/body not found;
`401`/`403` session failure; `500` storage read failure.

### GET `/api/documents/download-all`

**Access:** Authenticated staff.

**Input:** None.

**Success:** This retired route has no success response.

**Errors:** Always `410` after authentication, directing callers to the
two-step `/api/documents/zip` flow; `401`/`403` for session failure.

### GET `/api/documents/migrate-scheduled`

**Access:** Scheduled worker token. Send the configured
`DOCUMENT_MIGRATION_CRON_TOKEN`, falling back to `CRON_SECRET`, as
`Authorization: Bearer ...` or `X-Migration-Token`.

**Input:** Optional query `limit`; it is clamped to 1–50 and defaults to 30.

**Success:** `200 { skipped: true, reason }` while primary storage is offline,
or `200 { skipped: false, result, timestamp }`. `result` is the bounded fallback
migration batch summary.

**Errors:** `401` missing/invalid token; `500` health or migration failure.

### POST `/api/documents/migrate-scheduled`

**Access:** Same token rules as GET.

**Input:** JSON up to 4 KiB: optional `token` (max 1,000 characters) and `limit`
(integer 1–50). Header authentication is preferred so credentials do not enter
the body. Query `limit` is a fallback when body limit is absent.

**Success:** Same shape as GET.

**Errors:** `400` invalid/oversized body; `401` invalid token; `500` migration
failure.

### GET `/api/documents/migration-overview`

**Access:** Maintenance roles through the canonical cookie-session guard.

**Input:** None.

**Success:** `200 { summary, health, metrics, alerts,
recentMigrationEvents, recentFallbackDocuments }`. Summary contains active,
primary, fallback, and deleted counts plus oldest fallback time/backlog age;
alerts describe backlog and repeated failures.

**Errors:** `401`/`403` maintenance authorization failure; `500` database or
storage-health failure.

### POST `/api/documents/migration-overview`

**Access:** Maintenance roles through the canonical cookie-session guard.

**Input:** Optional JSON `{ limit }`; numeric values are clamped to 1–50 and
default to 20.

**Success:** `200 { result, overview }` after a manual migration batch.

**Errors:** `401`/`403` maintenance authorization failure; `409` primary storage
offline; `500` body/database/storage failure.

### GET `/api/documents/preview`

**Access:** Authenticated staff.

**Input:** Query `documentId` preferred, or legacy `key`; one is required.

**Success:** `200` binary stream. PDF/JPEG/PNG/WebP use inline disposition;
other stored types are forced to attachment. Headers include private no-store,
`nosniff`, sandbox CSP, and no-referrer.

**Errors:** `400` no selector; `404` record/body absent; `401`/`403` session
failure; `500` storage read failure.

### GET `/api/documents`

**Access:** Authenticated staff.

**Input:** Required query `familyHeadId` (valid scope ID). Optional `page`
defaults to 1; `limit` defaults to 20 and is clamped to 5–100; `category` is
`general`, `receipt`, or `application-review`.

**Success:** `200 { documents, pagination }` with private no-store caching.
Documents expose `id`, `fileName`, `fileSize`, `fileType`, `category`,
`uploadedAt`, `uploadedBy`, `familyHeadId`, and `minio: { bucket, key, etag }`.
Pagination is `{ page, limit, total, pages }`; internal ZIP records are omitted.
For an application UUID, results also include legacy applicant-owned files and
files owned by a PKD draft whose `converted_application_id` is that exact
application. These aliases are derived by the server and cannot be supplied as
an arbitrary list by the caller.

**Errors:** `400` missing/invalid scope or category; `404` live application/draft
scope not found; `401`/`403` session failure; `500` query failure.

### POST `/api/documents`

**Access:** Authenticated staff.

**Input:** None accepted.

**Success:** This retired metadata-only endpoint has no success response.

**Errors:** Always `410` after authentication; use `/api/documents/upload-direct`.

### GET `/api/documents/signed-url`

**Access:** Authenticated staff.

**Input:** Query `documentId` preferred, or legacy `key`; one is required.

**Success:** `200 { url }` with private no-store caching.

**Errors:** `400` selector missing; `404` document not found; `401`/`403`
session failure; `500` signing failure.

### GET `/api/documents/status`

**Access:** Authenticated staff.

**Input:** None. The endpoint may run one bounded fallback-migration maintenance
attempt while checking storage.

**Success:** `200 { status }`, where status reports primary/fallback
connectivity, active provider, capabilities, and migration state; private
no-store caching is applied.

**Errors:** `401`/`403` session failure. Storage problems are represented in the
status object rather than normally becoming a route error.

### POST `/api/documents/upload`

**Access:** Authenticated staff.

**Input:** None accepted.

**Success:** This retired presigning endpoint has no success response.

**Errors:** Always `410` after authentication; use verified direct upload.

### POST `/api/documents/upload-direct`

**Access:** Authenticated staff. Rate limit: 20 attempts per 10 minutes across
both user and source IP identities.

**Input:** `multipart/form-data` with `file`, `familyHeadId`, and `category`.
Category is `general`, `receipt`, or `application-review`. Maximum file size is
1.5 MB plus multipart overhead. Allowed content is PDF, JPEG, PNG, or WebP;
declared MIME, extension, and detected magic bytes must agree. Filename and
scope are sanitized/validated and the live application/draft scope must exist.

**Success:** `200 { documentId, minioKey, etag, storageProvider, storageBucket,
fileName, fileSize, fileType, category, familyHeadId }`. Primary storage is used
first, with configured R2 fallback; metadata creation is atomic with best-effort
object cleanup on database failure.

**Errors:** `400` missing/invalid fields/name/scope; `404` scope not found;
`413` oversized body/file; `415` content/MIME/extension mismatch; `429` rate
limit; `503` limiter/storage availability errors; `401`/`403` session failure;
`500` upload/database failure with `x-request-id`.

### GET `/api/documents/zip`

**Access:** Authenticated staff.

**Input:** Required query `familyHeadId`, which must resolve to a live scope.

**Success:** `200 { status: "none" }`, or `{ status: "ready" | "stale",
documentId, fileName, createdAt, currentCount, storedCount }`. Staleness means
the current non-ZIP document count differs from the count captured at creation.
For application scopes, the count covers the same server-resolved applicant and
converted-draft aliases as the document list.

**Errors:** `400` missing/invalid scope; `404` scope not found; `401`/`403`
session failure; `500` database failure with `x-request-id`.

### POST `/api/documents/zip`

**Access:** Authenticated staff.

**Input:** JSON up to 8 KiB: required `familyHeadId` (max 200) and optional
`zipFileName` (max 240). A live scope is required. At most 200 source documents
and 100 MB of declared source bytes may be archived; each storage key must match
its recorded owner or the exact PKD draft linked to its converted application.

**Success:** `200 { documentId, fileName }`. The route creates a ZIP, writes it
to primary/R2 fallback storage, persists a `zip-archive` document, and retires
older archives only after the new record is durable.

**Errors:** `400` invalid body/scope; `404` scope or source documents absent;
`409` invalid storage ownership metadata; `413` document-count/size limit;
`503` required fallback unavailable; `401`/`403` session failure; `500`
download/archive/upload/database failure with `x-request-id`.

## Issue reports

### POST `/api/issue-reports`

**Access:** Public, with optional Supabase session attribution. Rate limit: five
reports per source IP per hour.

**Input:** JSON up to 8 MiB. `notes`, `pageUrl`, and `routePath` must normalize to
non-empty values. Optional fields are `severity`, `includeScreenshot`,
`includeConsoleLog`, `includeFailedRequests`, `screenshotDataUrl`,
`consoleEntries`, `failedRequests`, and `browserContext` (`viewport`,
`userAgent`, `language`, `platform`, `appVersion`). Included screenshots must be
canonical image data URLs, at most 5 MiB decoded, and valid JPEG/PNG/WebP by
content. Sensitive text is redacted and diagnostic collections are sanitized.

**Success:** `200 { ticketId }`. Artifact upload is best effort: report creation
can succeed even if screenshot/console storage fails.

**Errors:** `400` missing context/notes, invalid screenshot, or invalid body;
`413` body or screenshot too large; `415` unsupported screenshot content;
`429` rate limit; `503` limiter unavailable; `500` report creation failure.

Example:

```json
{
  "notes": "The save button stayed disabled after editing the phone number.",
  "pageUrl": "https://portal.example/dashboard/applications",
  "routePath": "/dashboard/applications",
  "severity": "medium",
  "includeScreenshot": false,
  "includeConsoleLog": false,
  "includeFailedRequests": true,
  "failedRequests": []
}
```
