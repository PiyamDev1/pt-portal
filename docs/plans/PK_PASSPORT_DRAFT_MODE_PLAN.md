# Pakistani Passport Draft Mode Plan

## Purpose

Create a draft workflow for Pakistani passport applications before the official tracking number exists. Drafts let internal and external staff organize applicant details, required documents, payment/refund notes, and processing status inside PT-Portal instead of WhatsApp threads.

Drafts are operational records only. They are not real passport application records, not counted in Accounts, and not shown in the tracked passport ledger until converted with an official tracking number.

## Current Constraint Summary

- `applications.tracking_number` is live `NOT NULL` and `UNIQUE`.
- The normal Pakistani passport ledger is loaded from `applications` joined to `pakistani_passport_applications`.
- Current creation requires a tracking number before an application can enter the ledger.
- `documents.family_head_id` is a text key without a foreign key, so document bundles can be attached to a draft ID.
- The existing document ZIP/document tooling can be reused for drafts, but the `applications.has_documents` trigger only updates when the document key is a real `applications.id`.

## Product Decision

Add a Draft Mode section to `/dashboard/applications/passports`.

Draft Mode is a separate operational queue for pre-tracking work. It should not insert into `applications` until the official tracking number is received.

External staff already have PT-Portal access. They should log in and work from the draft queue directly. No public links or external share links are required for this workflow.

## Draft ID

Each draft gets an internal ID that is visible to staff but not treated as an official tracking number.

Format proposal:

```text
PKD-XXXXXXXXXX
```

Rules:

- Prefix: `PKD-`
- Suffix: 10 uppercase alphanumeric characters
- Unique in the draft table
- Used as the document bundle key until conversion
- Never written into `applications.tracking_number`

## Draft Data

Drafts should capture the same information as the current new application form, except tracking number:

- applicant name
- applicant CNIC
- applicant email
- applicant phone
- family head email
- application type
- category
- page count
- speed
- old passport number
- notes

Application types include `Lost`. Old passport number is only captured when the application type is not `First Time`.

Requested-page handling and biometrics are intentionally excluded from draft data. Those fields start after an official tracking number is received and the draft is converted into the tracked passport ledger.

Additional draft-only fields:

- draft ID
- draft status
- assigned external staff, optional
- created by
- created at
- last updated at
- sent to external staff at
- converted at
- converted application ID
- cancelled at
- cancelled by
- cancellation reason

## Draft Statuses

Recommended draft statuses:

- `Draft`
- `Documents Pending`
- `Ready to Process`
- `With External Staff`
- `Tracking Received`
- `Converted`
- `Cancelled`

Default status:

```text
Documents Pending
```

Status meaning:

- `Draft`: basic record exists but not ready for action.
- `Documents Pending`: applicant details exist but required documents are incomplete.
- `Ready to Process`: internal staff believe the bundle is complete.
- `With External Staff`: external staff are actively processing it in the portal.
- `Tracking Received`: external staff or internal staff entered the official tracking number, pending conversion if needed.
- `Converted`: real tracked application exists.
- `Cancelled`: draft will not proceed.

## Documents

Draft documents should use the existing document storage flow where possible.

Before conversion:

- `documents.family_head_id = draft_id`
- document categories can reuse existing values initially:
  - `general`
  - `receipt`
  - `application-review`

On conversion:

- Create the real `applications` row with the official tracking number.
- Create the real `pakistani_passport_applications` row.
- Reassign draft documents from `draft_id` to the new `applications.id::text`, or store a permanent link from draft to application and make the document hub read both keys.

Preferred approach:

Reassign documents to the real application ID during conversion. This keeps the existing passport document page and `has_documents` trigger behavior simple.

## Payment And Refund Tracking

Draft payment tracking is operational only. It should not feed Accounts.

Fields:

- `payment_status`
- `payment_amount`
- `payment_note`
- `payment_refunded_at`

Payment statuses:

- `unknown`
- `not_taken`
- `taken`
- `refunded`

Use cases:

- If payment was never taken, staff can leave it as `not_taken` or `unknown`.
- If payment was taken and draft is cancelled, staff can mark `refunded`.
- If payment was taken but not refunded, cancelled drafts should remain visible in an attention filter until resolved.

## Conversion Flow

Action in Draft Mode:

```text
Add Tracking Number
```

Conversion steps:

1. Staff enters official tracking number.
2. API validates the tracking number is present and unique against `applications.tracking_number`.
3. API creates or reuses applicant record.
4. API creates `applications` row.
5. API creates `pakistani_passport_applications` row.
6. API moves draft documents to the real application ID.
7. API marks draft as `Converted`.
8. Draft disappears from active draft queue.
9. New record appears in the normal tracked passport ledger.

Failure behavior:

