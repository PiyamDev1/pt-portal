# POS Daily Transaction Module Plan

**Status:** Implementation complete in application code — controlled production migration pending
**Module:** Point of Sale (POS) / branch daily transactions
**Proposed route:** `/dashboard/pos`

This document describes a fast daily transaction workspace for branch staff. It is a planning artifact,
not an implementation contract. Runtime code, migrations, and active guides take precedence once the
module is built.

### Implementation snapshot — 9 September 2026

- `/dashboard/pos` now contains the live branch workspace: normalized daily ledger, server-side search
  and filters, quick entry, split tenders, explicitly armed loyalty scanning, tracked-service references,
  till opening, cash/reserve movement, closeout and independent approval, supplier balances, refunds,
  corrections, reconciliation, reports, receipts, retry-safe drafts, and historical CSV import.
- `supabase/migrations/20260908214024_pos_module_complete.sql` supplies the normalized append-only POS
  model, indexes, forced RLS, restricted grants, service-only atomic functions, idempotency records,
  audit events, reference generation, loyalty lifecycle integration, supplier balances, and seed catalogue.
- The application checks POS capability version `2026090801`. Until that capability is installed it keeps
  the existing legacy ledger available read-only and visibly disables money writes.
- Every API derives the authenticated employee and branch server-side, uses strict bounded schemas,
  private/no-store responses, and rate limiting. Manager-only operations require a fresh TOTP or backup
  code where specified.
- Disposable PostgreSQL coverage installs the customer loyalty prerequisites, rolls the POS migration
  back cleanly, installs it, and exercises split cash impact, retry idempotency, source enforcement,
  supplier deposits/use, reserve transfers, refunds and proportional points reversal, immutable rows,
  corrections, imports, and independent closeout approval.
- Production deployment is deliberately pending because Supabase migration history also contains two
  older unapplied Ticketing migrations. Apply all three together only after reviewing that deployment
  scope; application code is safe to deploy first because of the capability gate.

## 1. Product Boundary

POS and LMS are separate systems with different responsibilities.

### POS owns

- Daily branch transactions previously recorded in Excel.
- Cash, card, and bank payment/tender recording.
- Physical till balancing and branch closeout.
- Supplier payments and operational supplier deposit balances, linked to LMS supplier records.
- Untracked service sales.
- POS-only loyalty points for eligible untracked services.
- Simple, traceable refunds against the original POS transaction.
- Immutable transaction history and safe retry behavior.

### LMS owns

- Customer loans and debt.
- Customer account statements.
- Installment schedules.
- Outstanding balances and payment chasing.

LMS may also contain a small supplier register and supplier-balance file. This is separate from customer
loans and collections; POS remains responsible for the daily transaction and tender entry.

POS may link to LMS when a payment is specifically a repayment against an LMS account. POS must not
become a second loan, debt, or collections system.

POS is a service-business POS/cashbook. It does not initially include stock control, retail inventory,
VAT/tax calculation, card-terminal integration, or loyalty redemption. Customers redeem loyalty points
through the web app.

## 2. Product Goal

An agent should be able to record a normal daily transaction in a few seconds without leaving the POS
page or understanding accounting terminology.

The first version should optimize for:

- A very short keyboard-friendly quick-entry path.
- Optional USB loyalty-card scanning.
- Clear cash-only drawer balance alongside card and bank totals.
- A readable replacement for the current Excel daily ledger.
- Simple, traceable refunds from the original transaction.
- Explicit source links for services already tracked elsewhere.
- Immutable transaction history and safe retry behavior.

## 3. Proposed Screen Layout

Use the existing dashboard shell and responsive conventions. The sketches are an information architecture
reference, not a requirement to reproduce the fixed colours or dimensions literally.

```text
| POS navigation |                 main workspace                  | quick categories |
| Ledger         | Till/session status and cash balance               | Untracked        |
| Closeout       | Cash / card / bank summary                         | Tracked services |
| Reports        | Filters and searchable daily transactions         | Refunds &        |
| Settings       | Expandable transaction details and refunds         | corrections      |
|                | Quick-entry composer                                | Cash management  |
|                |                                                   | Supplier payments|
|                |                                                   | Expenses         |
```

### Header and balance summary

Use the shared dashboard header. The POS summary should show:

- Branch, till, and active shift/session.
- Current cash drawer balance.
- Current extra-coin reserve balance.
- Opening float.
- Cash received and cash paid out.
- Cash refunds and deposits/withdrawals.
- Card and bank totals for the selected period.
- Number of pending or failed non-cash reconciliations, if those statuses are supported.
- Last calculated timestamp and a stale-data indicator when the balance is not realtime.

The cash balance is calculated from posted cash movements, not from a UI-entered running total.

```text
cash balance = opening float
             + cash received
             + other cash in
             - cash expenses
             - cash refunds
             - cash deposits
             - cash transfers out
             + cash transfers in
```

Card and bank payments must never increase the physical cash balance.

### Ledger

Default to the active business day, newest first. Each transaction row should show:

