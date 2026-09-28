# PT Portal Interlinking and Simplification Plan

Status: active implementation

Scope: whole PT Portal repository, including dashboard modules, API routes, shared libraries, migrations, integrations, and customer-portal boundaries.

This plan is based on a static audit of the current repository. It proposes architecture and implementation work; it does not authorise cross-module writes, a new event bus, or a replacement accounting system.

## Progress update — 28 September 2026

The first safe financial-reporting slice is implemented in the application layer without a database migration:

- Branch Accounting now separates standalone Ticketing margin, projected Package margin, and POS cash movement.
- Package-owned Ticketing bookings are excluded from the Ticketing margin, preventing the same package result from being counted twice.
- POS cash movement is displayed for reconciliation but is not added to branch profit.
- Every source summary displays its metric type, date basis, included/excluded record counts, calculation note, and source-record links.
- Finalised branch sheets retain the reporting summary and source metadata in their existing JSON snapshot; older snapshots remain readable.
- Ticketing and POS pages accept source-search deep links.
- POS staff search for and select Ticketing, Package, Application, or LMS records instead of typing internal database IDs.
- Company Ledger shows the current company-wide LMS outstanding balance and active/overdue/due-soon account counts without copying them into a branch or monthly close.
- Company Ledger now also aggregates live POS supplier balances across every branch while keeping monthly supplier controls separate; named bank balances remain manual because no trustworthy bank-account source exists yet.
- Focused tests cover the double-counting rule, Accounting presentation, persisted source metadata, and POS source selection.
- Confirmed Ticketing refunds now replace the original margin through a confirmation-month adjustment; provisional, voided, package-owned, and unresolved refund results remain excluded.
- Package projected margin now treats expected commission as income and reuses the canonical shared-transport calculation so invoice-reference rows are not counted twice.
- A versioned Package financial summary now supplies reservation UI totals, invoice recalculation, and Accounting with one formula for sale, cost, discounts, refunds, expected/received commission, payments, balance, projected margin, and date basis.
- Accounting refund links open the Refund Register with the relevant PNR filter already applied.
- The dashboard now has a permission-aware, read-only Attention Centre for branch Bookings, Ticketing deadlines/schedule changes, and company-wide LMS overdue/due-soon totals, with deep links back to each owning module and explicit unavailable-source warnings.
- Applications now has one RLS-aware summary model and endpoint for service counts, recent work, status follow-up, supported document markers, and creation-date aging; the same model feeds its hub and dashboard Attention Centre item.
- POS now exposes a branch-scoped, current-month reconciliation summary to the dashboard using the same latest-event rule as its ledger and reports; cash and supplier-direct remittances stay outside that queue, and its deep link opens the filtered monthly ledger.
- Settings-authorised staff now receive one Frappe HRMS integration-health item for durable database failures and conflicts; it links to the existing Maintenance panel without pinging Frappe or triggering sync work from the dashboard.
- Each employee now receives one de-duplicated Training item for incomplete, overdue, due-soon, expired, or expiring enrolments/certificates, using only their active-course records and linking back to Training.
- The financial inclusion, exclusion, date-basis, correction, and snapshot rules are documented in `docs/guides/ACCOUNTING_REPORTING_RULES.md`.

No cross-module writes, event bus, copied reporting table, or new close/approval workflow was introduced. A database migration was deliberately avoided because the existing Accounting snapshot can safely carry this versioned metadata while the repository's canonical migration directory remains undecided.

## Desired outcome

Reduce duplicate data entry, duplicated business rules, duplicated reports, and repeated navigation while preserving the independence of each operational module.

Each module should continue to own its operational records. Other modules should consume small, read-only summaries and explicit source references, then link back to the owning record.

## Design principles

1. **Operational ownership stays local.** Applications, Bookings, Packages, Ticketing, POS, LMS, Loyalty, Timeclock, and Training own their own writes.
2. **Reporting is read-only by default.** Use query adapters, views, or reporting functions rather than copied operational records.
3. **Every cross-module number needs a source and a meaning.** Reports must identify the source record, date basis, scope, and whether a value is margin, cash movement, or activity.
4. **Links are preferable to handoffs.** A user should be able to open the owning module rather than re-entering the same data in another module.
5. **Keep Accounting lightweight.** Manual adjustments should remain possible, but the system should not introduce approval chains or compulsory formal closes for a sole accountant.
6. **Keep the customer portal independent.** Use customer-safe integration APIs, grants, OTP, and scoped access; do not expose staff data or internal tables directly.
7. **Do not build a universal customer timeline by default.** A reusable lookup and explicit related-record links are sufficient for the current need.

