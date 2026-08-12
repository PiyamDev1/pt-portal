# Travel Packages Guide

This guide is the current operational and technical reference for the native PT-Portal package module. It supersedes the earlier quotation/reservation workflow plans under `docs/plans/future/`.

## Lifecycle

1. An authenticated agent creates an Umrah, Ziyarat, or holiday quotation under `/dashboard/packages/quotations/`.
2. The quote stores customer/passenger details and selectable stays, hotel add-ons, flights and linked legs, visas, transport, payment choices, offers, and itinerary order.
3. The agent can keep it as a draft, enable a time-limited public share at `/packages/[token]`, or use internal Sales Mode to make the selection.
4. A customer can save a selection or accept terms and finalise it. Public share reads and writes are token/IP rate-limited; disabled, archived, missing, and expired shares are rejected.
5. The agent converts one finalised selection into one operational package folder. Conversion snapshots the quote and creates initial reservation/payment records so later quote edits do not silently change the sale.
6. Staff manage passengers, responsibilities, reservations and line items, supplier costs, invoices, payments/installments/refunds, documents, transport vouchers, tasks, deadlines, risks, communications, and audit events in `/dashboard/packages/[id]`.
7. Workflow synchronization derives payment state, next action, overdue work, and risks. Status changes follow the transition rules in `lib/packageWorkflow.ts`; cancellation requires a reason.
8. After travel, staff reconcile costs/refunds/commission, mark the customer returned, and close the package when it is complete and earned.

Quotes and operational folders are different records: `travel_package_quotes` is the offer/selection surface; `travel_packages` is the post-sale operational source of truth.

## Customer pricing contract

Customer-visible pricing must show package/passenger totals, discounts, deposit/payment effects, and the final total. It must not expose internal component cost, supplier cost, commission, margin, or individual visa cost.

When visa prices differ by passenger, use `visaPassengerCategory` (`adult`, `child_5_plus`, `child_2_to_4`, `infant`, or `all`). `getPackagePassengerPriceBreakdown()` allocates the higher visa to the affected passenger line while preserving the exact package total. Do not average the difference across unrelated passengers and do not add a customer-facing “visa cost” row.

The same rule applies to:

- the public quote in `PackageShareClient.tsx`;
- internal customer-facing Sales Mode in `PackageSalesModeClient.tsx`; and
- WhatsApp/copy output produced by `lib/packageQuote.ts`.

For linked flight choices, keep the main flight and its journey legs together. The customer presets are derived from actual combined prices: Cheapest selects the lowest complete arrangement, Preferred keeps the configured defaults, and Luxury selects the highest-priced arrangement with deterministic tie-breaking.

## Operations and finance

Reservations cover flight, hotel, visa, transport, and other services. Reservation items retain booked cost, sold price, discount, commission, supplier references, dates, and status. Customer visibility is off by default.

Invoices are derived from non-cancelled reservations/items and can be adjusted through explicit customer-visible or internal lines. Releasing an invoice stores a customer snapshot; later amendments create a new version rather than changing what was already released invisibly.

Payments support deposits, payments, previous-package account credits, refunds, chargebacks, and commission. Account credit requires the previous package/refund reference. Refund records are positive movements so the original sale and booked-cost history remain auditable. Package payment and invoice totals are recalculated after financial mutations.

Installment schedules and payment links belong to the package payment plan. Workflow sync marks overdue installments and raises follow-up risks. Staff should reconcile payments, refunds, supplier refunds, and commission before closing a returned package.

## Documents and customer portals

Staff upload package files to private MinIO storage. A configured `R3_*` provider receives a backup copy; a backup failure is recorded but does not substitute for the primary object. Uploads are limited to 1.5 MB and PDF/JPEG/PNG/WebP, with body-size, filename, extension, MIME, and signature validation. The upload route is limited to 20 attempts per user/IP per hour.

Categories are Flights, Hotels, Transport, Visa, E-Sim, Insurance, Invoice, Travel Documents, and Other. `travel_documents` is agent-only and can never be released through the customer portal.