- POS reference number.
- Date and local time.
- Customer/member name or `Walk-in`.
- Service/category and option.
- Payment methods and amounts.
- Money in or money out.
- Net cash impact.
- Loyalty points awarded or reversed, when applicable.
- Refund status and refundable remainder.
- Entry agent.
- Status such as posted, partially refunded, refunded, voided, or correction pending.

The row should open a detail drawer containing payment splits, source links, loyalty history, refunds,
notes, and audit history. Refund should be launched from this detail view.

On desktop, the bottom edge of the ledger is a resize handle. Staff can drag it vertically to choose how
many rows remain visible for their screen and workflow. Save the chosen height locally for that browser
and user workstation, clamp it to usable minimum and maximum heights, and keep the table header sticky.
Double-clicking the handle resets it to the product default. The handle must also support keyboard
adjustment and reset; mobile may use the default bounded height when resizing would conflict with touch
scrolling.

### Search and filters

Search and filtering are core daily POS features, not reporting-only features. Provide a prominent
search field with a clear button and active-filter chips. Search should support:

- POS reference number.
- Customer/member name, phone, or masked loyalty member identifier.
- Supplier name or supplier reference.
- Category/service and option.
- Note, external payment reference, and typed source reference.

Provide branch-scoped filters for:

- Business date or date range, with quick options such as today, yesterday, this week, and this month.
- Category/service, payment method, income/expense direction, outgoing type, and amount range.
- Supplier and supplier movement type, such as pay/deposit, use balance, refund, or correction.
- Till, shift/session, entry agent, source module, and source-linked/unlinked status.
- Posted, pending, failed, voided, partially refunded, fully refunded, and correction status.
- Loyalty attached, points awarded, points reversed, and no-loyalty status.
- Reconciliation state for card/bank tenders and refundable/refunded status.

Search must remain branch-authorized and server-side, with indexed fields and bounded keyset/incremental
loading. An exact POS reference should open the transaction directly. Clearing filters must return to
the active business-day view, and an empty result should explain which filters are active.

### Quick-entry composer

The desktop version may keep the composer visible below or beside the ledger. On mobile it should be
an expandable composer or sheet rather than a permanently fixed form that can be covered by the
keyboard or mobile navigation.

Recommended default flow:

```text
[Scan loyalty card] [Continue without card]

[Service/category preset]

Name:         [________________]

Amount:       £________
Payment:      [Cash] [Card] [Bank] [Split]    (negative amount = money out)

[Save transaction]       [Refunds & corrections]
[Cash management]
```

Progressive fields such as name, phone, source reference, notes, and LMS linking appear when the
selected category requires them or when the agent expands “More details.”

After a confirmed save, show the POS reference and any points awarded, reset the form, and focus the
first useful field. On validation or network failure, preserve the entered data.

## 4. USB Loyalty Card Scanning

The USB scanner is expected to behave as a keyboard-wedge scanner. POS should use a dedicated,
explicitly armed scan input rather than globally intercepting keyboard input.

Scan flow:

1. Agent presses `Scan loyalty card`.
2. POS focuses the scan input.
3. The scanner enters the card/customer code and its terminating Enter key.
4. The server validates and looks up the active loyalty member.
5. POS displays a compact confirmation and attaches the member to the pending transaction.
6. Agent can rescan, remove the member, or continue without loyalty.

Requirements:

- The scanner starts disarmed. Clicking `Scan loyalty card` arms a clearly visible, focused capture field
  for one scan and a short timeout (30 seconds initially).
- Enter submits the captured scan, Escape or `Cancel` disarms it, and a completed or failed lookup
  disarms it before another scan can be accepted. The operator must deliberately choose `Scan again` to
  reopen the capture window.
- Use the existing canonical loyalty customer code/member identity; do not create a second POS card
  number system.
- Normalize and validate the scanned value server-side.
- Show enough information to confirm the member without exposing unnecessary private data.
- Provide manual code entry as a fallback.
- A failed scan must not block the cash transaction.
- Do not log raw card/customer codes in operational logs.
- Record who attached the loyalty member and when, if audit requires it.

A plug-and-play keyboard-wedge scanner is presented to Windows and the browser as a keyboard. The POS
page can control when it interprets input as a loyalty scan, but it cannot electrically disable that
device or reliably distinguish every scanner keystroke from fast human typing. If scans must be unable
to type into whichever field currently has focus, use one of these deployment controls:

- Configure the scanner for trigger/manual mode instead of continuous or presentation mode, with the
  trigger inaccessible to customers.
- For the NetumScan A5, evaluate its documented `USB COM` plus `Command Trigger Mode` combination and
  use an approved Web Serial or local-device bridge that sends start/end commands only during the armed
  window. Confirm the command set against the exact device firmware before implementation.
- Reposition or shutter the scanner so a customer cannot present a barcode while the operator is doing
  sensitive work.

Do not implement timing-based global keystroke blocking as the security boundary: it can corrupt normal
typing and cannot guarantee that the first characters of an unsolicited scan do not reach a focused
field.