## Target architecture

```text
Operational modules own writes
  Applications    Bookings    Packages    Ticketing    POS    LMS
          \          |           |           |          |      /
           \         |           |           |          |     /
            +--> read-only reporting facts and source links
                              |
              +---------------+----------------+
              |               |                |
          Accounting     Commission       Performance
              |
        Dashboard work queue

Customer Portal --> safe integration APIs, grants, and deep links
```

The first implementation should be a typed reporting contract and source-link layer. It should not be a second operational database.

## Priority summary

| Priority | Workstream                                       | Main benefit                                      |
| -------- | ------------------------------------------------ | ------------------------------------------------- |
| P0       | Shared reporting fact contract                   | Prevents conflicting totals and double counting   |
| P0       | Universal linked-service selector                | Removes manual IDs and repeated searches          |
| P0       | Accounting metric/date rules                     | Makes live ledger results understandable and safe |
| P0       | Migration and architecture documentation cleanup | Prevents schema and implementation drift          |
| P1       | Shared booking/application/package services      | Removes duplicated business rules                 |
| P1       | Dashboard work queue                             | Reduces repeated visits to separate modules       |
| P1       | Company-wide live summaries                      | Removes repeated LMS/supplier/bank entry          |
| P1       | Split oversized client components                | Reduces maintenance and regression risk           |
| P2       | Settings, auth, and legacy route consolidation   | Improves consistency after core reporting work    |

## Workstream 1: shared read-only reporting facts

### Problem

`lib/accounting/ledgerSources.ts`, the Ticketing accounting report, POS reports, Commission source events, and Performance source facts each calculate overlapping information with different field names, dates, and inclusion rules.

Ticketing, Packages, and POS can also describe different parts of the same commercial event. A package sale, its ticket reservation, and a POS payment must not be added together as three independent profits.

### Plan

Define a shared server-side reporting contract. The first version may be implemented with adapters and read-only queries; do not create copied records unless separately approved.

Suggested fields:

- `sourceModule`
- `sourceRecordId`
- `sourcePath`
- `sourceReference`
- `companyId` or company scope
- `branchId` where explicitly available
- `reportingDate`
- `dateBasis`
- `serviceType`
- `staffId` or operational owner
- `saleAmount`
- `supplierCost`
- `refundAmount`
- `commissionAmount` or expected commission where applicable
- `cashIn` and `cashOut`
- `paymentStatus`
- `operationalStatus`
- `isReversed` or inclusion state

Separate reporting lenses:

- **Commercial margin:** sale, supplier cost, refund, commission, projected result.
- **Cash movement:** actual payments, refunds, tender, cash/ledger movement.
- **Operational activity:** completed applications, tickets, bookings, package actions, or staff activity.

### Acceptance criteria

- Accounting, Performance, and Commission reports identify the source record.
- Each report displays its date basis and metric type.
- Ticketing, Package, and POS summaries have explicit inclusion/exclusion rules.
- The Branch Ledger cannot silently add a package margin, ticket margin, and POS payment as one profit figure.
- Finalised Accounting snapshots retain the source reference and aggregation version, not only a monthly total.

## Workstream 2: universal source linking

### Existing foundation

POS already supports typed source links for LMS, Ticketing, Applications, Packages, POS, and legacy records. Ticketing and Packages already have package-PNR reconciliation support. Loyalty also records source types for ticket, service, and package activity.

### Plan

Build one linked-service selector that searches by:

- application tracking number
- ticket PNR or booking reference
- package reference
- appointment reference
- LMS account/customer
- customer name or contact, subject to access rules

Use the selector in POS first, then reuse it in Accounting, Package operations, Ticketing, and Commission review.

Every result should provide:

- typed source link
- human-readable reference
- source status
- relevant amount or balance
- `Open in module` deep link

Add bidirectional links where a relationship already exists:

- Package ↔ Ticketing
- POS → Application, Package, Ticketing, LMS
- Accounting → source records
- Commission/Performance → source records

Do not copy the source record into the receiving module.

## Workstream 3: Accounting and finance model

### Branch Ledger

The live Branch Ledger currently reads Ticketing, Packages, and POS. Improve it by:

- displaying source module, source count, date basis, and metric type;
- showing drill-through to source records;
- separating operational summaries from manual accounting adjustments;
- retaining source references when a month is finalised;
- documenting how refunds, cancellations, reversals, corrections, and expected commission are included.

Applications should not be added to branch totals until branch, date, ownership, and money fields are explicit. Do not infer a branch from the employee who handled the application.

### Company Ledger

Keep LMS, suppliers, and banks company-wide. Add read-only live summaries where their source data supports it, while keeping manual adjustments as separate lines.

The Company Ledger should provide:

- all-branch comparison;
- branch net result and cash position where the source supports that scope;
- company-wide LMS outstanding and overdue totals;
- company-wide supplier and bank positions;
- drill-down into the detailed Branch Ledger.

### Acceptance criteria

- A sole accountant can understand every displayed total without opening source code.
- Company-wide values are not presented as branch values.
- Projected margin is not presented as settled cash.
- The system does not require a formal approval chain or compulsory close workflow.

## Workstream 4: shared workflows

### Bookings

`app/api/bookings/route.ts` and `lib/customerPortal/appointments.ts` both implement booking policy and orchestration.

Extract a shared booking service for:

- slot validation
- capacity reservation and release
- creation
- rescheduling
- cancellation
- audit events
- notification payloads

Keep staff permissions, customer grants, guest-code logic, and idempotency at the caller boundary.

### Applications

The NADRA, Pakistani Passport, GB Passport, and Visa areas repeat status, history, notes, edit, document, receipt, and ledger patterns.

Create:

- [x] one read-only application summary endpoint for counts, recent records, attention items, and aging;
- shared UI primitives for applicant identity, status history, notes, documents, receipts, and amount display;
- [x] service adapters that map each service's own statuses and tables to the shared summary view model;
- one receipt contract, including Visa, with idempotent generation.

The shared summary now powers the Applications Hub and its dashboard Attention Centre provider.
It keeps source records under existing RLS, reports partial-source failures without treating them as
an all-clear result, and distinguishes status follow-up, supported Pakistani Passport document
markers, and creation-date aging without double-counting one application.

Do not merge the underlying service schemas.

### Packages

Create one package financial summary used by Package UI, Accounting, Commission readiness, and customer invoice views:

- sold amount
- booked cost
- discounts
- refunds
- expected and received commission
- paid amount
- balance
- projected margin
- date basis

Split the large Package clients into quotation, customer/share, reservation, payment/invoice, document, operations, and reporting slices while keeping the server use cases typed and shared.

## Workstream 5: dashboard work queue

Add a read-only attention centre to the dashboard. Each item must show its source module, severity, date, reference, and action link.

Initial queue providers:

- Applications: missing documents, aging, status follow-up.
- Bookings: unconfirmed, no-show, capacity, or schedule exceptions.
- Ticketing: time limits, schedule changes, refund/replacement cases.
- Packages: expiring quotations, missing tickets, unpaid balances, missing documents.
- POS: unreconciled transactions or missing source links.
- LMS: overdue instalments and accounts needing attention.
- Frappe: failed or pending outbox/sync items.
- Training: incomplete or expiring training.
- Admin: unresolved issue reports and approval items.

The queue should link to existing workflows. It should not perform cross-module writes automatically.

## Workstream 6: module-specific improvements

| Module              | Improvement                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Applications        | Shared summary/adapters and common document/receipt/status primitives.                                      |
| Bookings            | Shared booking service for staff and customer portal.                                                       |
| Packages and Groups | Financial summary, related sources, and smaller client components.                                          |
| Ticketing           | One commercial-outcome/reporting model for sales, costs, refunds, vouchers, and replacements.               |
| POS                 | Searchable linked-service selector and reporting integration using existing source-link contracts.          |
| LMS                 | Company-wide live summary and overdue work-queue items; retain LMS ownership of account/installment writes. |
| Loyalty             | Reuse source selectors and links; preserve reversal and unlink protections.                                 |
| Commission          | Consume common source facts while keeping commission calculations separate from operational records.        |
| Performance         | Keep attendance, work ownership, and commission recipient as separate concepts.                             |
| Timeclock           | Treat timeclock events as authoritative; share summaries with Performance and HRMS.                         |
| Frappe HRMS         | Reusable integration health, pending, failure, and last-sync component.                                     |
| Training            | Employee compliance and expiry links without financial coupling.                                            |
| Documents           | Shared document reference/viewer UI while keeping application and package authorization scopes separate.    |
| Receipts            | Common receipt contract and idempotent generation across application services.                              |
| Customer Portal     | Preserve the safe integration boundary; share booking rules, not internal staff access.                     |
| Settings/Admin      | Reorganise into Security, People/HR, Operations, Pricing, and Maintenance.                                  |
| Navigation          | Centralise employee/branch/role context and add labels for all dashboard modules.                           |

