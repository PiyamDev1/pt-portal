# Bookings Portal Integration for PT-Portal Packages

> **Historical external-integration design.** PT-Portal now has native quote sharing, package-reference/surname access, customer documents, invoices, vouchers, and legacy migration tooling. This file is not the current contract for either deployed portal. Use [Travel Packages](../../guides/TRAVEL_PACKAGES_GUIDE.md) and revalidate the external bookings-portal deployment before acting.

**Original status:** Ready for implementation

**Created:** August 8, 2026

**Customer Portal:** `https://bookings.piyamtravel.com`

**Customer Portal Repo:** `Piyam-Travel-LTD/piyam-travel-bookings-portal`

**Package Operations Repo:** `Piyam-Travel-LTD/pt-portal`

**Related Plan:** `TRAVEL_PACKAGE_QUOTATION_RESERVATION_WORKFLOW_PLAN.md`

---

## 1. Purpose

The existing bookings portal must be updated so customers can open packages created and managed in PT-Portal without losing access to legacy Firebase customer folders during the transition.

PT-Portal is now the operational source of truth for new packages. It owns:

- package references
- customer identity used for portal access
- package dates and public summary
- document release status
- released flight, hotel, visa, transport, insurance, E-Sim, invoice, and other files
- released invoice snapshots
- released transport vouchers
- MinIO document storage and signed file URLs
- portal access enablement and expiry
- access audit records

The bookings portal should remain the customer-facing website at `bookings.piyamtravel.com`. It should no longer create or manage new package folders. Its agent functionality can remain temporarily for legacy records, but all new operational work belongs in PT-Portal.

The intended result is:

```text
Agent creates and manages package in PT-Portal
-> Package is converted with reference PT-XXXXXX
-> Agent releases selected documents and enables customer access
-> Customer opens bookings.piyamtravel.com
-> Customer enters PT reference and lead passenger surname
-> Bookings portal loads the package from PT-Portal
-> Customer previews/downloads only released documents
-> Legacy Firebase customers continue to work during migration
```

---

## 2. Existing Bookings Portal Architecture

The current `piyam-travel-bookings-portal` repository uses:

- React 18
- Vite 5
- React Router 6
- Tailwind CSS
- Firebase Authentication for agents
- Firestore for customer folders
- Cloudflare R2 for legacy documents
- Vercel serverless functions
- Zustand for agent-side state

Relevant current files:

```text
src/App.jsx
src/components/ClientPortal.jsx
src/components/AgentDashboard.jsx
src/firebase.js
src/data.js
api/lookup-customer.js
vercel.json
```

Current customer flow:

```text
POST /api/lookup-customer
-> Query Firestore customers by PT reference and lowercase surname
-> Return the complete legacy customer object
-> ClientPortal renders legacy documents and checklist
```

Current application routes:

```text
/        Customer document login and portal
/agent   Legacy Firebase agent dashboard
```

Missing route required by PT-Portal:

```text
/package-documents/:token
```

PT-Portal already generates customer document URLs and transport voucher QR codes using this route shape.

---

## 3. Ownership Boundary

### 3.1 PT-Portal Owns New Package Data

The bookings portal must not connect directly to the PT-Portal Supabase database and must never receive the Supabase service role key.

For new packages, PT-Portal remains responsible for:

- validating the package reference and surname
- rate limiting failed login attempts
- checking whether customer access is enabled
- checking portal expiry
- deciding which documents are customer-visible
- deciding whether an invoice is released
- deciding whether a transport voucher is released
- generating short-lived MinIO URLs
- removing internal notes and supplier allocation data
- recording portal access

The bookings portal is responsible for:

- the login and customer-facing interface
- routing between PT-Portal and legacy Firebase records
- rendering package data returned by PT-Portal
- document preview and download controls
- mobile usability
- session/logout behaviour
- friendly customer error states

### 3.2 Legacy Firebase Remains Readable During Transition

The current Firestore lookup should remain available until legacy records have been automatically migrated and validated.

Do not create a second copy of new PT-Portal packages in Firebase. That would create two sources of truth and allow document release state to drift.