Scanning identifies the customer. It does not redeem points.

## 5. Categories And Loyalty Eligibility

Categories are presets that make entry fast, not a substitute for the accounting model. Each catalogue
option should define:

- Stable key and display label.
- Income, expense, or operational classification.
- Default money direction and allowed directions.
- Whether a customer/member is required.
- Whether a source record is required or recommended.
- Whether the service is tracked by another module.
- Whether POS loyalty is explicitly eligible.
- Loyalty calculation rule/version, when eligible.
- Allowed payment methods.

Loyalty eligibility defaults to false and is controlled by the server-side catalogue. Agents must not
be able to award points by changing a client-side flag.

### Initial quick-entry catalogue

The first branch-facing category list should use the operational names staff already recognise:

- `NADRA`, expanding to the pricing-table service types `NICOP/CNIC`, `POC`, `FRC`, `CRC`, and `POA`.
- `PK Passport`.
- `GB Passport`.
- `Visa`.
- `Ticket & Package`.
- `Remittance` (loyalty applies to the service fee, not money being transferred).
- `Document help` and other explicitly approved untracked services.
- `Supplier payment`, `Expense`, and `Refunds` for the three permitted outgoing workflows.
- `Extra coins` for drawer-to-reserve transfers.

The catalogue remains configurable, but staff-facing labels should stay stable. Tracked application,
ticket, and package categories must retain their source links and remain ineligible for POS loyalty.
Normal, Executive, Fast, or similar speed labels are pricing options, not POS subcategories. POS should
match the entered total price to the active pricing row and derive the option when the match is unique.
If no price or more than one option matches, show a small confirmation choice instead of guessing.

### Tracked services: no POS loyalty

The following remain excluded from POS loyalty because their service lifecycle and loyalty logic are
handled elsewhere:

- Tickets and ticket-related services.
- Applications, including NADRA, passports, and visas.
- Travel packages and package components.

POS may still record their daily payment/tender for branch reconciliation, with an optional typed link
to the originating service record. POS must not create a second service lifecycle or loyalty award for
them.

### POS loyalty services

The initial eligible catalogue may include services such as:

- Remittance service fees.
- Cargo or delivery fees.
- Courier, photocopying, printing, or document assistance.
- Other approved services that are not tracked in a dedicated module.

Expenses, supplier payments, transfers, deposits, withdrawals, and corrections never earn points.
“Other” requires a note and may require review.

Points are awarded once after a successful posted POS transaction. They are not awarded for a draft,
failed save, void, expense, or ineligible tracked service.

The POS loyalty source must use a stable idempotent reference, for example:

```text
pos.v1:<pos-transaction-id>
```

If POS loyalty is implemented, the loyalty lifecycle should gain an explicit POS source or a controlled
POS-service namespace. POS must use a server-side loyalty operation rather than writing directly to the
points ledger.

### Cash management category

The quick-entry categories should also contain `Cash management` with separate actions for:

- `Move extra coins to reserve` — coins leave the drawer and enter the separately stored coin reserve.
- `Return extra coins to drawer` — coins leave the reserve and return to the drawer.
- Other controlled cash movements such as deposits, withdrawals, or till-to-till transfers.

Extra coins are not a sale, expense, refund, customer payment, loyalty event, or accounting profit/loss
entry. They are an internal transfer between two physical cash locations.

### Supplier payments category

The quick-entry categories should contain `Supplier payments` with an LMS-backed supplier selector and
three simple actions:

- `Pay/deposit to supplier` — pay cash, card, or bank funds and increase the supplier balance we hold.
- `Use supplier balance` — reduce the balance when the supplier provides the service or goods.
- `Supplier refund` — record money or credit returned by the supplier.

For normal cash entry, the agent may first choose a category, type a name, and enter an amount. If the
amount is money out, POS asks for one of three outgoing types: `Refund`, `Expense`, or `Supplier
payment`. For a supplier payment, it suggests matching configured suppliers. The agent confirms the
supplier or continues as an expense/refund. There must be no uncategorized outgoing type.

LMS is the source of truth for confirmed supplier names/details; POS stores the LMS supplier ID/reference
and must not create a duplicate supplier profile. The first version should track one simple `balance held
with supplier` per supplier and branch. It does not need invoice matching, payable accounting,
allocations, or central supplier accounts yet. Supplier entries do not earn POS loyalty points.

## 6. Payments And Tender Splits

Each transaction may have one or more payment tenders. The sum of the tender amounts must equal the
amount being recorded, except where an explicit source system owns an outstanding balance.

Quick entry should show `Total price` and `Amount paid now` as separate fields and calculate `Balance
remaining` or `Change due` immediately. A remaining balance must be linked to the originating tracked
service or an explicit LMS account; POS displays it for entry clarity but must not create a shadow debt
balance of its own.

Example:

```text
Transaction amount: £100
Cash:               £40
Card:               £60
Cash drawer impact: +£40
```

Initial payment methods may include cash, card, bank transfer, and other approved methods.