## Workstream 7: repository consistency

### Migration source of truth

The repository currently tracks both `scripts/migrations/` and `supabase/migrations/`. The current live Accounting migration is under `supabase/migrations`, while repository documentation describes `scripts/migrations/` as the durable source.

Choose one of these approaches:

1. Move to one canonical migration directory; or
2. Explicitly document the split and add CI checks for ordering, replay, and coverage.

Every new reporting or Accounting capability should have:

- migration coverage;
- focused database tests;
- generated type review where applicable;
- a source-of-truth documentation update.

### API consistency

Modern TypeScript/Zod API routes and legacy JavaScript/direct-client routes coexist, especially in Applications and Admin.

Modernise incrementally, starting with:

1. application status routes;
2. receipt and payment routes;
3. shared access/session boundaries;
4. remaining Admin and maintenance routes.

Do not rewrite the whole API surface in one migration.

### Documentation

Update `docs/guides/ARCHITECTURE_GUIDE.md`, API references, database overview, and module documentation to reflect the current persisted Ticketing, POS, Loyalty, and live Accounting functionality.

## Delivery sequence

### Phase 0: contracts and rules

- [x] Agree the reporting fact fields and metric lenses.
- [x] Document branch versus company scope.
- [x] Document inclusion rules for refunds, cancellations, reversals, and expected commission.
- [ ] Decide the canonical migration source.

### Phase 1: low-risk read-only links

- [x] Implement reporting adapters for Ticketing, Packages, and POS.
- [x] Add source references and deep links to Accounting reports.
- [x] Add the searchable linked-service selector to POS.
- [x] Add double-counting warnings and date-basis labels.
- [x] Update current architecture documentation.

### Phase 2: duplicate workflow reduction

- [ ] Extract the shared booking service.
- [x] Add the Applications summary endpoint and shared view model.
- [x] Create the Package financial summary for Package UI, Accounting, invoice/customer totals, and the Commission readiness surface while retaining the database readiness result as authority.
- [ ] Add live Company Ledger summaries for company-wide positions. LMS and supplier summaries are complete; named bank balances remain pending until a trustworthy bank-account source exists.
- [x] Introduce dashboard work queue providers for Bookings, Ticketing, LMS, Applications, POS, Frappe HRMS, and Training, including source links and unavailable-provider handling.
- [ ] Expand the dashboard work queue to Packages and Admin after each module exposes a trustworthy attention summary.

### Phase 3: maintainability and consistency

- [ ] Split the largest Package, Booking, POS, Settings, and Commission clients.
- [ ] Consolidate document and receipt UI primitives.
- [ ] Reorganise Settings by user goal.
- [ ] Centralise page context and capability loading.
- [ ] Modernise legacy API handlers incrementally.
- [ ] Add migration replay and documentation checks to CI.

## Verification requirements

Each phase should be verified separately:

- focused unit tests for reporting adapters and shared services;
- database tests for migration, scope, RLS, and inclusion rules;
- typecheck and lint;
- API boundary and route tests;
- browser visual checks for Accounting, POS, Packages, Bookings, and the work queue;
- explicit test cases proving a package sale, ticket transaction, and POS payment are not double-counted;
- explicit test cases proving company-wide LMS data cannot be treated as branch data.

## Deliberately deferred

Do not build these as part of the first plan phases:

- a cross-module event bus;
- copied operational records in a central ledger;
- automatic creation of LMS, POS, or Accounting records from another module;
- a universal customer master/timeline;
- a full statutory double-entry accounting replacement;
- compulsory approvals or formal month-close chains;
- automatic performance scoring for every type of staff activity.

## Success measures

- Staff can find a related service record without manually copying an internal ID.
- Accounting users can drill from a total to the owning source record.
- Reports explain whether a number is margin, cash, or activity.
- The same booking/status/receipt rules are not implemented separately for staff and customers.
- The dashboard surfaces work needing attention without opening every module.
- Company-wide balances are entered once or read from their owner, not retyped in multiple screens.
- No cross-module write is introduced without an explicit business decision and ownership definition.