---

## 4. Required Customer Routes

### 4.1 `/`

The existing login page remains the main entry point.

Required fields:

- package reference
- lead passenger surname

The reference input should continue to display the `PT-` prefix and accept the six-character code. It should also tolerate customers pasting the full reference.

Examples that must normalize to the same reference:

```text
H29GPX
PT-H29GPX
pt-h29gpx
PT-H29GPX
```

### 4.2 `/package-documents/:token`

This route is required for:

- QR codes on transport vouchers
- access vouchers generated in PT-Portal
- direct document portal links copied by agents

The token is an opaque access credential. The client must not parse it, convert it to a package reference, or expose it in logs.

On direct navigation, the route should:

1. read the token from React Router
2. call the bookings portal serverless proxy
3. load the current package from PT-Portal
4. display the same customer dashboard used after reference/surname login
5. show an expired or revoked message when access is unavailable

### 4.3 `/agent`

Keep the existing Firebase agent dashboard during the migration period, but display a clear internal notice:

```text
Legacy package folders only. Create and manage new packages in PT-Portal.
```

New package creation should eventually be removed from this page after migration sign-off.

---

## 5. Integration Architecture

The customer browser should call only `bookings.piyamtravel.com` endpoints.

```text
Customer browser
    |
    v
bookings.piyamtravel.com/api/package-access
    |
    +--> PT-Portal /api/package-portal/access
    |
    +--> Legacy /api/lookup-customer fallback on a genuine 404 only

Customer browser
    |
    v
bookings.piyamtravel.com/api/package-data
    |
    v
PT-Portal /api/package-documents/:token
    |
    +--> Supabase release metadata
    +--> MinIO signed preview/download URLs
    +--> released invoice snapshot
    +--> released transport voucher
```

This server-side proxy design is preferred because it:

- avoids browser CORS dependency between the two domains
- prevents the PT-Portal API base URL becoming part of every component
- provides one place for legacy/new source routing
- allows secure session cookies
- allows future service-to-service request signing
- keeps Supabase and storage credentials out of the bookings portal browser

---

## 6. PT-Portal APIs Already Available

### 6.1 Reference and Surname Access

```http
POST {PT_PORTAL_BASE_URL}/api/package-portal/access
Content-Type: application/json
```

Request:

```json
{
  "reference": "PT-H29GPX",
  "lastName": "Tariq"
}
```

Success:

```json
{
  "token": "opaque-package-document-token"
}
```

Current error behaviour:

| Status | Meaning                         | Bookings portal action                                      |
| ------ | ------------------------------- | ----------------------------------------------------------- |
| `400`  | Missing or invalid input        | Show validation error                                       |
| `404`  | No matching active PT package   | Try legacy Firebase lookup                                  |
| `410`  | Matching package access expired | Show expiry message; do not use legacy fallback             |
| `429`  | Too many failed attempts        | Show retry-later message; do not use legacy fallback        |
| `500`  | PT-Portal unavailable           | Show temporary service error; do not report invalid details |

PT-Portal currently limits repeated failed access attempts by hashed IP address and records successful customer portal access in the package audit log.

### 6.2 Package Data by Token

```http
GET {PT_PORTAL_BASE_URL}/api/package-documents/{token}
```

Success response:

```json
{
  "package": {
    "id": "uuid",
    "package_reference": "PT-H29GPX",
    "customer_name": "Sobia Tariq",
    "customer_email": "customer@example.com",
    "package_type": "umrah",
    "destination": "Makkah and Madinah",
    "departure_date": "2026-08-10",
    "return_date": "2026-08-16",
    "document_access_expires_at": "2027-06-10T00:00:00.000Z",
    "document_release_status": "released",
    "current_public_summary": {},
    "passport_status": "ready"
  },
  "documents": [],
  "releasedInvoice": null,
  "transportVoucher": null,
  "signedUrlExpiresIn": 900
}
```

Only documents satisfying both conditions are returned:

```text
customer_visible = true
status = released
```

Each returned document includes:

```text
id
category
title
file_name
file_size
file_type
released_at
public_notes
metadata
signed_url
preview_url
```

`signed_url` is for download. `preview_url` uses inline content disposition. Both expire after 15 minutes and must be refreshed by reloading package data when expired.

Current token errors:

| Status | Meaning                                               |
| ------ | ----------------------------------------------------- |
| `400`  | Token missing                                         |
| `404`  | Token invalid, access revoked, or package unavailable |
| `410`  | Access expired                                        |
| `500`  | Package or storage lookup failed                      |

---

## 7. Bookings Portal Serverless Adapter

### 7.1 New `api/package-access.js`

Responsibilities:

1. normalize the submitted reference
2. call PT-Portal first
3. return a PT package session on success
4. use Firebase only when PT-Portal returns `404`
5. preserve `410`, `429`, and `5xx` errors without falling through

Recommended response for a PT package:

```json
{
  "source": "pt_portal",
  "token": "opaque-package-document-token"
}
```

Recommended response for a legacy package:

```json
{
  "source": "legacy_firebase",
  "customer": {}
}
```

The existing `/api/lookup-customer` can remain unchanged for legacy fallback, but `ClientPortal.jsx` should call `/api/package-access` instead.

### 7.2 New `api/package-data.js`

This function should accept the PT package token, request the current package data from PT-Portal, and return the public response to the browser.

It must:

- accept `GET` only
- validate token length and allowed characters
- URL-encode the token when forwarding
- set `Cache-Control: private, no-store`
- preserve `404` and `410` semantics
- use a request timeout
- return JSON even when the upstream returns HTML or an empty response
- never log the token

### 7.3 Session Handling

Phase 1 may keep the token in React state and in the `/package-documents/:token` route because existing access vouchers already use that URL.

The preferred hardened flow is:

1. `/api/package-access` receives a valid PT token from PT-Portal
2. bookings portal stores it in an encrypted, `HttpOnly`, `Secure`, `SameSite=Lax` cookie
3. `/api/package-data` reads the cookie server-side
4. the normal post-login page uses `/documents` without exposing a fresh token in client state

The direct `/package-documents/:token` route must remain supported for QR compatibility, but it can immediately exchange the token for the secure session cookie and replace the URL using React Router navigation.

---

## 8. Source Routing Rules

Source selection must be deterministic.

```text
Reference/surname submitted
-> Ask PT-Portal
   -> 200: open PT package
   -> 404: ask legacy Firebase
   -> 410: show expired; stop
   -> 429: show throttled; stop
   -> 500/timeout: show service unavailable; stop
```

Do not fall back to Firebase on every PT-Portal error. A broad fallback could reopen an expired package or show stale legacy data for a package now controlled by PT-Portal.

If both systems contain the same reference, PT-Portal wins.

The portal should retain the resolved source for the duration of the session:

```text
pt_portal
legacy_firebase
```

Do not mix documents from both sources on one customer screen.

---

## 9. Customer Data Mapping

The existing `ClientDashboard` expects a legacy Firestore customer object. Do not force PT-Portal data into that shape throughout the UI. Introduce a normalized portal view model.

Suggested model:

```typescript
type PortalPackage = {
  source: 'pt_portal' | 'legacy_firebase'
  reference: string
  customerName: string
  packageType: string
  destination: string
  departureDate: string | null
  returnDate: string | null
  accessExpiresAt: string | null
  statusLabel: string
  publicSummary: Record<string, unknown>
  documents: PortalDocument[]
  transportVoucher: PortalTransportVoucher | null
  releasedInvoice: PortalInvoice | null
  checklist: PortalChecklistItem[]
  keyInformation: PortalKeyInformation
}
```

Suggested document category mapping:

| PT-Portal   | Customer label | Legacy category             |
| ----------- | -------------- | --------------------------- |
| `flight`    | Flights        | Flights                     |
| `hotel`     | Hotels         | Hotels                      |
| `transport` | Transport      | Transport                   |
| `visa`      | Visa           | Visa                        |
| `e_sim`     | E-Sim          | E-Sim                       |
| `insurance` | Insurance      | Insurance                   |
| `invoice`   | Invoice        | No direct legacy equivalent |
| `other`     | Other          | Others                      |