For non-cash methods, POS records the branch’s stated payment method. It does not claim that a bank or
card payment was externally settled unless an integration later confirms it. An external reference and
reconciliation state should be available where useful.

Keep these concepts separate:

- Transaction/service amount.
- Money direction: `IN` or `OUT`. For quick entry, a negative typed value may be accepted as shorthand
  for `OUT`, but the server stores direction separately from the positive amount.
- Amount tendered.
- Change given.
- Payment-method split.
- Net cash impact.
- Customer amount owed, which belongs in LMS or the originating tracked module.

For `OUT` entries, the only allowed types are `REFUND`, `EXPENSE`, and `SUPPLIER_PAYMENT`. Cash
management transfers such as extra coins are recorded separately as internal cash movements and are not
treated as POS outgoings.

## 7. LMS And Other Source Links

POS should not automatically create an LMS account for every customer or transaction.

When the agent explicitly selects an LMS account:

1. POS records the tender and the LMS payment through one server-controlled operation.
2. The LMS `loan_transaction` remains the authoritative debt payment.
3. POS stores the resulting LMS transaction reference for reconciliation and display.
4. A failed LMS write must not leave an apparently completed POS payment without a clear error or
   recoverable pending state.

If a customer owes money for an untracked POS service, the agent must either link an existing LMS
account or deliberately create the LMS debt through the LMS workflow. POS must not maintain a shadow
outstanding balance.

For Ticketing, Applications, Packages, and future service modules, use a typed source reference:

```text
source_type + source_record_id + optional source_namespace
```

An untyped record ID alone is insufficient to prevent accidental cross-module links.

## 8. Supplier Payments And Balances

Supplier balances are a small running balance, not an LMS loan or a full accounts-payable system. The
first version should add a small configured supplier register/file in LMS for the standard suppliers the
business wants to track.

Existing supplier names from Ticketing, Packages, and other modules can be used as matching suggestions.
They do not all need to be consolidated before POS launches. A configured supplier can have a display
name, alternate names, and an optional source area/reference.

For an outgoing POS entry:

1. The agent chooses a category such as Ticketing, types the name, and enters a negative amount.
2. POS treats the negative amount as `OUT` and asks for `Refund`, `Expense`, or `Supplier payment`.
3. If `Supplier payment` is selected, POS searches configured supplier names and known module names for
   matches and asks the agent to confirm the supplier.
4. If confirmed, POS files the entry under the selected LMS supplier record and updates the simple
   supplier balance, while retaining the selected source category such as Ticketing or Packages. If the
   supplier cannot be matched, the agent must choose `Expense` or `Refund`, or ask an authorized user to
   add the supplier to the configured list.

Matching must suggest rather than silently decide. If there are multiple matches, show the choices. An
outgoing entry cannot be posted without one of the three outgoing types, and a supplier payment cannot be
filed to an unknown supplier.

Name matching can begin with simple normalized names and configured alternate names, using the selected
category as a hint. Complex fuzzy matching is not required for the first version.

The balance is calculated from simple entries:

```text
supplier balance = opening balance
                 + pay/deposit to supplier
                 - use supplier balance
                 - supplier refund
```

For each confirmed supplier entry, record the LMS supplier reference, branch, movement type, amount,
payment method when money moves, note/reference, actor, timestamp, and idempotency reference. A supplier
deposit must write the POS cash movement and supplier balance entry together: if one fails, neither is
completed.

The supplier detail view should show the current balance and a simple running list of deposits, uses, and
refunds. Paying/depositing cash reduces the drawer immediately; using the supplier balance does not
reduce the drawer again.

Supplier refunds should identify whether money returned to the drawer, money returned by bank, or only a
credit was received. Exceptional corrections require a reason and an audit event. Keep balances
branch-scoped and in the till currency for the first version.

## 9. Refunds

Refunds should be available from every eligible posted transaction, regardless of whether the original
payment was cash, card, or bank. The preferred path begins from the original POS transaction.

The quick-entry categories should contain a `Refunds & corrections` category with:

- `Refund original transaction` as the normal linked refund action.
- `General refund (unlinked)` for a refund where the original transaction was not recorded in POS,
  cannot be found, occurred in a legacy/offline process, or needs to record an externally completed
  refund.
- `Expense correction` as a separate correction/reversal action.

The general refund is an exception path, not a shortcut around searching for and linking the original
transaction.

The refund form should show:

- Original transaction amount.
- Amount already refunded.
- Remaining refundable amount.
- Refund amount.
- Refund method.
- Reason/note.
- External reference for a bank/card refund, when applicable.

For a linked refund, show the original tender breakdown and allow the agent to choose whether the
refund follows that method or uses a different method. For a general refund, require the best available
original date, customer, service/category, original amount, original payment method, refund amount,
refund method, reason code, and supporting reference or note. Unknown values must be explicitly marked
unknown rather than guessed.

Rules:

- Refunds are separate immutable child records or reversal events; never edit the original amount.
- A refund cannot exceed the remaining refundable amount.
- Multiple partial refunds are supported.
- A refund method may differ from the original payment method, but the difference must be explicit.
- Only cash refunds affect the till balance.
- Bank/card refunds should distinguish recorded, pending, and completed states when POS does not
  directly control the external refund.
- Every original transaction, including non-cash transactions, should expose the normal refund action.
- A general refund is marked `unlinked` or `exception` until a manager approves it. In V1, it requires
  manager approval, a fresh second-factor check, and an audit note explaining why the original record
  was unavailable.
- Customer receipt refunds apply to incoming transactions. Expense corrections use a separate
  correction/reversal flow.
- Refunds after closeout, refunds above a configured threshold, and exceptional method changes may
  require manager approval and fresh second-factor verification.

### Loyalty reversal on refund

If the original transaction has a POS loyalty award:

- A full refund reverses all points awarded.
- A partial refund reverses points proportionally to the refunded eligible value.
- Rounding must be deterministic, and cumulative partial refunds must never reverse more than the
  original award.
- The final full refund must reverse the award exactly.
- A refund retry must not create a second points reversal.
- If the customer has already redeemed the points, the plan must define whether a negative balance is
  allowed or whether manager review is required. Manager review is the safer initial default.
- A linked loyalty award is reversed using the saved member identity and original award reference. A
  general refund may scan a loyalty card to locate that award, but must not invent a points reversal
  when no original POS award can be found. Any off-system points adjustment requires a separate,
  manager-reviewed loyalty adjustment linked to the general refund.

The refund record should link to both the original POS transaction and the loyalty reversal event.

## 10. Till, Shift, And Business Day

The preferred model is:

- `till`: physical drawer assigned to a branch.
- `shift/session`: period during which an agent is responsible for a till.
- `transaction`: an immutable business event.
- `tender`: how that event was paid.
- `closeout`: physical count and over/short result.

If a branch has one shared drawer, V1 may use one active till/session per branch, but the data model
should not assume that every branch has only one drawer forever.

Define:

- Opening-float authority and first-day behavior.
- Cash transfer between tills.
- Cash deposit/removal from a drawer.
- Extra-coin reserve ownership: per branch, per till, or another explicitly assigned location.
- Denomination-count requirements when coins move into or out of the reserve.
- Shift handover.
- Whether entries are allowed after closeout.
- Late-entry and backdated-entry permissions.
- Over/short reason and approval.
- Whether the person counting cash may approve their own closeout.

`business_date` is derived server-side from the branch timezone. `occurred_at` is stored in UTC and
displayed in branch-local time. Client-provided branch IDs, employee IDs, and business dates are not
authority for a money mutation.

### Extra-coin reserve

The extra-coin reserve should have its own balance, separate from the drawer balance. Determine it from
immutable cash movements rather than asking the agent to type a running balance:

```text
reserve balance = opening reserve
                + coins moved from drawer to reserve
                - coins returned from reserve to drawer
                +/- approved reserve corrections
```

Each coin movement should record the total amount, currency, source and destination, branch, till or
shift, actor, timestamp, reason, and a denomination breakdown such as `10 x 10p` and `5 x 20p`. The
server should calculate the total from the denomination counts and reject a mismatch. A movement out
of the drawer must not exceed the expected available drawer cash; a movement out of the reserve must
not exceed the expected reserve balance.

At closeout, the agent counts the drawer and the separately stored reserve independently. The system
shows:

- Expected drawer balance versus actual drawer count.
- Expected reserve balance versus actual reserve count.
- Combined physical cash and the combined over/short difference.

An intentional reserve transfer therefore does not create an over/short result: moving £5 of coins to
the reserve reduces the drawer by £5 and increases the reserve by £5; returning those coins does the
opposite. Any physical mismatch is recorded separately as an over/short or approved correction.

## 11. Data Model Direction

The current schema snapshot already contains daily-ledger, payment-split, category, transaction-method,
supplier, and till-closeout structures. Phase 0 must determine whether those structures are legacy
Excel-support tables or the correct starting point for POS. Do not introduce a parallel ledger without a
reviewed migration/deprecation path.

If a new POS model is required, the conceptual shape is:

```text
pos_tills
pos_shifts
pos_cash_reserves
pos_cash_movements
LMS supplier register/file (configured)
LMS supplier balance entries (simple)
pos_transactions
  ├── pos_transaction_tenders
  ├── pos_transaction_source_links
  ├── pos_transaction_refunds
  └── audit/correction events
```

### Transaction fields

- `id`, stable daily `reference_number`.
- `location_id`, `till_id`, optional `shift_id`.
- Server-derived `business_date` and UTC `occurred_at`.
- `transaction_kind`, required `outgoing_type` for money-out entries, and category references.
- Amount and currency with fixed precision.
- Customer/member snapshot and optional canonical customer references.
- `created_by`, `created_at`, and immutable audit metadata.
- Posted/voided/correction state, derived or append-only where possible.
- Idempotency request fingerprint/reference.

### Tender fields

