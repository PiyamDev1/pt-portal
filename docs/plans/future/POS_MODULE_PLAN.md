# POS Cash Ledger Module Plan

**Status:** Proposal for product discussion  
**Module:** Point of Sale (POS) / daily cash ledger  
**Proposed route:** `/dashboard/pos`

This document describes a fast daily cash-entry workspace for branch agents. It is a planning artifact, not an implementation contract. Runtime code, migrations, and active guides take precedence once the module is built.

## 1. Product Goal

POS should let an agent record a cash transaction in a few seconds while preserving enough information to reconcile the drawer and follow up on incomplete customer details later.

The first version should optimize for:

- Fast keyboard-friendly entry during normal work and rush hour.
- A clear current cash-drawer balance at the top of the page.
- A readable ledger of today's and selected-period transactions.
- Ready-made service/category options that reduce typing without making the workflow rigid.
- Partial payments with an explicit outstanding balance.
- An optional LMS Action when more customer or account detail is needed.

## 2. Proposed Screen Layout

Use the existing dashboard shell and responsive conventions.

```text
| thin left menu |              main workspace                         | quick categories |
| Reports        | Cash drawer: opening + received - paid out = balance   | NADRA            |
| Reconciliation | Filters / date / search                                  | PK Passport      |
| Settings       | Ledger rows                                               | GB Passport      |
|               |                                                         | Remittance       |
|               | Bottom quick-entry form                                  | Cargo            |
|               |                                                         | Ticketing        |
```

### Top row: drawer balance

Show one prominent row containing:

- Current drawer balance.
- Opening balance for the selected business day.
- Total cash received.
- Total cash paid out.
- A compact indicator when the drawer is unreconciled or has pending detail actions.

The balance should be calculated from posted transactions, not from a value typed into the UI. A future reconciliation flow can compare it with a physical count.

### Middle: ledger

Default to today's entries, newest first. Each row should show:

- Time.
- Customer name, or `Walk-in` when no name is supplied.
- Category and option.
- Money direction: received or paid out.
- Amount.
- Remaining balance, when relevant.
- Detail status: complete, needs details, or action pending.
- Entry agent.

Support date range, category, direction, detail status, and text search filters. Keep pagination or incremental loading consistent with the existing ticketing ledger.

### Bottom: quick-entry form

The form should stay visible on desktop and remain easy to reach on mobile. The minimum first-pass fields are:

- Name: required for customer-linked transactions; allow `Walk-in` for branch expenses or anonymous sales.
- Amount paid: required, positive money value with two decimal places.
- Phone number: optional and normalized when supplied.
- Category and option: quick buttons can preselect these values, but the form must allow a generic/custom entry.
- Direction: `Received` or `Paid out`.
- Total due or existing LMS account: optional for a partial-payment transaction.
- Note/reference: optional, especially for supplier payment, expense, donation, or balance adjustments.

After save, reset the form and focus the name field so the next entry can begin immediately. Use an idempotency key so double-clicks or poor connectivity do not create duplicate cash movements.

## 3. Quick Categories And Options

Categories are presets, not a closed accounting taxonomy. Each preset should provide a sensible label and direction, while still allowing an agent to choose `Other` and enter a note.

| Category             | Initial options                                         | Default direction |
| -------------------- | ------------------------------------------------------- | ----------------- |
| NADRA                | Application, renewal, correction, other                 | Received          |
| PK Passport          | New passport, renewal, urgent service, other            | Received          |
| GB Passport          | Application, renewal, document service, other           | Received          |
| Remittance           | Send money, receive money, service fee, other           | Received          |
| Cargo                | Booking, handling fee, delivery, other                  | Received          |
| Ticketing & Packages | Ticket payment, package deposit, package balance, other | Received          |
| Visa                 | Application, appointment, service fee, other            | Received          |
| Supplier payment     | Supplier invoice, commission, refund, other             | Paid out          |
| Balance payment      | Existing customer balance, installment, other           | Received          |
| Donations            | Donation received, donation paid out, other             | Received          |
| Expense              | Office, transport, courier, petty cash, other           | Paid out          |

The option list should be configuration data or a small versioned catalogue rather than hard-coded assumptions scattered through components. Admins may eventually manage options, but the first release can ship with a fixed catalogue.

## 4. Partial Payments And Balances

A partial payment must be distinguishable from a fully settled payment.

Proposed rules:

1. If the agent selects an existing LMS account, POS records the payment against that account and reads the resulting balance from LMS.
2. If no LMS account is selected, the agent may enter `Total due`. When `Amount paid < Total due`, POS stores the calculated outstanding balance and marks the row `Balance due`.
3. `Amount paid > Total due` is blocked unless the agent explicitly records the excess as a separate adjustment or refund workflow.
4. A transaction with only an amount and no total due is treated as a payment with an unknown balance, not as settled.
5. Later payments should be separate ledger entries linked to the same customer or LMS account; do not overwrite the original payment.