Customer access has two separate models:

- Package portal: the customer enters package reference and surname at `/package-portal`; access must be enabled and unexpired. The resulting private token shows only released/customer-visible documents, the latest released invoice, and released transport voucher. Object URLs expire after 15 minutes.
- Third-party document share: an agent creates a separate expiring link and six-character access code for an allowed category subset. The recipient must identify themselves and accept the data-handling terms. Tokens/codes are stored as hashes and access events are recorded. Links can be revoked.

Do not use public object-store URLs or expose object keys as authorization. Releasing, revoking, amending, and deleting documents/vouchers must continue to update the database visibility state and audit trail.

## Groups and responsibilities

Package groups link families without merging their quotes/folders. Shared transport, guide, Ziyarat, or other services can be allocated per passenger, equally, manually, to one package, or as a no-split note. Customer group visibility is explicitly `private`, `linked_notice_only`, or `shared_group_view`; individual members and services also have customer visibility flags.

Operational ownership is stored separately for sales, booking, modification, and service responsibilities. Assignment choices should use the appropriate department-scoped employee list rather than treating all staff as interchangeable.

## Access and safety boundaries

- Internal quote/folder routes require an authenticated Supabase session and remain subject to database RLS; document uploads additionally use the canonical active-staff guard.
- Public quote, package portal, customer document, and third-party share routes use scoped tokens/reference checks plus shared database rate limits.
- Super Admin authorization is required for backup reconciliation and legacy migration controls.
- Every customer-visible release is explicit; internal notes/costs stay internal.
- Use app dialogs for decisions and Sonner toasts for notifications, not native browser alert/confirm/prompt windows.

## Package migrations

Apply the package migrations in filename order:

1. `20260708_create_travel_package_quotes.sql`
2. `20260711_create_travel_package_folders.sql`
3. `20260711_create_travel_package_reservations.sql`
4. `20260712_create_travel_package_documents.sql`
5. `20260712_create_travel_package_invoices.sql`
6. `20260712_finalize_travel_package_workflow.sql`
7. `20260721_create_travel_package_groups.sql`
8. `20260731_add_travel_documents_package_category.sql`
9. `20260731_add_travel_package_sales_employee.sql`
10. `20260803_create_travel_package_third_party_document_shares.sql`
11. `20260807_add_package_responsibility_agents.sql`
12. `20260810_add_travel_package_reservation_refunds.sql`
13. `20260811_add_travel_package_discount_types.sql`

For the saved Umrah transport supplier/rate matrix used by the quotation editor, also apply `20260714_create_umrah_transport_pricing.sql` between the July 12 and July 21 package migrations. The core quote editor can still use manually entered transport options when that separate pricing capability is absent.

The shared security migration is also required for public/staff rate-limited routes. Configure `MINIO_PACKAGES_BUCKET_NAME`, optional `R3_*`, and legacy Firebase values from `.env.example` only when those capabilities are used.

After schema deployment, run `npm run types:supabase`. The focused unit coverage lives in `tests/unit/package*.test.ts`, `tests/unit/travelPackage*.test.ts`, and the package smoke flow in `tests/smoke/package-flow.spec.ts`.

## Main source locations

- Dashboard/editor: `app/dashboard/packages/`
- Public quote: `app/packages/[token]/`
- Customer package portal: `app/package-portal/` and `app/package-documents/[token]/`
- Third-party portal: `app/package-third-party-documents/[token]/`
- APIs: `app/api/packages/`, `app/api/travel-packages/`, and `app/api/travel-package-groups/`
- Domain contracts: `app/types/packages.ts`
- Pricing and customer copy: `lib/packageQuote.ts`
- Lifecycle: `lib/packageWorkflow.ts`
- Documents/shares: `lib/packageDocuments.ts`, `lib/packagePortal.ts`, `lib/packageThirdPartyShares.ts`
- Finance: `lib/packageInvoices.ts`, `lib/packageInvoiceServer.ts`, `lib/packagePaymentsServer.ts`, `lib/packagePaymentPlans.ts`