- Parent transaction.
- Payment method.
- Amount and currency.
- External reference and reconciliation state, where applicable.
- Derived cash-impact flag; the client must not decide this.

### Cash movement fields

- Movement kind, such as opening float, extra coins to reserve, extra coins to drawer, deposit,
  withdrawal, till transfer, or approved correction.
- Source and destination cash location.
- Amount and currency, derived from denomination counts where applicable.
- Structured coin denomination/count breakdown for extra-coin movements.
- Till/shift, actor, reason, approval, timestamps, and idempotency reference.
- Link to the originating POS transaction or closeout when applicable.

### Supplier balance fields

- LMS supplier ID/reference, display name, alternate names, and optional source area/reference.
- Branch scope for the simple balance.
- Movement type: opening balance, pay/deposit, use balance, supplier refund, or correction.
- Amount, currency, payment method when money moves, supplier reference, note, actor, and timestamps.
- Idempotency reference and immutable audit metadata.

### Refund fields

- Original POS transaction.
- Refund amount and one or more refund tenders.
- Reason, actor, approval actor, and timestamps.
- Refund status and external reference.
- Loyalty reversal reference, if applicable.

Never delete or silently rewrite posted cash history. Corrections and refunds append new auditable records.

## 12. Excel Migration And Reports

The first POS ledger should be a clearer replacement for the current Excel columns:

```text
Date | Type | Name | Payment method | In | Out | Note | Agent | Reference | Status
```

The ledger header should provide `Day` and `Month` views with a native date/month selector. Day view
opens on today but allows any earlier business date, including yesterday. Month view groups entries by
business date, keeps supplier sorting within each day, and inserts a clearly spaced date band between
days showing the date, entry count, and daily net total.
Previous/next controls should move one day or month at a time, while a `Today` shortcut returns directly
to the current daily ledger. Monthly view should include a compact summary of active days, money in,
money out, and net movement. Keyboard shortcuts should focus ledger search (`/`) and Quick Entry (`N`)
when the user is not already typing in a field.

Reports should provide:

- Gross receipts.
- Refunds and net receipts.
- Cash received, cash paid out, cash refunds, and drawer balance.
- Card and bank totals separately.
- Totals by category, option, branch, till, shift, and agent where authorized.
- Loyalty points awarded and reversed, separately from money.
- Unreconciled bank/card items.
- Closeout over/short amounts.
- Extra-coin reserve opening balance, movements, current balance, physical count, and variance.
- Supplier deposits, balance used, supplier refunds, and current balance by supplier.

If historical Excel rows need importing, provide a dry-run/import path with column mapping, duplicate
detection, a legacy source marker, and read-only preservation of the original date and note. Imported
rows must not accidentally award new loyalty points or trigger external service payments.

## 13. Access, Audit, And Controls

- POS access must be available to authorized branch staff who post daily transactions; it should not
  be restricted only to the Accounting department if agents are expected to use it.
- The server derives the authenticated employee and branch/location. The browser cannot choose a
  different branch to post into.
- Ordinary staff may post permitted transactions and view permitted branch/till rows.
- Cross-branch visibility, closeout approval, corrections, refunds above thresholds, and catalogue
  management require explicit authorization.
- Use `employee_departments` as the canonical department-membership source where department access is
  relevant.
- Keep RLS enabled and place service-role operations behind verified staff authorization.
- Use strict bounded request schemas, rate limits, required idempotency keys, and PostgreSQL functions
  for transactionally coupled writes.
- Do not log customer phone numbers, loyalty codes, payment references, or raw request payloads.
- Record creation, refund, void, correction, closeout, approval, loyalty award, and loyalty reversal
  events.

## 14. POS Navigation

The POS left rail should be POS navigation, not a duplicate dashboard module menu:

- Daily transactions.
- Open till/shift.
- Closeout.
- Refunds/corrections.
- Supplier balances.
- Reports.
- Unreconciled card/bank items.

The right rail should be labelled `Quick entry categories`. Main categories should remain square tiles.
A tile with service variants should expand and collapse a compact subcategory list directly beneath it;
for example, the `NADRA` tile reveals separate colour-coded rows for `NICOP/CNIC`, `POC`, `FRC`, `CRC`,
and `POA`. Opening another expandable category or selecting a different main category should close the
previous list. The dashboard module catalogue should contain one POS module entry, while POS categories
remain internal presets.

On desktop, the POS navigation rail should default to icon-only width and expand on pointer hover or
keyboard focus. The daily ledger should use the released width, keep its column header visible, and
scroll inside a bounded height so the quick-transaction composer remains visible on a normal desktop
screen. Supplier should be a visible ledger field, with supplier grouping/sorting available by default.
Opening a transaction should reveal a compact detail strip with edit, refund, and receipt actions rather
than a tall card that pushes quick entry below the fold.

## 15. Additional Improvements

The following additions would make the first release easier and safer to operate:

- Show favourite and recently used categories first, with configurable keyboard shortcuts and sensible
  defaults such as `Walk-in` and the active till.
