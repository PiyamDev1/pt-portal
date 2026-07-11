# Travel Package Quotation, Reservation, Invoice, and Document Portal Plan

**Status:** Planning Phase  
**Created:** July 11, 2026  
**Target Module:** Packages / Reservations  
**Primary Repo:** `Piyam-Travel-LTD/pt-portal`  
**Legacy Repo To Migrate:** `Piyam-Travel-LTD/piyam-travel-bookings-portal`  
**Existing Package Quote Foundation:** `travel_package_quotes`, `/dashboard/packages`, `/packages/[token]`

---

## 1. Executive Summary

PT-Portal should become the single operational system for holidays, ziyarat, and Umrah packages. The current package quote creator is a good foundation, but it should grow from a quote-only tool into a full quote-to-reservation-to-document-portal workflow. 

The intended flow is:

```text
Quotation created by agent
-> Quote shared with customer or handled in Sales / Clerk Mode
-> Customer or agent finalises selected options
-> Final quotation is converted into a package folder
-> Agent reserves flights, hotels, visa, and transport
-> Internal invoice is built and edited as the booking progresses
-> Customer documents are released when ready
-> Customer travels
-> Package is closed only after the customer returns safely
```

The old `piyam-travel-bookings-portal` app should be migrated into PT-Portal rather than maintained as a separate application. Its useful concepts are:

- agent customer folders
- reference-number based customer access
- document categories
- customer document portal
- checklist
- internal notes
- access voucher
- transport voucher generation
- archive/completed folder status

Those concepts should become part of the new PT-Portal Packages module, backed by Supabase and the new MinIO package bucket.

---

## 2. Core Business Rules

### 2.1 Packages Are Not Earned Until Return

A package should not be treated as fully earned when the customer pays or when reservations are made. It is only clear/earned when:

- the customer has travelled
- the customer has completed the experience
- the customer has safely returned
- any supplier issues, refunds, changes, or hotel commission checks are resolved

Finance reporting should therefore distinguish:

- projected profit
- provisional margin
- booked cost
- sold price
- discounts
- expected hotel commission
- received hotel commission
- pending customer balance
- earned profit after return

### 2.2 Invoice Visibility

Invoices must be internal by default.

The customer must not see the invoice while the agent is still working out supplier costs, reservation costs, discounts, commission, or package changes.

Customer invoice visibility should be controlled by an agent action:

```text
Invoice draft/internal
-> Agent finalises invoice
-> Agent releases invoice to customer
```

Even after release, the invoice must remain amendable because:

- flights may change
- hotels may change
- cancellations may happen
- discounts may be adjusted
- extra services may be added
- supplier costs may change
- hotel commissions may be confirmed later

Every amendment should be tracked in an audit log.

### 2.3 Passport Copies

Passport copies are shared via WhatsApp for now.

PT-Portal should not force passport upload as part of the customer quote selection flow. Instead, the package folder should track passport handling status:

- passport copies requested
- passport copies received via WhatsApp
- checked by agent
- issues found
- corrected copies requested
- ready for booking

If passport files are later uploaded into PT-Portal, they must be stored privately in MinIO and never exposed by a public quote link.

### 2.4 Optional Package Sections

Flight, visa, and transport are optional package sections.

Hotels are the core pricing driver for Umrah/ziyarat package building and should remain the main package option engine.

Required order for quote/customer display:

1. Summary of dates/passengers
2. Flight
3. Visa
4. Transport
5. Hotels
6. Limited Time Offers

### 2.5 Under-5 Pricing Rule

The under-5 exception applies only to hotels.

Pricing counts should be:

```text
Hotel paying count = adults + children 5 to 12
Flight paying count = adults + children 5 to 12 + children under 5
Visa paying count = adults + children 5 to 12 + children under 5
Transport paying count = adults + children 5 to 12 + children under 5
Other non-hotel services = adults + children 5 to 12 + children under 5
```

Flight pricing should default to per-person.

Visa pricing should default to per-person.

Transport pricing should default to total package cost, with an option to switch to per-person where needed.

---

## 3. Current State In PT-Portal

The package quote foundation already exists in PT-Portal.

Current known pieces:

- `scripts/migrations/20260708_create_travel_package_quotes.sql`
- `app/dashboard/packages/page.tsx`
- `app/dashboard/packages/PackagesClient.tsx`
- `app/packages/[token]/page.tsx`
- `app/packages/[token]/PackageShareClient.tsx`
- `app/api/packages/route.ts`
- `app/api/packages/[id]/route.ts`
- `app/api/packages/share/[token]/route.ts`
- `app/api/packages/share/[token]/selection/route.ts`
- `app/types/packages.ts`
- `lib/packageQuote.ts`
- `tests/unit/packageQuote.test.ts`

Current capability:

- agents can create and save package quotes
- agents can enable a share link
- share links expire
- customer can open the public quote link
- customer can select a generated package combination
- selected option is saved on the quote
- current UI combines builder and table on one page

Current limitations:

- package creator is still quote-centric
- no proper package/reservation folder after finalisation
- no visa section in the quote model yet
- no proper Sales / Clerk Mode
- no invoice workspace
- no old bookings portal migration
- no dedicated package document bucket
- customer document portal is still separate in the old app
- no supplier booked-cost versus sold-price accounting
- no hotel commission tracking
- no package lifecycle from quote to returned/closed

---

## 4. Legacy Bookings Portal Summary

Legacy repo: `Piyam-Travel-LTD/piyam-travel-bookings-portal`

Technology:

- React
- Vite
- Tailwind CSS
- Firebase Auth
- Firestore
- Cloudflare R2
- Vercel functions

Primary pages:

- `/agent`: authenticated agent dashboard
- `/`: customer document portal

Legacy data concepts:

- customer folder
- first name
- last name
- lowercased last name for lookup
- package type
- destination
- reference number
- documents array
- itinerary array
- notes array
- checklist array
- key information
- status
- archive flag
- created timestamp
- last updated timestamp
- access expiry

Legacy document categories:

- Flights
- Hotels
- Transport
- Visa
- E-Sim
- Insurance
- Others

Legacy package types:

- Umrah
- Holiday
- Ziyara'at

Useful legacy functionality to preserve:

- create customer folder
- search by customer name or reference number
- show/hide archived folders
- upload documents into categories
- delete documents
- quick-add common documents
- customer document portal
- customer access by reference number and last name
- access expiry
- pre-travel checklist
- internal notes
- key information for agent/contact/ground transport
- transport voucher generation
- access voucher generation

Functionality to replace:

- Firebase Auth should be replaced by existing PT-Portal auth
- Firestore should be replaced by Supabase
- Cloudflare R2 should become backup storage
- MinIO should become primary package storage
- separate public app should become a PT-Portal customer package portal

---

## 5. Product Areas

The new module should have four major product areas:

### 5.1 Quotations

Used to build and share package quotes.

Main tasks:

- create quote
- edit quote
- generate hotel combinations
- add flight options
- add visa options
- add transport options
- add limited-time offers
- preview WhatsApp quote
- save as draft
- share with customer
- copy link
- copy WhatsApp format
- expire/renew quote
- finalise selected option
- convert finalised quote to package folder

### 5.2 Sales / Clerk Mode

Used when the customer is in person, on the phone, or does not like the shared options.

Main tasks:

- agent works live without exposing internal view to customer
- agent selects the customer's preferred package option
- agent edits selected hotel terms
- agent adds a new hotel option on the spot
- agent changes flight/visa/transport choices
- agent applies limited-time offer or discount
- agent finalises option on behalf of customer
- finalised selection becomes reservation-ready

### 5.3 Package / Reservation Folder

