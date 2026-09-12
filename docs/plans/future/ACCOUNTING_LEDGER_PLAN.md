# Accounting Cutover and Performance Ledger Plan

## Summary

Start the new Accounting ledger from a controlled cutover date, not by recreating fourteen years of entries. Keep existing Excel workbooks as historical reference. At cutover, enter opening balances only, including accumulated loss and a separately visible opening reconciliation difference where figures cannot yet fully reconcile.

Keep the workflow simple for a sole accountant: spreadsheet-style entry, no approval chain, no compulsory formal close, and optional period soft-locking.

## Workspace and Reports

- Add an Accounting workspace with:
  - Monthly overview
  - Ledger grid
  - Profit & loss
  - Service performance
  - Balances
  - Setup and cutover

- Build reports from posted ledger entries:
  - Income, direct service costs, gross profit, expenses, and net profit/loss.
  - Daily and monthly drill-down to the original entry.
  - Service/variant, supplier, branch, quantity, actual sale value, actual cost, margin, and margin percentage.
  - Optional standard sale/cost values for variance; missing actual costs are flagged rather than estimated.
  - Company totals with branch drill-down.
  - Cash, bank, supplier, remittance-provider, customer debt/credit, loan, tax, and equity balances.

- Keep Accounting GBP-only. Foreign figures remain operational reference data, not a separate FX ledger.

## Ledger, Security, and Soft Locks

- Add a GBP double-entry ledger with chart-of-account, journal, journal-line, source-mapping, opening-balance, rate-card, and audit records.
- Provide a spreadsheet-style draft grid to add, edit, duplicate, and paste journal rows; show running debit/credit totals and prevent unbalanced posting.
- Keep source-linked and posted records immutable. Corrections create linked adjustment or reversal entries.
- Add an optional **Soft lock month** action:
  - A soft-locked period becomes read-only in the ledger grid and clearly marked in reports.
  - It is not an accounting close or approval workflow.
  - Unlocking requires the current accountant to complete fresh authentication using the existing TOTP or backup-code mechanism.
  - Unlocking, re-locking, and all later adjustments are audited with user, time, and reason.
  - Unlocked periods remain normally editable; no automatic monthly lock is imposed.
- Restrict setup, manual journals, cutover, and period locking to Accounts staff and portal administrators. Operational staff continue using their own modules.

## Cutover and Source Integration

- Add a one-time cutover wizard:
  - Select the first accounting date after the final historical spreadsheet period.
  - Enter opening balances by account and branch where relevant.
  - Record accumulated profit/loss separately from any temporary opening reconciliation difference.
  - Attach or reference the historical workbook/bank statement used.
  - Prevent a second opening session once posted.

- A negative company position is valid. Only an unexplained debit/credit mismatch becomes the tracked opening reconciliation difference; it must not appear as normal operating profit.

- Do not import historic row-level Excel data. Historical workbooks remain supporting evidence outside the live ledger.

- Integrate every current finance-producing module before go-live: POS, Ticketing, Packages, Applications, Remittance, LMS, supplier payments/refunds, and cash/bank activity.
- Require complete account mappings before a source event can post. Use idempotent source references so retrying an event cannot create duplicate accounting entries.
- Retain POS as the operational transaction and cash ledger; Accounting receives its financial effect without duplicating POS workflows.

## Test Plan

- Opening balances accept a negative business position when debit and credit totals balance.
- An opening reconciliation difference is separately visible, audited, and excluded from operating profit.
- A source event before cutover does not enter the Accounting ledger.
- Repeated source events post once only.
- P&L, service performance, bank/cash, supplier balances, and branch totals reconcile to the same journal lines.
- The ledger grid rejects unbalanced drafts; posted and source-linked entries cannot be silently edited.
- A soft-locked month blocks edits; fresh authentication unlocks it and creates an audit entry.
- Reversals and adjustments remain linked to the original entry and refresh reports correctly.
- Accounts users and administrators can configure, post, lock, and unlock; ordinary staff cannot.
- Historical spreadsheets remain unchanged and available as evidence.

## Assumptions

- Financial year runs from 1 February to 31 January.
- The cutover date is chosen during setup after the final spreadsheet month is agreed.
- Soft locks are optional and manually controlled by the sole accountant.
- Historical transaction detail will not be imported unless separately approved.