- Warn about likely duplicate entries using a non-blocking combination of customer, category, amount,
  agent, and short time window. Allow the agent to continue with a reason.
- Offer a receipt/reference view with print, download, or share options after posting and after refund.
- Preserve drafts during validation or connection failure, and show a clearly labelled retry queue for
  requests that were accepted locally but not confirmed by the server.
- Make `Other`, manual discounts, and unusual payment-method changes require a reason code or note.
- Add an exception view for pending card/bank items, failed loyalty awards, unlinked refunds, and
  closeout differences so staff do not have to discover them through the full ledger.
- Keep the selected search/filter state when opening and closing a transaction detail drawer, and allow
  authorized users to save common views such as `Today`, `Refundable`, and `Unreconciled`.
- Display the scope of every total: branch, till/session, business date, and whether refunds are included.

## 16. Delivery Phases

### Phase 0: Confirm the contract

- Inventory existing daily-ledger, payment-split, category, method, and closeout tables and rows.
- Define whether POS adopts, extends, or replaces those structures.
- Confirm branch, till, shift, and business-day behavior.
- Confirm supported currencies and whether each till is single-currency.
- Map the Excel columns and decide whether historical import is required.
- Define tracked versus POS-only services.
- Define the loyalty points formula and refund/partial-refund rules.
- Confirm the loyalty member lookup contract and scanner card format.
- Define the three money-out types and supplier name-matching rules.
- Define LMS/source-link behavior without creating duplicate debt or payments.
- Define the small LMS supplier register: standard suppliers, alternate names, source areas, and opening
  balances or existing cash deposits.
- Define name matching and who may add a new configured supplier.
- Define refund approval thresholds and external bank/card refund states.

### Phase 1: Daily POS vertical slice

- Add the POS dashboard route and authorized module entry.
- Add or extend till/session and opening-float behavior.
- Build the summary, ledger, quick categories, payment methods, and quick-entry composer.
- Support cash, card, bank, and split tenders.
- Add indexed server-side search and filters for the active branch and authorized history.
- Add USB loyalty-card identification and POS-only loyalty awards.
- Add `Cash management` actions for moving extra coins to the reserve and returning them to the drawer.
- Add the three-type money-out prompt and the `Supplier payments` category with name matching,
  confirmation, and simple pay/deposit/use-balance actions filed against the LMS supplier record.
- Add basic closeout and cash over/short recording.
- Add idempotent posting and immutable audit records.
- Add focused unit, API, and disposable PostgreSQL tests.

### Phase 2: Refunds And Source Links

- Add original-transaction refund action.
- Add the visible `General refund` exception path for missing/unrecorded original transactions.
- Support full/partial refunds and different refund methods.
- Add cash-impact and external reconciliation behavior.
- Add loyalty point reversal and retry protection.
- Add explicit LMS, Ticketing, Applications, and Package source links where required.
- Add manager approval, fresh-factor exceptions, and general-refund audit evidence.

### Phase 3: Import, Reporting, And Operations

- Add Excel dry-run/import tooling if required.
- Add daily/monthly reports and category totals.
- Add unreconciled payment queues.
- Add controlled corrections, shift handover, and deposits/withdrawals.
- Add exports and admin-managed catalogue options after usage confirms the need.

## 17. Acceptance Criteria For The First Build

- A new agent can record a basic cash service in five interactions or fewer after opening the POS.
- A USB scan attaches the correct loyalty member without blocking a transaction when it fails.
- Loyalty scanning is visibly disarmed by default, accepts one scan only after an operator action, and
  disarms on success, failure, cancellation, or timeout.
- Ticket, application, passport, visa, and package entries never receive POS loyalty points.
- An eligible untracked service awards points exactly once after a successful save.
- A cash/card/bank split affects the cash drawer only by its cash component.
- A money-out entry can only be posted as `Refund`, `Expense`, or `Supplier payment`.
- An agent can search by POS reference, customer, category, note, or external reference and narrow the
  results with date, payment, status, till, agent, loyalty, refund, and reconciliation filters.
- A refund starts from the original transaction and cannot exceed the remaining refundable amount.
- Every eligible posted transaction, including card/bank transactions, exposes the normal refund action.
- A general refund can record an unlinked/missing original only with required evidence, manager approval,
  fresh second-factor verification, and an audit trail.
- Moving extra coins to reserve reduces the expected drawer balance and increases the expected reserve
  balance by the same amount; returning them reverses that movement.
- Coin denomination counts must equal the movement amount, and drawer/reserve variances are reported
  separately from intentional reserve transfers.
- A £100 cash supplier deposit reduces the drawer by £100 and increases that supplier's balance by £100
  in one atomic operation.
- Using £40 of supplier balance reduces the supplier balance by £40 without reducing the drawer again.
- Supplier balances are searchable by supplier and show a clear running balance.
- A Ticketing or Package money-out entry suggests matching suppliers by name and requires confirmation
  before it is filed to the supplier record.
- Supplier selection uses an LMS supplier record, and POS stores its reference without duplicating supplier
  details.