The operational workspace after a quote is finalised.

Main tasks:

- preserve final quotation snapshot
- track passengers
- track passport received status
- reserve flights
- reserve hotels
- reserve visa
- reserve transport
- generate transport voucher
- upload supplier confirmations
- manage customer documents
- manage internal checklist
- manage internal notes
- manage invoice
- manage payments/installments later
- release customer documents when ready
- close package after customer returns

### 5.4 Customer Package Portal

Customer-facing portal for package selection and documents.

Main tasks:

- view shared quote
- select package option
- finalise selection
- accept terms and availability notice
- later access travel documents
- view released customer invoice only if agent releases it
- download released documents

Customer must not see:

- booked cost
- supplier cost
- internal margin
- hotel commission
- unreleased invoice
- internal notes
- reservation work-in-progress

---

## 6. Main Page Structure

The main Packages page should feel similar to the old `bookings.piyamtravel.com/agent` dashboard, but fit PT-Portal's design system.

Suggested route:

```text
/dashboard/packages
```

### 6.1 Top-Level Tabs

Recommended tabs:

- Upcoming Packages
- In Progress
- Awaiting Deposit
- Travelling Soon
- Currently Travelling
- Returned
- Archived
- Quotations

Alternative compact tab set:

- Active
- Awaiting Action
- Travelling
- Returned
- Archived
- Quotations

The tab choice can be refined during UI implementation. The key requirement is that `Quotations` is a tab on the Packages main page, not the only page.

### 6.2 Packages Table

Columns:

- reference number
- customer name
- package type
- destination
- departure date
- return date
- passenger count
- status
- deposit/payment state
- reservation progress
- assigned agent
- last updated
- actions

Useful action buttons:

- Open
- Edit
- Customer Portal
- Upload Documents
- Invoice
- Archive

### 6.3 Quotations Tab

Columns:

- quote title
- customer name
- package type
- date range
- passengers
- quote status
- expiry
- selected option
- total / from price
- created by
- updated
- actions

Quotation actions:

- Edit
- Duplicate
- Open Customer Link
- Copy Customer Link
- Copy WhatsApp Quote
- Renew 72h
- Sales / Clerk Mode
- Convert to Package
- Archive

Primary button:

```text
Add New Package Quote
```

This should open the quote builder page.

Suggested routes:

```text
/dashboard/packages
/dashboard/packages/quotations
/dashboard/packages/quotations/new
/dashboard/packages/quotations/[quoteId]/edit
/dashboard/packages/quotations/[quoteId]/sales
/dashboard/packages/[packageId]
```

If route count feels too large, the UI can still render tabbed views under `/dashboard/packages`, but the logical separation should remain.

---

## 7. Quotation Builder V2

The builder should be redesigned into clear sections in the exact business order.

### 7.1 Section Order

1. Summary
2. Flight
3. Visa
4. Transport
5. Hotels
6. Limited Time Offers
7. Terms and Preview

### 7.2 Summary Controls

Fields:

- title
- package type: Umrah, Ziyarat, Holiday
- destination
- departure date
- return date
- adults
- children 5 to 12
- children under 5
- currency
- customer name
- customer phone
- customer email
- agent
- quote expiry
- internal notes

Itinerary toggle:

```text
Makkah first | Madinah first
```

For Umrah, date sections should support:

- Makkah check-in
- Makkah check-out
- Madinah check-in
- Madinah check-out

The toggle should affect:

- display order
- hotel combination order
- transport route suggestions
- WhatsApp quote output
- customer quote layout

### 7.3 Flight Section

Flight should be optional.

Controls:

- Include flight toggle
- Included flight option
- switch/upgrade flight options
- airline
- outbound route
- return route
- outbound connection note
- return connection note
- luggage note
- direct flight flag
- internal supplier/booked cost
- customer sold price
- per-person price mode
- public notes
- internal notes

Default pricing mode:

```text
Per passenger, including under-5s
```

Example output:

```text
***Flights***
London Heathrow to Jeddah
Jeddah to London Heathrow
*Royal Jordanian*
Connection 45 mins
Return 2.5hrs
Luggage 23KG

Switch to:
London Gatwick to Jeddah
Madinah to London Gatwick
*WizzAir*
+GBP 28.00 p.p.
Direct Flight
Luggage 20KG
```

### 7.4 Visa Section

Visa should be optional.

Controls:

- Include visa toggle
- visa type
- visa quantity
- included visa text
- switch/upgrade visa options
- per-person price mode
- internal supplier/booked cost
- customer sold price
- public notes
- internal notes

Default pricing mode:

```text
Per passenger, including under-5s
```

Example output:

```text
****Visa****
* 6 x ETA GB Visa

Switch to:
* 1 YR Multiple Entry Visa +GBP 80.00 p.p.
```

### 7.5 Transport Section

Transport should be optional.

Controls:

- Include transport toggle
- route bullets
- vehicle type
- included ziyarat routes
- upgrade/switch options
- conditional routes based on flight selection
- total price mode by default
- optional per-person mode
- internal supplier/booked cost
- customer sold price
- public notes
- internal notes

Default pricing mode:

```text
Total package cost
```

Transport must support conditional lines. Example:

```text
* Madinah Hotel to Jeddah Airport
- Switch to WizzAir
* Madinah Hotel to Madinah Airport
```

This means the transport route can change based on the selected flight option.

Example output:

```text
****Transport****
* Jeddah Airport to Makkah Hotel
* Makkah Hotel to Madinah Hotel
* Madinah Hotel to Jeddah Airport
- Switch to WizzAir
* Madinah Hotel to Madinah Airport
```

### 7.6 Hotels Section

Hotels should remain the core pricing section.

Controls:

- Makkah hotel options
- Madinah hotel options
- optional extra city/stay group for holidays/ziyarat
- room terms
- meal basis
- view type
- star rating
- date range
- public hotel notes
- internal hotel notes
- hotel booked cost
- hotel sold price
- expected hotel commission
- commission received flag

The quote builder should generate hotel combinations from selected hotel groups.

For each generated package option:

- option number
- Makkah hotel
- Madinah hotel
- room terms
- meal basis
- final per-person package price
- final total package price
- option-level upgrades
- public notes
- internal notes
- show/hide option

Important: Agents should be able to edit generated option terms and add a new hotel option manually.

This is necessary because live sales work often needs a quick custom option that was not prepared in the original quote.

### 7.7 Limited Time Offers

Limited-time offers should support multiple blocks.

Controls:

- offer title
- deadline date
- deadline time
- discount amount
- discount mode: total or per person
- public offer text
- internal note
- active/inactive

Example output:

```text
****EARLY BIRD OFFER****
Book and Purchase this package by
10/07/2026 19:00 PM and get
*GBP 120.00* off (Total)

****TIME LIMITED OFFER****
Reserve your flights today and purchase
this package by 11/07/2026 13:00 PM
and get *GBP 60.00* off (Total)
```

### 7.8 Terms and Preview

Controls:

- standard terms selector
- custom public terms
- availability notice
- non-refundable/non-changeable notice
- WhatsApp preview
- customer page preview
- copy WhatsApp quote button
- save draft
- save and share
- renew expiry

Required standard wording:

```text
Please note Terms and Conditions apply.
Offer is subject to availability.
```

Package-specific terms can be added as templates later.

---

## 8. Customer Quote Flow

Route:

```text
/packages/[token]
```

### 8.1 Customer Can See

- quote title
- dates
- passengers
- expiry timer
- flight section if included
- visa section if included
- transport section if included
- hotel options
- limited-time offers
- terms
- final total after selection
- finalise selection button

### 8.2 Customer Can Choose