`travel_documents` is agent-only in the normal customer portal and must not be displayed even if malformed upstream data contains it.

Invoice data must be displayed only from `releasedInvoice`. Never infer invoice visibility from a document name or package status.

Transport voucher data must be displayed only when the API returns the latest `released_to_customer` voucher.

---

## 10. Customer Portal Interface

### 10.1 Login

Keep the familiar reference and surname login, but improve the following:

- accept full or partial PT reference input
- keep field labels visible on mobile
- use `autocomplete="family-name"` for surname
- show a neutral error for invalid details
- distinguish expired access from invalid details
- show a retry timer/message after `429`
- remove agent or IMS installation prompts from all customer routes

### 10.2 Package Header

Show:

- Piyam Travel logo
- package reference
- lead customer name
- package type and destination
- departure and return dates
- access expiry
- logout button

### 10.3 Main Navigation

Recommended mobile-first sections:

```text
Overview
Documents
Transport
Invoice (only when released)
```

Do not render an empty Invoice or Transport tab.

On mobile, use a compact sticky tab row or segmented navigation. Avoid a wide desktop grid compressed into the phone viewport.

### 10.4 Documents

Group documents by category. Hide empty categories.

Each document should show:

- customer-facing title
- category
- file size
- release date
- public note, when present
- Preview action
- Download action

Preview behaviour:

| File type              | Behaviour                                          |
| ---------------------- | -------------------------------------------------- |
| PDF                    | Open responsive modal/iframe using `preview_url`   |
| JPG/JPEG/PNG/WebP      | Contained image preview                            |
| HTML transport voucher | Open `preview_url` in a new tab with print support |
| Unknown/office file    | Download only                                      |

If a signed link expires while the page remains open, reload package data and retry once.

### 10.5 Transport Voucher

Show a concise structured summary from `transportVoucher.voucher_data`:

- arrival/departure details
- route timeline
- vehicle type per route
- transport provider contact when released
- driver contact when released
- public notes
- voucher version and release date

Do not show internal supplier allocation fields or route net costs.

When a released transport document is available, include a clear **View / Print voucher** action. HTML vouchers should open online rather than download as raw source.

### 10.6 Released Invoice

Show only the immutable customer snapshot returned as `releasedInvoice`:

- invoice number and version
- customer-visible line descriptions
- quantity and sold amount
- discount
- total
- amount paid
- balance due
- due date
- customer terms

Never show:

- booked supplier cost
- projected margin/profit
- expected or received commission
- internal notes
- hidden invoice lines
- draft invoice changes not released by an agent

---

## 11. Customer Updates and Checklist

The legacy portal currently lets customers update local SIM/email and toggle checklist items directly in Firestore.

For PT-Portal packages, these controls must not write to Firebase.

Phase 1 recommendation:

- render PT package checklist as read-only status
- show customer email as read-only
- direct changes to the agent through WhatsApp
- do not add customer-write APIs until the exact audit and validation rules are agreed

Future customer-write endpoints should live in PT-Portal and record audit events. They should not update Supabase directly from the bookings portal browser.

Legacy Firebase customers may retain their existing editable controls until migration.

---

## 12. Environment Variables

Add to the bookings portal Vercel project:

```text
PT_PORTAL_BASE_URL=https://<pt-portal-production-domain>
PT_PORTAL_REQUEST_TIMEOUT_MS=10000
PACKAGE_PORTAL_SESSION_SECRET=<long-random-server-only-secret>
```

Optional future hardening:

```text
PT_PORTAL_INTEGRATION_SECRET=<shared-server-only-secret>
```

Rules:

- do not use a `VITE_` prefix for secrets
- do not add Supabase service keys to the bookings portal
- do not add MinIO keys to the browser
- retain Firebase and R2 variables only while legacy access remains active
- configure the PT-Portal production base URL rather than hardcoding it

PT-Portal should retain:

```text
NEXT_PUBLIC_BOOKINGS_PORTAL_URL=https://bookings.piyamtravel.com
```

This ensures generated access links and transport voucher QR codes point to the customer portal.

---

## 13. Security Requirements

### 13.1 Authentication and Access

- Treat the document token as a password-equivalent secret.
- Never put tokens, surnames, document URLs, or customer data in application logs.
- Do not store the token in localStorage.
- Clear package state and session cookie on logout.
- Use generic invalid-login wording to avoid package enumeration.
- Preserve PT-Portal `429` rate limits.
- Reject expired or revoked access immediately.

### 13.2 Document Security

- Use only signed URLs returned by PT-Portal.
- Do not convert MinIO objects into public bucket URLs.
- Do not cache package API responses in shared caches.
- Set `Referrer-Policy: no-referrer` on token routes and document previews where practical.
- Open external document tabs with `noopener,noreferrer`.
- Sandbox HTML previews unless the HTML is opened through the controlled PT-Portal voucher endpoint.
- Do not expose internal document metadata, storage bucket names, or object keys in customer components.

### 13.3 Data Minimisation

The customer portal should receive only data needed for the customer experience.

Never expose:

- internal notes
- supplier booked costs
- employee IDs
- reservation internal notes
- commissions
- audit events
- package risk flags
- third-party share access codes
- other family/package personal data

### 13.4 API Hardening Follow-Up

PT-Portal's current public access endpoints are sufficient for initial integration. A later hardening phase should add signed server-to-server requests between the two portals while keeping customer authentication unchanged.

---

## 14. Error Handling

Customer-facing errors should be clear and calm.

| Situation               | Customer message                                                              |
| ----------------------- | ----------------------------------------------------------------------------- |
| Wrong reference/surname | Package details do not match. Check the lead passenger surname and reference. |
| Access disabled/revoked | Package documents are not currently available. Contact your agent.            |
| Access expired          | Your document access has expired. Contact your agent to renew access.         |
| Too many attempts       | Too many attempts. Please wait before trying again.                           |
| PT-Portal timeout       | The package service is temporarily unavailable. Please try again shortly.     |
| No released documents   | Your package is open, but no documents have been released yet.                |
| Signed URL expired      | Refreshing your secure document link.                                         |

Do not convert upstream `500` errors into "invalid reference" messages.

The bookings portal serverless functions must always return JSON error envelopes, even when PT-Portal returns an HTML error page.

---

## 15. Recommended File Changes in Bookings Portal

```text
api/
  package-access.js              New PT-first access resolver
  package-data.js                New PT package proxy
  lookup-customer.js             Keep as legacy-only lookup

src/
  App.jsx                        Add /package-documents/:token route
  components/
    ClientPortal.jsx             Resolve source and use normalized view model
    portal/
      PackageLogin.jsx           Shared login form
      PackagePortal.jsx          PT package customer shell
      PackageHeader.jsx
      PackageOverview.jsx
      PackageDocuments.jsx
      PackageDocumentPreview.jsx
      PackageTransportVoucher.jsx
      PackageInvoice.jsx
      PackageErrorState.jsx
  services/
    packagePortalApi.js          Browser calls to same-origin serverless APIs
  adapters/
    ptPortalPackageAdapter.js    PT response -> normalized view model
    legacyPackageAdapter.js      Firestore response -> normalized view model
  types/
    packagePortal.js             JSDoc or TypeScript contracts
```

`ClientPortal.jsx` is currently a large component containing login, dashboard, preview, checklist, and customer updates. Split it during this integration so PT and legacy behaviour do not become a chain of source-specific conditionals.

---

## 16. Implementation Phases

### Phase 1: Read-Only PT Package Support

- add `PT_PORTAL_BASE_URL`
- add `/api/package-access`
- add `/api/package-data`
- add `/package-documents/:token`
- normalize PT package response
- render released documents
- support inline preview and download
- preserve legacy Firebase login fallback
- add source-specific error handling

Exit condition:

```text
A newly converted and released PT-Portal package can be opened on
bookings.piyamtravel.com by reference/surname and by QR token.
```