- A partial refund reverses the correct proportional loyalty points.
- A general refund does not silently reverse loyalty points without a matching original award reference.
- Repeating a save or refund request cannot duplicate money movement or loyalty reversal.
- LMS balances remain authoritative for LMS-linked debt; POS has no shadow debt balance.
- Closed tills cannot receive ordinary unapproved mutations.
- Users cannot view or mutate another branch’s records without explicit permission.
- The ledger and composer remain usable on narrow mobile screens and during repeated keyboard entry.
- A desktop user can resize the ledger vertically, retain that choice after reload, adjust the handle by
  keyboard, and restore the default height by double-clicking or using the reset key.
- Every refund, correction, loyalty reversal, and closeout approval is auditable.

## 18. Decisions To Make Together

1. Do all branches have one shared till, or should V1 model physical tills and staff shifts?
2. Which untracked POS services earn points, and what is the points formula?
3. Are points awarded immediately on posting, or only after a payment is externally reconciled?
4. For partial refunds, should points be proportional, or should any partial refund reverse all points?
5. What happens when refunded points have already been redeemed?
6. Should POS support multiple currencies now, or should each till be single-currency initially?
7. Which bank/card refund states and external references must be recorded?
8. Should historical Excel rows be imported, or should POS begin from a controlled opening date?
9. Which staff roles may post, refund, approve, close out, and correct transactions?
10. Should `General refund` be allowed for any missing original, or only legacy/offline transactions with
    documented evidence?
11. Is manager approval plus fresh second-factor verification required for every general refund, or only
    above a threshold?
12. Should a general refund ever create a points adjustment when the original POS award cannot be found?
13. Which receipt options are needed: print, download, email, WhatsApp/share, or reference only?
14. What should happen when the network fails after the agent presses Save: preserve-only draft, or a
    server-backed retry queue?
15. Is the extra-coin reserve shared by the branch or assigned to each physical till?
16. Which coin denominations must be counted, and may staff record a total-only movement for exceptional
    cases?
17. Does LMS already hold supplier balances, or should POS hold the simple branch balance while linking to
    the LMS supplier record?
18. Which suppliers need balances at launch, and what are their opening balances?
19. What minimum note or receipt reference should be required for supplier deposits and refunds?

### Implemented decision record

The first production-capable build uses these conservative defaults. They are server contracts, not
client-side suggestions:

1. Physical tills and staff shifts are modeled from V1. Every existing branch receives one shared
   `Main till`, and more tills can be added without changing the transaction model.
2. Each till is GBP-only. Multi-currency remains out of scope.
3. The server catalogue is the source of truth. Remittance service fees, cargo/delivery, document help,
   and printing/copying earn one point per whole GBP; tracked Ticketing, Packages, Applications, NADRA,
   passport, and visa services never earn POS points.
4. Eligible points are awarded immediately after an atomic posted transaction. A retry uses the same
   source and cannot award twice.
5. Partial refunds reverse points proportionally using cumulative floor calculation; the final refund
   reverses all remaining points. A manager with fresh 2FA is required if the points balance indicates
   that reversed points may already have been used.
6. Linked refunds of £500 or more, linked refunds from a closed shift, all general refunds, supplier
   opening balances, controlled cash deposits/withdrawals/corrections, expense corrections, imports,
   and closeout approvals use manager controls. General refunds always require evidence, approval reason,
   and fresh 2FA, and never invent a loyalty reversal without an original award.
7. The counter who closes a till cannot approve that closeout. A different authorized manager must do so.
8. POS stores a simple per-branch balance held with each LMS-backed supplier. Supplier deposit, use of
   balance, refund, opening, and correction entries are append-only. Supplier names and aliases are
   configured by managers and matched explicitly before posting.
9. Historical rows use a dry-run-first CSV path (Excel can export the source sheet as CSV), stable source
   and row keys for duplicate detection, original dates/references, a legacy marker, no drawer movement,
   and no new loyalty awards.
10. Receipt output supports a printable browser view, JSON for integrations, and a downloadable text
    receipt. Email and WhatsApp delivery are deferred until a communication policy is selected.
11. Network failures preserve the form draft and place the exact payload plus idempotency key in a local,
    clearly labelled retry queue. The queue is never described as server-confirmed until replay succeeds.
12. Coin reserve transfers require denomination counts. Drawer and reserve are separate expected balances,
    while intentional transfers net to zero across the two physical cash locations.

### Delivered application surface

- Authenticated routes: `/api/pos/bootstrap`, `/ledger`, `/transactions`, `/refunds`, `/shifts`,
  `/cash-movements`, `/suppliers`, `/reconciliation`, `/reports`, `/loyalty/lookup`, `/import`, and
  `/transactions/[transactionId]/receipt`.
- Workspace sections: Daily transactions, Open till, Closeout, Cash management, Supplier balances,
  Refunds & corrections, Reports, Unreconciled, and manager-only Import history.
- Operational fallback: if capability `2026090801` is absent, the old branch-scoped ledger stays readable
  and all new writes remain unavailable.