- hotel package option
- flight switch/upgrade if exposed
- visa switch/upgrade if exposed
- transport upgrade if exposed
- optional notes to agent

### 8.3 Customer Cannot See

- booked cost
- supplier cost
- hotel commission
- internal margin
- internal notes
- internal invoice
- reservation records
- supplier confirmations
- unreleased documents

### 8.4 Finalise Selection

When the customer finalises:

- save selected option snapshot
- save selected modifiers
- save final displayed total
- save timestamp
- mark quote as customer selected/submitted
- notify or surface to agents in dashboard
- show confirmation page

Suggested customer confirmation wording:

```text
Thank you. Your selected package option has been sent to Piyam Travel.
This is not a confirmed booking yet. Your package remains subject to availability until reservations are completed by an agent.
Please send passport copies via WhatsApp so the team can proceed.
```

---

## 9. Sales / Clerk Mode

Sales / Clerk Mode is for agent-led selling.

Use cases:

- customer is sitting with agent
- customer calls by phone
- customer does not like public options
- agent needs to negotiate package live
- agent needs to edit hotel terms after selection
- agent needs to add a hotel option manually
- agent needs to finalise on behalf of customer

### 9.1 Sales Mode Requirements

Sales mode should:

- use same quote payload as customer quote
- show internal-only fields
- hide booked costs from customer-facing preview
- allow selecting the final package option
- allow editing selected hotel terms
- allow adding a new hotel option
- allow adjusting discount/offer
- allow updating flight/visa/transport
- allow finalising on behalf of customer
- record which agent finalised it
- record finalisation timestamp
- preserve final selected snapshot

### 9.2 Sales Mode Actions

Actions:

- Select for customer
- Edit selected option
- Add custom hotel option
- Add customer note
- Add internal note
- Finalise selection
- Convert to package

### 9.3 Audit Requirements

Sales mode must write audit events:

- opened sales mode
- changed option
- added custom hotel option
- finalised on behalf of customer
- converted quote to package

---

## 10. Package / Reservation Folder

Once a quote is finalised, it should convert into a package folder.

Suggested route:

```text
/dashboard/packages/[packageId]
```

### 10.1 Package Folder Tabs

Recommended tabs:

- Overview
- Quotation
- Passengers
- Reservations
- Documents
- Invoice
- Payments
- Notes
- Audit

### 10.2 Overview Tab

Shows:

- package reference
- customer
- package type
- travel dates
- passengers
- current lifecycle status
- passport status
- deposit/payment status
- reservation progress
- document release status
- invoice release status
- assigned agent
- next action

### 10.3 Quotation Tab

Shows:

- original final quotation snapshot
- selected option
- selected modifiers
- final quote total
- terms accepted
- whether selected by customer or agent
- selected timestamp
- converted timestamp

This snapshot should never be silently overwritten. If terms change later, keep the original snapshot and record amendments separately.

### 10.4 Passengers Tab

Fields:

- passenger name
- date of birth
- passenger type: adult, child 5 to 12, under 5
- passport received flag
- passport checked flag
- passport issue notes
- visa status
- ticket status
- hotel room allocation
- internal notes

Passports are received through WhatsApp, so the system needs status tracking more than file upload at this stage.

### 10.5 Reservations Tab

Reservation sections:

- Flights
- Hotels
- Visa
- Transport

Each reservation item should track:

- reservation type
- supplier
- supplier reference
- reservation status
- booked cost
- sold price
- currency
- deposit required
- payment due date
- confirmation received
- confirmation document
- cancellation policy
- customer-visible notes
- internal notes

Suggested reservation statuses:

- not started
- quote requested
- availability checked
- reservation pending
- reserved
- deposit required
- paid
- confirmed
- changed
- cancelled
- failed

### 10.6 Documents Tab

Document categories should include the old portal categories:

- Flights
- Hotels
- Transport
- Visa
- E-Sim
- Insurance
- Others

Additional internal categories:

- Supplier Confirmations
- Invoice
- Payment Evidence
- Quotation
- Customer Documents
- Internal

Each document should support:

- upload
- preview
- download
- category
- customer-visible flag
- internal-only flag
- expiry/access rules
- storage provider
- storage bucket
- storage key
- backup status

### 10.7 Invoice Tab

Internal invoice workspace.

The invoice should be editable as the booking progresses.

It should show:

- customer sold lines
- internal booked cost lines
- discounts
- customer payments
- hotel commission expected
- hotel commission received
- margin/profit view
- customer balance
- agent notes
- release state

Customer-facing invoice should show only:

- package/service description
- sold price
- discount
- amount paid
- balance due
- due dates
- released terms

Customer-facing invoice must not show:

- booked cost
- supplier cost
- margin
- commission
- internal notes

### 10.8 Payments Tab

Can start simple, then later integrate installment plans with LMS.

Initial fields:

- payment requested
- deposit requested
- deposit received
- amount paid
- amount outstanding
- payment method
- payment note
- payment date
- receipt link/reference

Future LMS integration:

- create installment plan
- link package to LMS customer/account
- track due dates
- payment reminders
- staff follow-up tasks

### 10.9 Notes Tab

Notes should support:

- internal notes
- customer communication notes
- supplier notes
- finance notes
- pinned notes
- timestamps
- author

### 10.10 Audit Tab

Audit events:

- quote created
- quote shared
- quote expired
- quote renewed
- customer selected option
- agent selected option
- quote converted to package
- reservation item created
- reservation item updated
- invoice changed
- invoice released
- document uploaded
- document made customer-visible
- package marked travelling
- package marked returned
- package closed

---

## 11. Package Lifecycle Statuses

### 11.1 Quote Statuses

Existing quote statuses should be expanded.

Suggested quote statuses:

- draft
- shared
- expired
- customer_selected
- agent_selected
- finalised
- converted
- archived

Meaning:

- `draft`: internal only
- `shared`: customer link live
- `expired`: link expired
- `customer_selected`: customer finalised selection
- `agent_selected`: agent finalised in Sales / Clerk Mode
- `finalised`: ready to convert to package
- `converted`: package folder created
- `archived`: no longer active

### 11.2 Package Statuses

Suggested package lifecycle:

- enquiry
- quotation
- selected
- awaiting_passports
- awaiting_deposit
- reservation_pending
- flight_reserved
- hotel_deposit_required
- partially_booked
- fully_reserved
- documents_pending
- documents_released
- travelling_soon
- travelling
- returned
- closed
- cancelled
- archived

These can be simplified in the first implementation if needed.

### 11.3 Invoice Statuses

Suggested invoice lifecycle:

- draft
- internal_review
- finalised
- released_to_customer
- amended
- void
- closed

Important rule:

`released_to_customer` does not mean uneditable. It means the customer can view the current released version. Later amendments create a new version/audit entry.

### 11.4 Commission Statuses

Suggested hotel commission lifecycle:

- not_applicable
- expected
- pending
- invoiced
- received
- disputed
- written_off

### 11.5 Operational Control Statuses

The weak area in the first version of this plan is operational control: agents need the system to tell them what needs attention, not just store package data.

Add first-class operational controls for:

- next action
- task ownership
- supplier deadlines
- customer deadlines
- risk flags
- communication log
- amendment/version history

These controls should be visible on the main Packages page and inside each package folder.

### 11.6 Next Action Rules

Each package should automatically calculate one primary next action.

Examples:

- Passport copies needed
- Customer selection pending
- Deposit required before hotel booking
- Flight reservation pending
- Flight fare hold expiring
- Hotel deposit due
- Hotel confirmation missing
- Visa not started
- Visa deadline approaching
- Transport voucher not generated
- Customer documents not released
- Invoice still internal
- Invoice ready to release
- Customer travelling soon
- Customer returned; package needs closing
- Hotel commission pending

