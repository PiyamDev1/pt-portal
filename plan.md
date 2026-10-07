# PT Portal Interlinking and Simplification Plan

Status: active implementation

Checkboxes in the delivery sequence reflect the current repository state. Partially completed items
use nested checkboxes so finished foundations are not confused with the remaining work.

Scope: whole PT Portal repository, including dashboard modules, API routes, shared libraries, migrations, integrations, and customer-portal boundaries.

This plan is based on a static audit of the current repository. It proposes architecture and implementation work; it does not authorise cross-module writes, a new event bus, or a replacement accounting system.

## Progress update — 7 October 2026

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
- Packages now shares its Action centre predicates with the dashboard, combining urgent active folders, selected standalone quotations, and expired standalone links while leaving grouped quotations in their group workflow.
- Admin now surfaces role-scoped staff approvals and unresolved issue reports as separate Settings links; Maintenance Admin proposals remain self-scoped, and issue-report visibility matches the Master/Super Admin UI.
- Booking slot/person/contact rules and audit/email persistence are now shared by staff routes, availability, the booking UI, and customer appointments; caller-specific access and grants remain at their boundaries.
- Booking creation, rescheduling, and cancellation now use one lifecycle orchestrator across staff and customer callers; failed capacity moves restore the previous reservation window, and failed creations remove their provisional booking.
- The desktop Attention Centre now sits directly below the Notice Board in the dashboard rail, while mobile keeps its compact launcher flow and notice popup.
- Settings navigation is now grouped by Security, People & HR, Operations, Pricing, and Maintenance through one role-aware component instead of repeated tab buttons.
- Booking Settings and Branch Management now share one branch-schedule model and the same weekly-hours and special-date editors instead of maintaining duplicate API calls, state, and controls.
- Booking reminder timing, message preview, attendance responses, and no-show policy now live in a dedicated panel that reuses the canonical reminder contract shared with the API and reminder processor.
- Booking service collection and item routes now share one validation and schema-fallback contract for customer-portal controls, email templates, and compatibility handling.
- Booking service and customer-portal configuration now live in a dedicated settings panel with a reusable state model, keeping branch summaries synchronized while preventing stale branch responses.
- Booking service creation and editing now use one shared field contract for slot rules, customer-portal controls, and email templates instead of maintaining two copies of the same form.
- Umrah transport pricing now separates configuration and the supplier comparison matrix into tested panels backed by one shared draft/key model and one Supabase data owner.
- Package quotations now separate quote details, discount/offer presentation, generated-option and recent-quote sidebar, hotel/stay editing, flight/visa/transport panels, option editing, quote browsing/filtering, and linked-package-group presentation from the API-owning quotation client; transformations, calculations, fetches, snapshots, and mutations remain with their existing data owner.
- NADRA, passport, and passport-draft document workspaces now use one canonical application DocumentHub import, the shared server Supabase client, and PageHeader back navigation instead of rebuilding those primitives per page.
- The Applications hub, service pages, and document workspaces now load their authenticated client and PageHeader identity through one shared dashboard page context instead of repeating session, employee, role, and location setup.
- The Timeclock landing, history, team, and manual-entry pages now share the same verified user and PageHeader context while keeping their existing manager and maintenance access checks.
- Training, Frappe Transfer, LMS, and Pricing now share the verified dashboard page context; LMS also consistently redirects signed-out requests before rendering.
- All Package dashboard, group, folder, quotation, sales, and migration routes now share the verified dashboard context instead of maintaining a second Package-only header loader.
- The dashboard hub, Bookings, POS, and Settings now use that same verified context; the final page-local session, employee, role, and location loaders are removed while module-specific capability queries remain with their owners.
- Dashboard, POS, and API staff-session checks now share one current-employee department-membership adapter; each caller still supplies its correctly scoped client and decides whether lookup failure hides optional features or fails access closed.
- NADRA, Pakistani Passport, and Visa status mutations now use typed route handlers, bounded Zod request parsing, verified staff identity, and the shared server-only Supabase client instead of ad hoc JavaScript clients.
- The financial inclusion, exclusion, date-basis, correction, and snapshot rules are documented in `docs/guides/ACCOUNTING_REPORTING_RULES.md`.
- The two active database migration histories now have documented ownership, independent ordering, a registered exact-copy manifest, and a CI inventory check; existing replay tests remain feature-scoped.
- POS now renders expanded transaction context through a focused detail panel; the workspace still owns selection, permissions, and refund/correction/receipt actions.
- Bookings now renders the daily queue, next appointment, desk actions, and waitlist summary in a focused sidebar while keeping calculations and scheduling callbacks in the workspace.
- Packages now renders its workspace header, summary tiles, and quick links through a focused component; role checks and all summary counts remain with the dashboard owner.
- Booking filters and workspace tools now have a controlled presentation component; the client retains filter state, saved-view, refresh, and CSV-export behavior.
- Booking mobile and desktop previous/today/next controls now share one responsive component and canonical view type; date calculations stay in the workspace.
- POS ledger advanced filters now render through a controlled panel with live catalogue/supplier/till/agent options; filter state, reset behavior, and transaction filtering stay in the POS workspace.
- POS ledger period/date controls, search, sort, and filter-toggle chrome now share a controlled toolbar; date normalization, filter state, and search behavior stay in the POS workspace.