The ledger should show both the amount received in this entry and the current outstanding balance. The cash drawer balance must include only the money movement, never the outstanding balance.

## 5. LMS Action Handoff

The quick path should not force agents to complete a full customer profile during rush hour.

When an entry is saved without the details required by the selected service or linked LMS account, create an LMS Action containing:

- POS transaction ID.
- Customer name and phone, if available.
- Category and option.
- Amount and transaction date.
- Missing detail reason.
- Assigned branch and entry agent.
- Status: pending, in progress, completed, skipped, or cancelled.
- Due/priority metadata, if the LMS supports it.

The UI should offer `Save and complete details` and `Save for later`. `Save for later` posts the cash transaction immediately and leaves the action pending. A pending-action count and filter should be visible from POS. The LMS action must link back to the POS transaction so later completion does not require searching by name alone.

The exact LMS Action API and ownership model are open questions; POS should use an existing LMS action contract if one exists rather than creating a parallel task system.

## 6. Data Model Proposal

Suggested core record: `pos_cash_transactions`.

Required fields:

- `id`, `branch_id`, `business_date`, `occurred_at`.
- `customer_name`, optional `phone_number`.
- `category_key`, optional `option_key`, and optional free-text `note`.
- `direction` (`received` or `paid_out`).
- `amount` as a fixed-precision monetary value.
- `created_by`, timestamps, and audit metadata.

Balance fields:

- Optional `lms_account_id`.
- Optional `total_due`.
- Derived or snapshot `balance_after_payment`, with a clear distinction between unknown and zero.

Control fields:

- `status` (`posted`, `voided`, or `reversed`).
- `idempotency_key` unique per branch/user flow.
- Optional `lms_action_id`.

Do not delete posted transactions. Corrections should create an auditable reversal or adjustment and preserve the original row.

## 7. Access, Audit, And Controls

- Add POS to the dashboard module catalogue under Finance or Operations after deciding which department owns it.
- Restrict branch data by the existing location/employee access rules.
- Allow ordinary agents to post transactions and view permitted ledger rows.
- Restrict opening-balance changes, voids, reversals, date corrections, and reconciliation approval to authorized roles.
- Record who created, edited, voided, or reconciled every financial record.
- Use server-side validation for amount, direction, branch, date, and authorization; client validation is only for speed and feedback.
- Treat phone numbers and customer details as protected data and expose only what the user's role needs.

## 8. Reports And Left Menu

The thin left menu can start with:

- Daily ledger.
- Monthly reports.
- Reconciliation.
- Pending LMS Actions.
- Category totals.

The first report slice should provide daily and monthly totals by direction and category, with an export path only after the underlying totals are trusted. Reconciliation should be a later slice unless the branch requires opening-balance control from day one.

## 9. Delivery Phases

### Phase 0: Confirm the contract

- Decide whether POS is Finance or Operations.
- Confirm the source of opening balances and business-day timezone.
- Confirm whether every transaction must have a name or whether `Walk-in` is acceptable.
- Confirm the LMS Action fields, endpoint, assignment rules, and notification behavior.
- Confirm whether payment totals should be shared with existing LMS instalment records.

### Phase 1: Cash ledger vertical slice

- Add the dashboard route and access entry.
- Add migration, types, server API, and row-level access checks.
- Build the top balance row, ledger, category quick buttons, and quick-entry form.
- Support received/paid-out transactions, optional phone, notes, and idempotent posting.
- Add focused unit/API tests for balance arithmetic, validation, access, and duplicate submissions.

### Phase 2: Balance and LMS workflow

- Link entries to LMS accounts.
- Add total-due and partial-payment behavior.
- Create and display pending LMS Actions.
- Add completion, skip, and audit behavior.

### Phase 3: Operations and reporting

- Add monthly reports and category totals.
- Add reconciliation and controlled reversals.
- Add exports and admin-managed category options only after usage confirms the need.

## 10. Acceptance Criteria For The First Build

- An agent can record a normal cash receipt without leaving the POS page.
- A paid-out expense is included in the drawer calculation with the correct sign.
- Refreshing or double-submitting cannot create a duplicate transaction.
- A partial payment preserves the original amount and shows the outstanding balance.
- A missing-detail entry remains posted while its LMS Action is pending.
- Users cannot view or mutate another branch's records without explicit permission.
- The ledger and balance remain usable at narrow mobile widths and during repeated keyboard entry.
- Every correction path is auditable and does not silently rewrite posted cash history.

## Decisions To Make Together

1. Should the drawer balance be per branch, per physical till, or per agent shift?
2. Is `Total due` enough for unlinked partial payments, or must every balance belong to an LMS account?
3. Which fields should trigger an LMS Action for each category?
4. Should remittance and supplier payments be represented as cash movements only, or also have separate operational records?
5. Who can void, reverse, or correct a posted entry?
6. Should POS use the existing `/dashboard/lms` module as the action inbox, or should POS show a small embedded pending-actions panel?