### Phase 2: Released Voucher and Invoice Experience

- add structured transport voucher view
- add View / Print for released HTML/PDF voucher
- add released invoice view
- refresh expired signed URLs automatically
- improve mobile tabs and document preview

### Phase 3: Session and Security Hardening

- exchange URL token for secure cookie
- remove token from visible route after exchange where possible
- add bookings portal rate limits
- add service-to-service request signing
- add request IDs without customer data
- add security headers and no-store controls

### Phase 4: Legacy Migration Cutover

- compare migrated Firebase records with PT-Portal package folders
- mark migrated legacy records read-only
- disable legacy folder creation
- retain lookup fallback during a monitored grace period
- remove Firebase customer lookup only after access parity is confirmed
- remove R2 legacy document dependencies after retention requirements are met

---

## 17. Test Matrix

### Authentication

- full `PT-XXXXXX` reference works
- six-character reference without prefix works
- lowercase reference works
- surname normalization works for spaces, apostrophes, and hyphens
- wrong surname returns neutral error
- expired PT package returns `410` and does not open Firebase record
- revoked PT package does not open
- repeated failed attempts produce `429`
- legacy Firebase package still opens after PT `404`
- PT `500` does not fall back to stale Firebase data

### Direct Links

- `/package-documents/:token` opens from a copied access voucher link
- transport voucher QR opens the same package
- invalid token shows a controlled error
- expired token shows renewal guidance
- page refresh on token route still works through Vercel rewrite

### Documents

- only released/customer-visible documents appear
- revoked documents disappear on refresh
- new releases appear on refresh
- empty categories stay hidden
- PDF preview fits desktop and mobile modal
- image preview uses contained sizing
- HTML transport voucher opens online and prints
- download uses the filename supplied by PT-Portal
- expired signed URL refreshes once
- `travel_documents` never appears in normal customer view

### Invoice

- draft invoice is hidden
- released invoice appears
- amended but unreleased invoice does not replace the released snapshot
- only customer-visible lines appear
- booked cost, margin, and commission are absent

### Mobile

- no horizontal page overflow at 320px width
- tabs remain usable with one hand
- document actions do not overlap filenames
- preview can be closed without browser back navigation
- price/invoice tables collapse into readable rows
- no IMS install prompt appears

### Security

- no Supabase or MinIO secret exists in client bundle
- package token is absent from logs
- package responses use `private, no-store`
- logout clears customer data
- one customer cannot switch references by changing client state alone

---

## 18. Acceptance Criteria

The integration is complete when all of the following are true:

- a package created and converted in PT-Portal can open on `bookings.piyamtravel.com`
- reference plus lead surname login works
- PT-Portal access voucher links work
- transport voucher QR links work
- only released documents are visible
- document previews and downloads work using temporary signed URLs
- released transport voucher details display correctly
- released invoices display without internal financial data
- expired and revoked access is enforced
- legacy Firebase customers continue to work during the transition
- new packages are not duplicated into Firebase
- the customer experience is responsive and clear on mobile
- customer-facing routes do not show agent/IMS installation prompts

---

## 19. Decommission Conditions

The legacy agent/customer data path should be removed only after:

- all required Firebase customer folders have been migrated
- migrated document counts match
- migrated customers pass reference/surname login tests
- access expiry values are preserved or intentionally reset
- customer-visible document categories match
- a rollback report exists for failed records
- there has been a monitored period with no legacy-only customer access

Until then, the bookings portal is a dual-source customer interface, with PT-Portal taking priority for every new package.

---

## 20. Immediate Next Task

Clone or open `Piyam-Travel-LTD/piyam-travel-bookings-portal` and implement Phase 1 in this order:

1. add the PT-Portal environment configuration
2. create the server-side PT access/data adapters
3. replace direct legacy login with PT-first source resolution
4. add `/package-documents/:token`
5. create the normalized package view model
6. render released documents with preview/download controls
7. retain and test Firebase fallback
8. deploy to a preview environment
9. test one real PT package by login and QR link
10. release to `bookings.piyamtravel.com`