The next action should be:

- visible in package tables
- visible in package overview
- filterable
- assignable to an agent
- backed by a due date where relevant

### 11.7 Risk Flags

Risk flags should be separate from statuses. A package can be `fully_reserved` but still have risks.

Suggested risk flags:

- quote expired
- departure within 14 days and visa not done
- departure within 7 days and documents not released
- flight not ticketed
- hotel not confirmed
- transport not assigned
- deposit overdue
- balance overdue
- supplier payment due
- supplier cost missing
- invoice not released
- customer invoice released but amended internally
- margin negative
- hotel commission overdue
- customer travelling with open issue
- returned but not closed

Each risk flag should have:

- severity: low, medium, high, critical
- source: automatic or manual
- status: open, acknowledged, resolved
- assigned agent
- due date
- resolution note

### 11.8 Deadline Tracking

Travel packages are time-sensitive, so the system needs dedicated deadline tracking.

Deadline types:

- quote expiry
- flight fare hold expiry
- flight ticketing deadline
- hotel rate expiry
- hotel deposit deadline
- supplier payment deadline
- visa processing deadline
- transport confirmation deadline
- customer deposit deadline
- customer balance deadline
- document release target
- departure date
- return date
- customer portal expiry

Deadline behavior:

- show on package overview
- feed into next action
- feed into risk flags
- support reminders later
- support filtering on main package table

### 11.9 Communication Log

WhatsApp remains the main communication channel, but PT-Portal should track what happened.

Communication entries should support:

- channel: WhatsApp, phone, in person, email, internal
- direction: inbound or outbound
- summary
- related package
- related quote
- related invoice
- related reservation
- created by
- timestamp
- follow-up required
- follow-up due date

Common quick-log buttons:

- Quote sent
- Customer selected option
- Passport copies requested
- Passport copies received via WhatsApp
- Deposit requested
- Deposit received
- Flight reservation discussed
- Hotel deposit requested
- Documents released
- Invoice released
- Customer reminded
- Customer returned

This avoids full WhatsApp integration for now while still giving agents a reliable operational history.

### 11.10 Amendment and Version History

Quotes, selected package snapshots, invoices, and released documents need version history.

Versioned objects:

- quote payload
- selected quote snapshot
- customer-facing quote output
- invoice
- released customer invoice
- reservation summary
- transport voucher
- customer document release set

Rules:

- customer final selections are saved as immutable snapshots
- package changes after finalisation are amendments
- released invoice changes create a new version
- customer-visible changes should have a clear change summary
- internal cost changes should not automatically become customer-visible
- original quote output should remain available inside the package folder

---

## 11A. Weak Area Improvements

This section lists the areas that need strengthening before implementation goes too far.

### 11A.1 Make The Main Page Operational, Not Just Informational

The main Packages page should not only show records. It should help agents decide what to do next.

Add table columns or badges for:

- next action
- next action due date
- risk severity
- reservation progress
- passport status
- deposit status
- balance status
- document release status
- invoice release status
- assigned agent

Recommended default sort:

1. critical risk packages
2. overdue next actions
3. upcoming departures
4. recently updated packages

### 11A.2 Keep Customer Visibility Explicit

The product has several internal/customer boundaries. Every user-facing item should have an explicit visibility state.

Objects needing visibility control:

- invoice
- invoice lines
- documents
- transport voucher
- reservation notes
- package summary
- customer portal sections

Visibility states:

- internal_only
- ready_for_review
- released_to_customer
- revoked

### 11A.3 Protect Against Confusing The Customer

Standard wording should be used across quote, selection, invoice, and document pages.

Required customer-facing concepts:

- a quote is subject to availability
- selecting an option is not a confirmed booking
- reservations start after passports/deposit/payment as required
- invoice is official only when released by the agent
- documents may be released closer to departure
- changes and cancellations may affect price

This should become reusable copy/templates rather than handwritten every time.

### 11A.4 Define The First MVP More Tightly

The full plan is large. The first useful build should focus on:

1. Packages main page with Quotations tab
2. Quote Builder V2
3. customer finalise flow
4. Sales / Clerk Mode finalise flow
5. convert finalised quote to package folder
6. package overview with next action/risk basics
7. basic reservation records
8. internal invoice draft hidden from customer
9. MinIO package document upload

Later phases can add:

- customer document portal replacement
- full invoice release/versioning
- commission reporting
- automatic Firebase/cloud storage migration
- installment/LMS integration

### 11A.5 Define Margin Permissions Early

Not every package user should necessarily see supplier cost, margin, or commission.

Recommended permission split:

- agents can see customer price, customer balance, reservation status, and public notes
- senior agents/managers can see booked cost and supplier payment data
- finance/admin users can see margin, commission, and earned profit reports

The first implementation should not hard-code that everyone sees every finance field.

---

## 12. Storage Plan

### 12.1 New MinIO Bucket

Create a new MinIO bucket for package operations.

Recommended bucket name:

```text
pt-packages
```

Alternative:

```text
travel-packages
```

Recommended environment variable:

```text
MINIO_PACKAGES_BUCKET_NAME=pt-packages
```

Do not reuse `MINIO_BUCKET_NAME` for packages. `MINIO_BUCKET_NAME` remains the
general PT-Portal document bucket. Package documents, supplier confirmations,
vouchers, invoices, and migrated booking portal files should use
`MINIO_PACKAGES_BUCKET_NAME`.

### 12.2 Folder / Prefix Structure

MinIO uses buckets and object keys. The "folder" should be implemented as object key prefixes.

Each package gets its own prefix:

```text
pt-packages/
  {package_reference}/
    quotation/
    flights/
    hotels/
    visa/
    transport/
    invoices/
    customer-documents/
    supplier-confirmations/
    vouchers/
    payments/
    internal/
```

Example:

```text
pt-packages/
  PT-PKG-2026-000123/
    quotation/final-quotation.json
    quotation/final-quotation-whatsapp.txt
    flights/e-ticket-family.pdf
    hotels/swissotel-confirmation.pdf
    hotels/saja-confirmation.pdf
    visa/eta-confirmations.pdf
    transport/transport-voucher.html
    transport/transport-voucher.pdf
    invoices/invoice-v1.pdf
    supplier-confirmations/flight-supplier-confirmation.pdf
```

### 12.3 Storage Metadata

Every stored object should have a database row.

Metadata fields:

- id
- package_id
- quote_id nullable
- category
- file_name
- file_size
- file_type
- storage_provider
- storage_bucket
- storage_key
- backup_provider
- backup_bucket
- backup_key
- customer_visible
- internal_only
- uploaded_by
- uploaded_at
- deleted_at

### 12.4 Backup Strategy

MinIO should be primary.

Existing cloud storage should be backup.

Important naming decision:

The current PT-Portal document system already uses `R2_*` environment variables
for document backup/storage. Travel packages must not reuse those names because
this package backup target is different.

Use `R3_*` as the PT-Portal alias for travel package backup storage.

Even if the underlying provider is still Cloudflare R2-compatible storage, the
`R3_*` prefix means "package backup / legacy bookings storage" inside this repo.

Recommended package backup environment variables:

```text
R3_ENDPOINT=https://<package-backup-account>.r2.cloudflarestorage.com
R3_PUBLIC_URL=https://<package-backup-public-domain>
R3_ACCESS_KEY_ID=<package-backup-access-key-id>
R3_SECRET_ACCESS_KEY=<package-backup-secret-access-key>
R3_BUCKET_NAME=pt-packages-backup
```

Accepted compatibility aliases for code helpers:

```text
R3_ACCESS_KEY=<package-backup-access-key-id>
R3_SECRET_KEY=<package-backup-secret-access-key>
```

Do not use these for package backup:

```text
R2_ENDPOINT
R2_ACCESS_KEY
R2_SECRET_KEY
R2_BUCKET_NAME
```

Those remain reserved for the existing document storage/backup system.

Recommended approach:

1. Upload to MinIO first.
2. Save database metadata.
3. Queue backup copy to existing cloud storage.
4. Track backup status on metadata row.

Backup statuses:

- pending
- copied
- failed
- skipped

If dual-write is too much for the first phase, start with MinIO-only and run scheduled backup migration jobs.

### 12.5 Customer Access To Documents

Customer documents should use short-lived signed URLs.

Rules:

- only customer-visible documents can be shown
- internal-only documents never appear
- invoice appears only when released
- supplier confirmations appear only if explicitly customer-visible
- quote link should not expose package documents after quote expiry unless converted to proper package portal access

---

## 13. Database Plan

The exact SQL can be refined during implementation, but the logical model should look like this.

### 13.1 Existing Table: `travel_package_quotes`

Current purpose:

- store quote payload
- share token
- share state
- expiry
- selected option

Likely additions:

- finalised_at
- finalised_by
- finalised_source: customer or agent
- converted_package_id
- converted_at
- customer_selection_note
- agent_selection_note
- last_shared_by
- archived_at

The quote payload can remain JSONB to preserve flexibility.

### 13.2 New Table: `travel_packages`

Purpose:

One row per package/reservation folder.

Fields:

- id
- package_reference
- source_quote_id
- created_by
- assigned_agent_id
- location_id
- customer_name
- customer_phone
- customer_email
- package_type
- destination
- departure_date
- return_date
- status
- passenger_summary
- selected_quote_snapshot JSONB
- current_public_summary JSONB
- passport_status
- payment_status
- invoice_status
- document_release_status
- minio_bucket
- minio_prefix
- created_at
- updated_at
- archived_at
- closed_at

### 13.3 New Table: `travel_package_passengers`

Purpose:

Passenger-level tracking.

Fields:

- id
- package_id
- first_name
- last_name
- date_of_birth
- passenger_type
- passport_received
- passport_checked
- passport_issue_note
- visa_status
- ticket_status
- room_allocation
- notes
- created_at
- updated_at

### 13.4 New Table: `travel_package_reservations`

Purpose:

Top-level reservation records by package and service type.

Fields:

- id
- package_id
- reservation_type: flight, hotel, visa, transport, other
- title
- status
- supplier_name
- supplier_reference
- booked_cost_total
- sold_price_total
- currency
- deposit_required
- deposit_due_at
- payment_due_at
- confirmation_received
- customer_visible
- public_notes
- internal_notes
- created_at
- updated_at

### 13.5 New Table: `travel_package_reservation_items`

Purpose:

Line items inside each reservation section.

Fields:

- id
- reservation_id
- package_id
- item_type
- description
- quantity
- unit_booked_cost
- unit_sold_price
- discount_amount
- total_booked_cost
- total_sold_price
- supplier_reference
- status
- starts_at
- ends_at
- metadata JSONB
- created_at
- updated_at

### 13.6 New Table: `travel_package_invoices`

Purpose:

Editable invoice workspace.

Fields:

- id
- package_id
- invoice_number
- status
- currency
- subtotal_sold
- discount_total
- total_sold
- total_paid
- balance_due
- total_booked_cost
- projected_margin
- expected_commission_total
- received_commission_total
- released_to_customer
- released_at
- released_by
- version
- customer_terms
- internal_notes
- created_at
- updated_at

### 13.7 New Table: `travel_package_invoice_lines`

Purpose:

Invoice line detail.

Fields:

- id
- invoice_id
- package_id
- line_type: flight, hotel, visa, transport, discount, commission, other
- description
- quantity
- unit_sold_price
- total_sold_price
- unit_booked_cost
- total_booked_cost
- discount_amount
- expected_commission
- received_commission
- customer_visible
- sort_order
- metadata JSONB
- created_at
- updated_at

### 13.8 New Table: `travel_package_payments`

Purpose:

Track deposits and payments.

Fields:

- id
- package_id
- invoice_id
- amount
- currency
- payment_method
- payment_status
- received_at
- received_by
- receipt_id nullable
- notes
- metadata JSONB
- created_at
- updated_at

### 13.9 New Table: `travel_package_documents`

Purpose:

Package-specific document metadata.

Fields:

- id
- package_id
- quote_id nullable
- reservation_id nullable
- invoice_id nullable
- category
- file_name
- file_size
- file_type
- storage_provider
- storage_bucket
- storage_key
- backup_provider
- backup_bucket
- backup_key
- backup_status
- customer_visible
- internal_only
- uploaded_by
- uploaded_at
- deleted_at

### 13.10 New Table: `travel_package_audit_events`

Purpose:

Traceability.

Fields:

- id
- package_id nullable
- quote_id nullable
- actor_id nullable
- event_type
- event_summary
- before_data JSONB nullable
- after_data JSONB nullable
- metadata JSONB
- created_at

### 13.11 New Table: `travel_package_tasks`

Purpose:

Next actions, manual tasks, and follow-ups.

Fields:

- id
- package_id nullable
- quote_id nullable
- reservation_id nullable
- invoice_id nullable
- title
- description
- task_type
- status: open, in_progress, blocked, completed, cancelled
- priority: low, medium, high, critical
- assigned_to nullable
- due_at nullable
- completed_at nullable
- completed_by nullable
- auto_generated boolean
- source_rule nullable
- metadata JSONB
- created_at
- updated_at

### 13.12 New Table: `travel_package_deadlines`

Purpose:

Time-sensitive holds, deposit dates, supplier deadlines, and customer deadlines.

Fields:

- id
- package_id
- quote_id nullable
- reservation_id nullable
- invoice_id nullable
- deadline_type
- title
- due_at
- status: open, met, missed, cancelled, extended
- severity: low, medium, high, critical
- assigned_to nullable
- reminder_sent_at nullable
- resolved_at nullable
- resolved_by nullable
- notes
- metadata JSONB
- created_at
- updated_at

### 13.13 New Table: `travel_package_risk_flags`

Purpose:

Operational risk flags that can be automatic or manual.

Fields:

- id
- package_id
- quote_id nullable
- risk_type
- severity: low, medium, high, critical
- status: open, acknowledged, resolved
- source: automatic, manual
- title
- description
- assigned_to nullable
- due_at nullable
- acknowledged_at nullable
- acknowledged_by nullable
- resolved_at nullable
- resolved_by nullable
- resolution_note
- metadata JSONB
- created_at
- updated_at

### 13.14 New Table: `travel_package_communications`

Purpose:

Manual communication history, especially WhatsApp-based operations.

Fields:

- id
- package_id nullable
- quote_id nullable
- reservation_id nullable
- invoice_id nullable
- channel: whatsapp, phone, in_person, email, internal
- direction: inbound, outbound, internal
- summary
- follow_up_required boolean
- follow_up_due_at nullable
- created_by
- created_at
- metadata JSONB

### 13.15 New Table: `travel_package_versions`

Purpose:

Version snapshots for quote payloads, invoices, vouchers, and customer-visible releases.

Fields:

- id
- package_id nullable
- quote_id nullable
- object_type: quote, selected_quote, invoice, transport_voucher, document_release, reservation_summary
- object_id nullable
- version_number
- visibility: internal_only, ready_for_review, released_to_customer, revoked
- snapshot JSONB
- customer_change_summary nullable
- internal_change_summary nullable
- created_by nullable
- created_at
- released_at nullable
- released_by nullable