- If tracking number is duplicate, do not convert.
- If application creation succeeds but passport row creation fails, roll back or mark conversion failed without losing draft data.
- If document reassignment fails, keep draft converted state blocked until documents are fixed, or record a warning and keep both IDs visible to staff.

## Cancellation And Cleanup

Cancelling a draft should soft-delete/hide it first.

On cancel:

- set status to `Cancelled`
- set `cancelled_at`
- set `cancelled_by`
- require or encourage cancellation reason
- keep documents for 30 days

After 30 days:

- scheduled cleanup permanently deletes cancelled draft records and related draft documents
- do not delete converted drafts
- do not delete drafts with unresolved payment status, such as `taken` without `refunded`

Cleanup safety:

- cancelled draft age must be at least 30 days
- draft must not be converted
- draft must not be linked to a real application
- payment status must be safe to purge

## UI Plan

On `/dashboard/applications/passports`:

- Add top-level button: `Draft Mode`
- Draft Mode opens a section or tab beside the tracked ledger
- Draft queue should have filters for status, assigned staff, date, payment status, and search
- Draft rows should expose:
  - applicant name
  - CNIC
  - draft ID
  - draft status
  - document count
  - payment status
  - assigned external staff
  - last updated
  - actions

Draft actions:

- edit draft
- manage documents
- mark ready
- assign external staff
- mark with external staff
- add tracking number
- cancel draft

External staff view:

- They log into PT-Portal.
- They open Draft Mode.
- They see drafts assigned to them or visible to their role.
- They can open the draft, inspect documents, update processing status, and enter tracking number if allowed.

## Suggested Database Shape

Add a new table, tentatively:

```text
pakistani_passport_drafts
```

Important columns:

- `id uuid primary key`
- `draft_id text not null unique`
- `applicant_id uuid null references applicants(id)`
- `created_by uuid not null references employees(id)`
- `assigned_employee_id uuid null references employees(id)`
- `converted_application_id uuid null references applications(id)`
- applicant detail fields
- passport spec fields
- status fields
- payment fields
- cancellation fields
- timestamps

Keep draft data denormalized enough to survive applicant edits before conversion. Applicant creation can happen at draft creation or conversion; conversion should be able to update/reuse applicant data cleanly.

## Permissions

Initial permission model:

- authenticated staff can read draft records
- internal application staff can create and edit drafts
- external staff can view assigned drafts and update allowed processing fields
- only permitted staff can convert or cancel drafts

If role-level detail is needed later, add explicit policy checks in API routes rather than trusting client-side controls.

## Accounting Rules

Drafts do not count in Accounts.

Only converted records count because only conversion creates the real `applications` and `pakistani_passport_applications` records used by application reports.

Cancelled drafts should not appear in accounting reports.

Payment draft fields are operational reminders, not financial ledger entries.

## Implementation Phases

### Phase 1: Schema And API

- Add migration for `pakistani_passport_drafts`.
- Add create/list/update/cancel/convert API routes.
- Add duplicate tracking validation during conversion.
- Add document reassignment during conversion.
- Add unit tests for create, update, cancel, conversion, duplicate tracking, and cleanup eligibility.

### Phase 2: Draft Mode UI

- Add Draft Mode button/section to Pakistani passports page.
- Add draft creation form based on the current new application form without tracking number.
- Add draft queue table.
- Add draft edit modal.
- Add document management access for draft IDs.
- Add `Add Tracking Number` conversion action.

### Phase 3: External Staff Workflow

- Add assigned staff field and filter.
- Restrict or tailor external staff actions.
- Add attention indicators for drafts ready to process, missing documents, and unresolved refunds.

### Phase 4: Cleanup

- Add scheduled cleanup API/cron for cancelled drafts older than 30 days.
- Ensure cleanup skips converted drafts and unresolved payment cases.
- Add audit logging for purged draft IDs.

## Acceptance Criteria

- Staff can create a Pakistani passport draft without a tracking number.
- Draft ID is unique and never written to `applications.tracking_number`.
- Staff can upload and view documents against the draft.
- External staff can access assigned drafts through PT-Portal login.
- Staff can enter an official tracking number and convert the draft.
- Converted drafts appear in the normal tracked passport ledger.
- Converted records appear in Accounts only after conversion.
- Duplicate official tracking numbers are rejected.
- Cancelled drafts remain recoverable/visible for 30 days.
- Cleanup does not purge drafts with unresolved payment/refund status.
- Existing tracked passport workflow continues to work unchanged.

## Open Questions Before Build

- Should applicant records be created at draft creation or only at conversion?
- Should external staff be able to enter the final tracking number, or only internal staff?
- Which draft statuses should external staff be allowed to set?
- What document checklist should be enforced before `Ready to Process`?
- Should payment amount be free text, numeric, or omitted for phase 1?
- Should cancelled drafts be visible in a separate archive before purge?