No cross-module writes, event bus, copied reporting table, or new close/approval workflow was introduced. A database migration was deliberately avoided because the existing Accounting snapshot can safely carry this versioned metadata; the repository now documents its two separate migration histories and guards their inventory in CI.

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
- [x] one receipt generate/list/view/history contract, including Visa, with idempotent generation by service event.

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

The repository intentionally retains two active migration histories: `scripts/migrations/` is the established feature/direct-deployment stream, and `supabase/migrations/` is the separate 14-digit Supabase CLI stream used by selected deployment and PostgreSQL test workflows. Do not merge, move, or rename applied files; Supabase tracks migration version IDs remotely. There is no single global order across the streams.

CI runs `npm run migrations:check` when either tree changes. It validates each stream's filename convention, uniqueness of Supabase CLI version IDs, and a manifest of exact SQL copies shared across the trees. Existing PostgreSQL replay/rollback coverage remains feature-scoped; this inventory check does not claim that every migration has a disposable-database replay test.

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
- [x] Decide migration-source policy: retain the two separate deployed histories, document their ownership and ordering, and validate naming, Supabase version IDs, and registered exact mirrors in CI; keep database replay tests feature-scoped.

### Phase 1: low-risk read-only links

- [x] Implement reporting adapters for Ticketing, Packages, and POS.
- [x] Add source references and deep links to Accounting reports.
- [x] Add the searchable linked-service selector to POS.
- [x] Add double-counting warnings and date-basis labels.
- [x] Update current architecture documentation.

### Phase 2: duplicate workflow reduction

- [x] Complete the shared booking service.
  - [x] Share slot policy, capacity RPCs, idempotency, notification state, and audit persistence.
  - [x] Reuse person/contact normalization across staff and customer appointment callers.
  - [x] Consolidate creation, rescheduling, and cancellation orchestration behind caller-specific access boundaries.
- [x] Add the Applications summary endpoint and shared view model.
- [x] Create the Package financial summary for Package UI, Accounting, invoice/customer totals, and the Commission readiness surface while retaining the database readiness result as authority.
- [ ] Add live Company Ledger summaries for company-wide positions.
  - [x] Add company-wide LMS outstanding, overdue, and due-soon totals.
  - [x] Aggregate live POS supplier balances across all branches.
  - [ ] Add named bank balances once a trustworthy bank-account source exists.
  - [x] Audit current portal sources and document that bank balances remain manual; do not infer them from POS cash or supplier data.
- [x] Introduce dashboard work queue providers for Bookings, Ticketing, LMS, Applications, Packages, POS, Frappe HRMS, Training, and Admin, including source links and unavailable-provider handling.
- [x] Keep Admin approvals and issue reports as separate role-scoped queues that return to their existing Settings tabs.

### Phase 3: maintainability and consistency