### 13.16 New Table: `travel_package_legacy_migration_map`

Purpose:

Map old bookings portal records to new PT-Portal records.

Fields:

- id
- legacy_customer_id
- legacy_reference_number
- package_id
- migration_status
- migrated_documents_count
- failed_documents_count
- source_payload JSONB
- error_message
- migrated_at
- created_at

---

## 14. Automatic Migration Plan From Old Bookings Portal

Migration should not be treated as a manual copy project.

Preferred approach:

```text
Connect Firebase database
-> Connect existing bookings portal cloud storage through R3_* variables
-> Run automatic import from inside PT-Portal
-> Copy package files into the new MinIO package bucket
-> Keep the old R3/source storage as backup/source history
-> Verify counts and sample records
-> Decommission old portal only after validation
```

The user will connect the Firebase database and existing bookings portal cloud
storage credentials. PT-Portal should then provide an automatic
migration/import tool that reads the old portal data directly. The old package
cloud storage must use `R3_*` variables so it remains separate from the current
document-storage `R2_*` configuration.

### 14.1 Migration Goals

Import:

- customer folders
- reference numbers
- package type
- destination
- documents
- document categories
- key information
- checklist
- notes
- status
- archived flag
- access expiry
- transport vouchers where available
- timestamps

Do not import as live PT-Portal users:

- Firebase Auth accounts
- obsolete frontend state
- old public bucket assumptions

### 14.2 Connected Source Systems

Source database:

```text
Firebase Firestore collection: customers
```

Preferred PT-Portal environment variables:

```text
LEGACY_BOOKINGS_FIREBASE_PROJECT_ID=<firebase-project-id>
LEGACY_BOOKINGS_FIREBASE_CLIENT_EMAIL=<firebase-client-email>
LEGACY_BOOKINGS_FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

These values can be copied from the old bookings portal variables:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

PT-Portal should use the `LEGACY_BOOKINGS_` prefix so this migration connection
does not become confused with any future Firebase use in the main portal.

Source object storage:

```text
Existing cloud storage used by the bookings portal
PT-Portal env prefix: R3_*
```

Destination database:

```text
Supabase Postgres
```

Destination object storage:

```text
MinIO bucket: pt-packages
```

Backup/source history:

```text
Existing cloud storage remains available as backup/history
PT-Portal env prefix: R3_*
```

Mailgun for package/booking customer emails:

```text
MAILGUN_API_KEY=<existing-mailgun-api-key>
MAILGUN_DOMAIN=<existing-mailgun-domain>
TRAVEL_PACKAGES_MAILGUN_SENDER_EMAIL="Piyam Travel <bookings.noreply@piyamtravel.com>"
```

The package module may fall back to `MAILGUN_SENDER_EMAIL`, but the preferred
package-specific key is `TRAVEL_PACKAGES_MAILGUN_SENDER_EMAIL`. Appointment
emails can keep their existing sender independently.

### 14.3 Migration UI

Add an admin-only migration page later:

```text
/dashboard/packages/migration
```

The page should show:

- Firebase connection status
- cloud storage connection status
- total legacy customers found
- total legacy documents found
- estimated import size
- dry-run results
- import progress
- failed records
- failed files
- retry controls
- final reconciliation report

Controls:

- Test Firebase connection
- Test storage connection
- Scan legacy records
- Run dry import
- Import selected sample
- Run full import
- Retry failed files
- Export migration report

### 14.4 Automatic Migration Behavior

The importer should:

- read Firestore customers directly
- create `travel_packages` records in Supabase
- preserve legacy reference numbers where possible
- create package MinIO prefixes automatically
- copy legacy storage objects into MinIO
- write document metadata rows
- keep legacy file URL/key metadata for traceability
- write migration map rows
- support dry-run mode
- support resume mode
- support retry mode
- skip already-imported records safely
- report failures without stopping the entire run

### 14.5 Field Mapping

Legacy `customers` -> new `travel_packages`:

```text
legacy id -> travel_package_legacy_migration_map.legacy_customer_id
referenceNumber -> travel_packages.package_reference
firstName + lastName -> travel_packages.customer_name
packageType -> travel_packages.package_type
destination -> travel_packages.destination
status -> travel_packages.status mapping
isArchived -> travel_packages.archived_at / status
createdAt -> travel_packages.created_at
lastUpdatedAt -> travel_packages.updated_at
accessExpiresAt -> customer portal access expiry field
keyInformation -> travel_packages.current_public_summary or package metadata
```

Legacy documents -> new `travel_package_documents`:

```text
documents[].category -> category
documents[].name -> file_name
documents[].url -> legacy_url metadata
documents[].fileKey -> source storage key
copied MinIO key -> storage_key
source cloud object -> backup/source metadata
```

Legacy notes -> package notes/communications:

```text
notes[] -> internal notes or communication log entries
```

Legacy checklist -> package checklist:

```text
checklist[] -> package checklist table or JSONB metadata
```

### 14.6 Status Mapping

Legacy statuses:

- In Progress
- Completed

Suggested mapping:

```text
In Progress -> in_progress or documents_pending
Completed -> returned, closed, or imported_completed
Archived flag true -> archived
```

Because old records may not have complete travel dates, migration should preserve the original legacy status in metadata and add a migration note rather than guessing too aggressively.

### 14.7 Reconciliation

The migration is only trusted after reconciliation.

Reconciliation report:

- total legacy folders found
- total packages created
- total legacy documents found
- total documents copied to MinIO
- total documents left on source storage only
- failed document copies
- duplicate reference numbers
- records missing last name
- records missing file keys
- broken source URLs
- archived folders imported
- completed folders imported
- random sample checked
- customer access checked

The migration page should make failures visible and retryable.

### 14.8 Cutover

Cutover should happen only after:

- automatic import has completed
- reconciliation report is reviewed
- sample packages are checked
- document preview/download works from MinIO
- staff confirm the new package folder flow covers old portal work

The old portal can then become read-only, redirected, or retained temporarily as a fallback.

### 14.9 Decommission

Only decommission the old app after:

- all active folders are imported
- all documents are accessible in PT-Portal or traceable to source storage
- staff confirm workflows are covered
- old cloud storage backup/source history is retained for the agreed period

---

## 15. Pricing and Finance Logic

### 15.1 Pricing Concepts

The quote has customer-facing prices.

The reservation/invoice has both:

- booked cost: what Piyam Travel paid or expects to pay
- sold price: what the customer pays

Margin:

```text
margin = sold price - booked cost + received commission - discounts/adjustments
```

This is provisional until the customer returns and commissions are settled.

### 15.2 Quote Pricing

Quote-level calculations:

- hotel options drive package option list
- flight can be included or optional
- visa can be included or optional
- transport can be included or optional
- limited-time offers can reduce total
- output shows final package total/per-person price

### 15.3 Reservation Pricing

Reservation-level calculations:

- each supplier item can have booked cost and sold price
- costs can be unknown initially
- agent can update costs as reservations are made
- differences should update invoice internal margin

### 15.4 Invoice Pricing

Invoice should show:

- service lines
- sold price lines
- discounts
- amount paid
- balance due

Internal invoice view should additionally show:

- booked cost lines
- margin per line
- total projected margin
- expected commission
- received commission

### 15.5 Hotel Commission

Hotel reservation/invoice lines need commission fields:

- expected commission amount
- expected commission percentage
- commission source
- commission due date
- commission received amount
- commission received date
- commission status
- commission notes

Commission should improve the final earned result only when received or confidently accrued, depending on accounting rules chosen later.

---

## 16. Customer Document Portal

The old portal's customer document concept should be retained, but implemented inside PT-Portal.

### 16.1 Access Model

Options:

1. Reference number + last name, similar to old portal
2. Secure token link per package
3. Both

Recommended first version:

- reference number + last name for customer portal
- signed token links for specific quote/share flows

### 16.2 Customer Portal Can Show

- package reference
- customer name
- travel dates
- agent contact
- ground transport contact
- checklist
- released documents
- released invoice only if agent enables it
- access expiry notice

### 16.3 Customer Portal Cannot Show

- internal invoice until released
- booked cost
- supplier cost
- margin
- hotel commission
- internal notes
- unreleased documents
- supplier-only files unless marked visible

### 16.4 Access Expiry

Old portal used an access expiry idea.

New portal should support:

- default expiry after return, for example 10 months
- agent extension
- immediate revoke
- audit event for extension/revoke

---

## 17. Transport Voucher

The legacy portal can generate a transport voucher. This should be rebuilt inside the package folder.

### 17.1 Voucher Inputs

Fields:

- package reference
- customer name
- passenger count
- arrival airport
- arrival date/time
- departure airport
- departure date/time
- Makkah hotel
- Madinah hotel
- transport routes
- vehicle type
- driver/company contact
- ground transport manager
- notes

### 17.2 Voucher Output

Outputs:

- HTML preview
- PDF export later if needed
- stored in MinIO under `transport/`
- document row category `Transport`
- customer-visible toggle

### 17.3 Voucher Lifecycle

Statuses:

- draft
- generated
- released_to_customer
- amended

---

## 18. API Plan

Existing package quote APIs can be extended, then new package APIs added.

### 18.1 Quote APIs

Existing:

```text
GET/POST /api/packages
GET/PATCH /api/packages/[id]
GET /api/packages/share/[token]
POST /api/packages/share/[token]/selection
```

Planned:

```text
POST /api/packages/[id]/finalise
POST /api/packages/[id]/convert
POST /api/packages/[id]/renew
POST /api/packages/[id]/duplicate
```

Potential naming note:

The existing `/api/packages` name currently means quote APIs. As package folders are added, consider splitting:

```text
/api/package-quotes
/api/travel-packages
```

This avoids confusion between quotes and actual package folders.

### 18.2 Package APIs

Planned:

```text
GET /api/travel-packages
POST /api/travel-packages
GET /api/travel-packages/[packageId]
PATCH /api/travel-packages/[packageId]
POST /api/travel-packages/[packageId]/status
POST /api/travel-packages/[packageId]/archive
```

### 18.3 Reservation APIs

Planned:

```text
GET /api/travel-packages/[packageId]/reservations
POST /api/travel-packages/[packageId]/reservations
PATCH /api/travel-packages/[packageId]/reservations/[reservationId]
DELETE /api/travel-packages/[packageId]/reservations/[reservationId]
```

### 18.4 Invoice APIs

Planned:

```text
GET /api/travel-packages/[packageId]/invoice
POST /api/travel-packages/[packageId]/invoice
PATCH /api/travel-packages/[packageId]/invoice
POST /api/travel-packages/[packageId]/invoice/release
POST /api/travel-packages/[packageId]/invoice/amend
POST /api/travel-packages/[packageId]/invoice/void
```

### 18.5 Document APIs

Planned:

```text
GET /api/travel-packages/[packageId]/documents
POST /api/travel-packages/[packageId]/documents
PATCH /api/travel-packages/[packageId]/documents/[documentId]
DELETE /api/travel-packages/[packageId]/documents/[documentId]
GET /api/travel-packages/[packageId]/documents/[documentId]/preview
GET /api/travel-packages/[packageId]/documents/[documentId]/download
```

### 18.6 Migration APIs / Scripts

Migration should be automatic once Firebase and cloud storage are connected.

The first version can use server-side actions or admin-only API routes behind a migration UI. Scripts can still help for local testing, but the product direction is an authenticated PT-Portal migration tool rather than a manual export/import process.

Planned admin routes/tools:

```text
GET /api/travel-packages/migration/status
POST /api/travel-packages/migration/test-firebase
POST /api/travel-packages/migration/test-storage
POST /api/travel-packages/migration/scan
POST /api/travel-packages/migration/dry-run
POST /api/travel-packages/migration/import
POST /api/travel-packages/migration/retry-failed
GET /api/travel-packages/migration/report
```

Optional local support scripts:

```text
scripts/migrations/test-legacy-bookings-connections.ts
scripts/migrations/verify-legacy-bookings-migration.ts
```

---

## 19. UI Implementation Plan

### 19.1 Refactor Existing Packages Page

Current `/dashboard/packages` should become the Packages main page.

Move the current builder into:

```text
/dashboard/packages/quotations/new
/dashboard/packages/quotations/[quoteId]/edit
```

or into components:

```text
app/dashboard/packages/components/PackageQuoteBuilder.tsx
app/dashboard/packages/components/PackageQuotesTable.tsx
app/dashboard/packages/components/PackagesTable.tsx
```

### 19.2 Quotation Table UI

Needs:

- filters
- status chips
- expiry countdown
- customer selected indicator
- active link indicator
- selected option summary
- actions menu

### 19.3 Builder UI

Recommended UI pattern:

- left/main column: form sections
- right sticky panel: live summary and totals
- preview button for WhatsApp output
- final save/share actions at bottom or sticky header

Controls:

- segmented toggle for Makkah first / Madinah first
- include toggles for Flight, Visa, Transport
- textareas for WhatsApp-like copy blocks
- structured fields for pricing
- repeatable option rows
- table for generated hotel combinations
- date/time controls for offer expiry

### 19.4 Package Folder UI

Recommended UI pattern:

- header with package reference/status/actions
- tabs below header
- compact operational layout
- no marketing-style hero page
- dense but readable tables/forms

Actions:

- Upload Document
- Create Transport Voucher
- Edit Invoice
- Release Invoice
- Release Documents
- Mark Travelling
- Mark Returned
- Close Package

### 19.5 Customer Portal UI

Customer side should be simple:

- package header
- key info
- checklist
- released documents grouped by category
- preview/download actions
- released invoice section only if live
- expiry notice

---

## 20. Security, Permissions, and Visibility

### 20.1 Staff Permissions

Suggested permissions:

- packages.view
- packages.create
- packages.edit
- packages.archive
- packages.convert_quote
- packages.manage_reservations
- packages.manage_invoice
- packages.release_invoice
- packages.manage_documents
- packages.release_documents
- packages.view_financials
- packages.view_margin
- packages.manage_commission
- packages.migrate_legacy

Not every agent should necessarily see margin/booked cost. This can be decided later, but the model should support it.

### 20.2 Customer Permissions

Customer access should be read-only except:

- selecting quote option
- finalising quote selection
- adding selection note
- updating contact info if allowed
- ticking checklist items if allowed

### 20.3 Public Token Security

Quote tokens:

- should be random and non-guessable
- should expire by default after 72 hours
- should not reveal internal costs
- should not reveal package folder after conversion unless intended

Document URLs:

- should be short-lived signed URLs
- should be scoped to customer-visible documents
- should be generated server-side

### 20.4 Audit Trail

Any sensitive action should be audited:

- releasing invoice
- making documents visible
- editing sold price
- editing booked cost
- editing commission
- changing package status to closed/earned
- deleting documents
- converting quotes

---

## 21. Reporting

Future reports should support:

- active packages
- upcoming departures
- customers travelling now
- returned but not closed
- invoices not released
- unpaid deposits
- outstanding balances
- passport copies missing
- reservations pending
- documents not released
- expected commission
- received commission
- projected margin
- earned profit after return

Important finance distinction:

```text
Projected margin != earned profit
```

Earned profit should only count after return/close rules are satisfied.

---

## 22. Installment Plan / LMS Integration

This is future work after the package and invoice foundation is stable.

Potential integration:

- package invoice creates installment plan
- installment plan links to LMS/customer account
- payment schedule is visible internally
- reminders are generated
- overdue payments create tasks
- receipts link back to package

Do not build this before:

- package folder exists
- invoice model exists
- payments table exists
- customer package lifecycle is stable

---

## 23. Implementation Phases

### Phase 0: Planning and Data Audit

Deliverables:

- finalise this plan with user feedback
- inspect current PT-Portal package quote implementation
- inspect old bookings portal source/data shape
- decide exact route structure
- decide exact bucket name
- decide first-pass status names

### Phase 1: Quote Builder V2

Deliverables:

- flight moved above hotels
- flight per-person pricing
- visa section added
- transport retained and improved
- Makkah first / Madinah first toggle
- under-5 pricing rule fixed
- limited-time offers added
- WhatsApp output matches real package examples
- quote builder supports required section order

Tests:

- under-5 excluded from hotel only
- under-5 included in flight/visa/transport
- flight per-person total
- visa optional
- transport optional
- itinerary order changes output
- limited-time discount calculations

### Phase 2: Packages Main Page and Quotations Tab

Deliverables:

- `/dashboard/packages` becomes main packages dashboard
- tabs added
- quotations table added
- add new quote button
- existing builder moved to new/edit page
- edit/open/copy/renew/archive actions
- next action column added as a placeholder/foundation
- risk flag column added as a placeholder/foundation

Tests:

- quote table loads
- filters work
- expired quotes visible
- edit existing quote works
- share link copy works

### Phase 3: Customer Finalise Flow and Sales Mode

Deliverables:

- customer finalise action improved
- selected option snapshot saved
- Sales / Clerk Mode page
- agent can select/edit/add option
- audit events for finalisation
- customer and agent finalisation source tracked

Tests:

- public finalise saves selection
- expired quote blocks finalise
- agent finalise works
- finalised snapshot is stable

### Phase 4: Package Folder Foundation

Deliverables:

- convert finalised quote to package folder
- `travel_packages` table
- `travel_package_tasks` table
- `travel_package_deadlines` table
- `travel_package_risk_flags` table
- `travel_package_communications` table
- `travel_package_versions` table
- package reference generation
- overview tab
- quotation snapshot tab
- passenger/passport status basics
- package lifecycle status
- automatic next action basics
- manual communication log basics
- basic risk flag generation

Tests:

- quote converts once only
- package folder preserves selected quote
- status transitions validate
- next action updates from package state
- risk flags appear for missing critical steps
- communication entries are saved

### Phase 5: Reservations Workspace

Deliverables:

- flight reservation records
- hotel reservation records
- visa reservation records
- transport reservation records
- booked cost and sold price fields
- supplier references
- reservation status tracking

Tests:

- add/edit reservation items
- booked cost/sold price totals
- status changes audited

### Phase 6: New MinIO Package Bucket

Deliverables:

- create/configure new bucket
- package folder prefix rules
- upload package documents
- preview/download documents
- customer-visible flag
- backup status field

Tests:

- upload to MinIO
- metadata saved
- signed preview/download works
- customer cannot access internal docs
- backup failure does not break primary upload

### Phase 7: Invoice Workspace

Deliverables:

- editable internal invoice
- invoice lines
- discounts
- booked cost vs sold price
- hotel commission tracking
- release invoice control
- amendment audit

Tests:

- internal invoice hidden by default
- release makes customer invoice visible
- booked cost not visible to customer
- amendments preserve audit/version
- commission affects internal margin

### Phase 8: Customer Document Portal

Deliverables:

- package customer login/access
- show released documents
- show released invoice only if enabled
- checklist/key info
- access expiry/extension

Tests:

- customer login by reference/last name
- customer sees only released docs
- invoice hidden until released
- expired access blocks portal

### Phase 9: Automatic Legacy Portal Migration

Deliverables:

- Firebase connection test
- legacy cloud storage connection test
- migration admin page
- Firestore customer scan
- automatic customer/package import
- automatic cloud storage to MinIO document copy
- migration map table
- dry run report
- full migration report
- retry failed imports
- reconciliation report
- old portal decommission checklist

Tests:

- sample migrated package opens
- document count matches
- automatic resume skips already imported records
- failed documents reported
- duplicate references handled

### Phase 10: Installments / LMS Integration

Deliverables:

- package payment plan
- installment schedule
- LMS linkage
- reminders/tasks

This phase should wait until the invoice and package lifecycle are stable.

---

## 24. Acceptance Criteria

### MVP Acceptance Criteria

The MVP is acceptable when:

- agents can create a detailed Umrah/holiday/ziyarat quote
- quote includes optional flight, visa, transport, hotels, and offers
- hotel combinations can produce customer-facing options
- customer can select and finalise an option
- agent can finalise via Sales / Clerk Mode
- finalised quote can become a package folder
- package folder stores final quote snapshot
- package folder shows next action and basic risk state
- package folder records communication notes
- agent can track reservations
- agent can manage internal invoice
- invoice is hidden until released
- package documents can be stored in MinIO
- customer can view released documents
- automatic legacy portal migration path is proven with a connected dry run

### Decommission Acceptance Criteria

The old bookings portal can be decommissioned only when:

- active customer folders are imported automatically
- documents are accessible in PT-Portal
- reconciliation report has been reviewed
- failed imports are resolved or documented
- transport vouchers are recreated or migrated where needed
- staff can create new package folders in PT-Portal
- customer portal replacement is working
- old app is either read-only or redirected
- backup/export is retained

---

## 25. Open Questions

Questions to decide before or during implementation:

1. Should the new bucket be named `pt-packages` or `travel-packages`?
2. Should every customer package use the old `PT-XXXXXX` reference style or a new `PT-PKG-YYYY-NNNNNN` style?
3. Should customer portal access use reference + last name, token links, or both?
4. Which staff roles can see booked cost and margin?
5. Should hotel commission be counted as projected profit immediately or only once received?
6. Should invoices have versioned PDFs, or should the live invoice render from database each time?
7. Should migrated old "Completed" folders become `returned`, `closed`, or remain as imported historical status?
8. Should WhatsApp passport receipt be tracked only as a status, or should agents optionally upload passport copies later?
9. Should package documents reuse the existing `documents` table or use a package-specific documents table with the same storage helpers?
10. Should Sales / Clerk Mode be a separate route or a mode inside the quote editor?
11. Should automatic migration preserve old reference numbers exactly, or generate new package references and store old references as aliases?
12. Should next action/risk calculations run live in the app, be persisted in tables, or use both?
13. Which customer communications should become quick-log buttons first?
14. Should customer invoice releases create PDF snapshots immediately, or only when the customer downloads/views them?

---

## 26. Recommended First Build Order

Recommended next coding sequence:

1. Refactor `/dashboard/packages` into the main Packages dashboard with a Quotations tab.
2. Move the current quote builder into a new quote route/component.
3. Upgrade quote payload/calculator for flight per-person, visa, itinerary order, under-5 rules, offers, and WhatsApp output.
4. Add customer finalise improvements and Sales / Clerk Mode.
5. Add package folder conversion and package overview.
6. Add next action, deadline, risk flag, communication log, and version foundations.
7. Add reservation records.
8. Add MinIO package bucket document upload.
9. Add internal invoice workspace.
10. Add customer package document portal.
11. Build automatic Firebase/cloud-storage migration tooling after credentials are connected.

This order keeps the quoting work useful immediately while laying the foundation for reservations, invoices, storage, and migration.
