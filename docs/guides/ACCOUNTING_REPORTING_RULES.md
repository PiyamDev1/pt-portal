# Accounting Reporting Rules

The Branch Ledger is a read-only reporting view over operational modules plus separate manual accounting adjustments. Ticketing, Travel Packages, POS, and LMS continue to own their records and workflows. Accounting does not copy or update those records.

## Reporting lenses

- **Commercial margin** measures sale income less operational costs and confirmed adjustments.
- **Projected margin** may include amounts that are expected but not yet received, such as package commission.
- **Cash movement** records money received or paid. It is not automatically profit.

The ledger labels each source with its lens and date basis. POS cash movement is shown for reconciliation only and is not added to branch profit because it can settle a Ticketing, Package, Application, or LMS item already represented elsewhere.

## Ticketing

Standalone Ticketing margin includes ticket-owned bookings with an operational status of `issued`, `cancelled`, `part_refunded`, or `refunded`:

```text
original margin = passenger sale total - passenger supplier total
```

Held bookings, package-owned bookings, archived bookings, and unresolved scope are excluded. Package-owned tickets belong to the Package result and must not be counted again as standalone Ticketing margin.

### Refunds and cancellations

A refund affects Accounting only after an authorised user has marked its result as confirmed correct. Provisional calculations, voided refunds, package-owned refunds, and records without an actual company result are excluded.

The confirmed result replaces the original ticket margin. Accounting therefore records only the difference:

```text
refund adjustment = confirmed actual company result - original ticket margin
```

For example, an original margin of £150 followed by a confirmed company result of -£20 creates a -£170 adjustment. Adding that adjustment to the original £150 produces the final -£20 result without double counting.

Ticket sales use the booking date. Confirmed refund adjustments use the confirmation timestamp, so a later correction appears in the month in which it became authoritative. A cancellation or refund status alone does not make Accounting guess a financial outcome.

## Travel Packages

Package reporting is projected margin:

```text
projected package margin =
  sold amount
  - discounts
  - customer refunds
  + expected commission
  - booked cost
  + supplier refunds
```

Expected commission is projected income, not a cost or settled cash. The summary uses reservation creation date as its current reporting date basis.

`lib/packageFinancialSummary.ts` owns this versioned formula for Package UI, invoice recalculation, and Accounting. Shared group transport uses the canonical reservation calculation in `lib/packageReservationFinancials.ts`. The physical main reservation is counted once; invoice-reference allocation rows are excluded as separate profit lines. Their discounts, refunds, and expected commission are folded into the main calculation where required.

## POS

POS reports branch cash in and cash out by business date. It is a reconciliation source only. Linking a POS transaction to Ticketing, Packages, Applications, or LMS makes the relationship traceable but does not transfer ownership or add a second profit entry.

## Company-wide LMS

LMS currently provides a live company-wide outstanding balance and account counts. It is not assigned to a branch and does not overwrite the selected month's manual company closing value. Suppliers and banks remain company-wide manual positions until suitable authoritative source data exists.

## Finalised months and corrections

Finalising a branch sheet stores a versioned source summary and bounded source links in the existing Accounting snapshot. Later operational changes do not silently rewrite that finalised month.

If a correction belongs after a month has been finalised, record or surface it in the appropriate later open period rather than mutating the old snapshot. The current workflow remains lightweight: no approval chain or compulsory formal close is introduced.

## Scope boundaries

- Operational writes stay in the owning module.
- Accounting consumes read-only summaries and source links.
- Applications are not included in branch totals until branch, date, ownership, and money fields are authoritative.
- Company-wide data must not be presented as branch data.
- Projected margin must not be presented as settled cash.