- [ ] Split the largest Package, Booking, POS, Settings, and Commission clients.
  - [x] Share the tested Booking Settings email-template editor across create/edit flows.
  - [x] Isolate the tested Commission reconciliation overview and advanced-tool guidance.
  - [x] Share tested POS financial-summary and role-aware navigation chrome.
  - [x] Extract the role-aware Settings navigation from the content client.
  - [x] Share branch schedule loading, mutations, and editors across Booking Settings and Branch Management.
  - [x] Isolate Booking reminder, attendance, and no-show settings behind the shared reminder contract.
  - [x] Centralise Booking service validation and schema compatibility across collection and item routes.
  - [x] Extract Booking service and customer-portal configuration into a dedicated settings panel and state model.
  - [x] Reuse one Booking service form contract for both create and edit workflows.
  - [x] Extract Umrah transport configuration from the supplier rate matrix without duplicating persistence.
  - [x] Extract the Umrah route-rate comparison panel and reuse one draft/key model across pricing views and persistence.
  - [x] Extract the Package quotation option and linked-flight editors without moving quote persistence out of the parent.
  - [x] Extract the Package quote browser, filters, status/expiry display, and action delegation behind one tested model.
  - [x] Extract the linked-package-group workspace, local disclosure/filtering, and action delegation while retaining all group API mutations in the quotation client.
  - [x] Extract the Package quote-details editor and shared package-type labels while retaining draft transformation, expiry, and persistence ownership in the quotation client.
  - [x] Extract the Package discounts and offers editor while keeping all offer updates in the quotation client's quote draft.
  - [x] Extract generated option and recent quote sidebar presentation while retaining quote and price combination ownership in the quotation client.
  - [x] Extract hotel and stay option presentation while keeping itinerary ordering and quote draft updates in the quotation client.
  - [x] Extract flight, visa, and transport option panels while keeping quote option creation, pricing, and draft updates in the quotation client.
  - [x] Extract quotation actions and customer-link status presentation while keeping save, duplicate, and sharing mutations in the quotation client.
  - [x] Extract the Package Operations task panel while keeping task API mutations in the operations workspace.
  - [x] Extract the Package Operations deadline panel while keeping deadline API mutations in the operations workspace.
  - [x] Extract the Package Operations communication log while keeping communication API mutations in the operations workspace.
  - [x] Extract the Package Operations passenger header and add-passenger form while keeping passenger persistence in the workspace.
  - [x] Extract the editable Package Operations passenger table while keeping passenger loading and mutations in the workspace.
  - [x] Extract the Package Operations payment history table while keeping payment state and mutations in the workspace.
  - [x] Extract the Package Operations payment-entry form while keeping family validation and payment persistence in the workspace.
  - [x] Extract installment-plan display and creation fields while keeping schedule persistence and LMS linking in the workspace.
  - [x] Extract the Package payment family selector and financial summary while keeping totals and filtering calculations in the workspace.
  - [x] Extract reservation discount source-of-truth guidance while keeping reservation financials authoritative and navigation delegated to the workspace.
  - [x] Extract the open-risk action list while keeping risk resolution persistence in the operations workspace.
  - [x] Extract package branch and employee responsibility controls while keeping assignment updates in the operations workspace.
  - [x] Extract package status, customer, and travel detail presentation while keeping status guards and package updates in the operations workspace.
  - [x] Extract Commission readiness presentation while keeping readiness loading, safe reconciliation, and package mutations in the operations workspace.
  - [x] Extract final-quote context and route assignments from Transport Voucher while keeping voucher reset and itinerary rebuild handlers in the operations workspace.
  - [x] Extract Transport Voucher version history and customer visibility actions while keeping edit, preview, and release mutations in the operations workspace.
  - [x] Extract Transport Voucher itinerary editing and reorder controls while keeping itinerary and route-assignment updates in the operations workspace.
  - [x] Extract the Transport Voucher service-details form while keeping field updates, vehicle-capacity rules, provider aliases, and persistence in the operations workspace.
  - [x] Extract Transport Voucher save/release controls and preview presentation while keeping voucher and print-view actions in the operations workspace.
  - [x] Extract the Package Operations audit-history timeline while keeping audit loading and event ownership in the workspace.
  - [x] Reuse a shared family-option type across passenger and payment panels.
  - [x] Extract the expanded POS transaction details presentation while keeping selection, permissions, and actions in the workspace.
  - [x] Extract Booking's daily queue and action sidebar while keeping counts, scheduling rules, and mutations in the workspace.
  - [x] Extract Booking workspace filters and tool buttons while keeping filter state and actions in the workspace.
  - [x] Share Booking period navigation controls across mobile and desktop without moving date calculations out of the workspace.
  - [x] Extract POS ledger advanced filters while retaining filter state, reset behavior, and transaction filtering in the POS workspace.
  - [x] Extract POS ledger period/date, search, sort, and filter-toggle controls while retaining all state and calculations in the POS workspace.
  - [x] Extract the Packages dashboard header and summary tiles while keeping role checks and count calculations in the dashboard client.
  - [x] Extract Commission profile-rate and compensation-context presentation while keeping profile selection, edits, and persistence in the workspace.
  - [x] Extract Package Sales Mode price and payment-breakdown presentation while keeping quote pricing, totals, selection state, and finalisation in the parent workspace.
  - [x] Extract Booking appointment detail fields while retaining scheduling rules, validation, autosave, and persistence in the workspace.
  - [x] Extract POS quick-transaction impact and posting presentation while keeping amount, loyalty, destination, availability, and submit decisions in the workspace.
  - [ ] Separate the remaining Package, Booking, POS, Settings pricing/booking, and Commission workspace panels.
- [x] Consolidate document and receipt UI primitives.
  - [x] Reuse the shared receipt viewer and receipt-history modal across supported application services.
  - [x] Route NADRA, passport, and passport-draft workspaces through one application DocumentHub entry point and PageHeader return control.
  - [x] Consolidate the remaining Package document presentation and add the missing cross-service receipt contract, including Visa.
    - [x] Extract category-based package document uploads while keeping upload requests and document state in PackageOverviewClient.
    - [x] Extract the grouped package document library and linked visa-photo display while keeping document mutations in PackageOverviewClient.
    - [x] Extract third-party package document access form and recent-share presentation while keeping form state and create/revoke actions in PackageOverviewClient.
    - [x] Add Visa generation, viewing, and history to the shared receipt contract and make retries reuse the stable service-event receipt.
- [x] Reorganise Settings navigation by Security, People & HR, Operations, Pricing, and Maintenance without changing role access.
- [x] Centralise shared page context and reusable capability loading.
  - [x] Reuse the shared authenticated server Supabase client across application document pages.
  - [x] Centralise authenticated session, employee, role, and location context across all Applications server pages.
  - [x] Centralise verified user and PageHeader context across all Timeclock server pages.
  - [x] Centralise verified user and PageHeader context across Training, Frappe Transfer, LMS, and Pricing.
  - [x] Remove duplicated Package auth/header setup across dashboard, group, folder, quotation, sales, and migration routes.
  - [x] Replace the remaining dashboard page-local session, employee, branch, and role loaders; keep specialised capability queries module-owned until a shared contract is justified.
  - [x] Consolidate current-employee department-name loading without moving module-specific authorisation into generic page context.
- [ ] Modernise legacy API handlers incrementally.
  - [x] Convert the dedicated NADRA, Pakistani Passport, and Visa status mutation routes to typed handlers with shared request and service-client boundaries.
  - [x] Split and modernise GB Passport updates and status-history readers.
    - [x] Separate applicant/PEX edits from status transitions; preserve saved pricing snapshots and use the authenticated staff identity for status history.
    - [x] Convert the GB and Pakistani Passport status-history readers to typed handlers with the shared service-client boundary; preserve each screen's response shape and legacy Pakistani ID fallback.
  - [ ] Continue with receipt/payment routes and remaining Admin/maintenance handlers in reviewed slices.
    - [x] Bound and validate public receipt-verification credentials before rate limiting or lookup, preserving the existing response contract.
    - [x] Convert the LMS payment-method reader to a typed route and shared service-client boundary while preserving its staff guard and empty-list fallback.
    - [x] Convert visa country and preset seed handlers to typed routes and the shared service-client boundary while preserving existing role guards, rate limits, and response contracts.
    - [x] Convert the employee status handler to a typed route while preserving manager-scope checks and fresh second-factor verification for disabling accounts.
- [x] Keep domain migration replay/rollback checks and documentation integrity checks in CI. PostgreSQL 16 jobs rebuild and verify LMS, Security, Ticketing, POS, Commission, and customer-portal migrations; the quality workflow validates Markdown links/anchors and API contracts, including CRLF Markdown headings.

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
