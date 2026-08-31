# Usage Guide

Last verified against the repository: August 31, 2026.

PT-Portal is an internal operations application. Navigation and available actions depend on the signed-in employee's role, departments, location, and feature-specific permissions.

## Sign in and feedback

Sign in with password, passkey, or Microsoft SSO. On a compatible browser, a saved passkey can
appear in the email field's autofill menu, or the dedicated passkey button can open the device or
password-manager chooser without first asking for an email. Password sign-in can require a
matching branch code, a temporary-password change, and TOTP or a one-use backup code. If a valid
session can be resumed, the login page still reruns employee, branch, and assurance checks.

If your IMS email is also your company Microsoft 365 email, open **Settings → Security & Password
→ Microsoft work account** and choose **Link Microsoft work account**. Select the Microsoft account
with the exact same email shown in IMS. Once linked, the normal **Sign in with Microsoft** button
opens the same IMS account; it does not create a second employee profile or bypass branch, account
status, or two-factor checks.

The interface uses in-app dialogs for decisions and Sonner toast notifications for success, warning, and failure feedback. Native browser `alert`, `confirm`, and `prompt` windows are not part of the supported interaction pattern.

The browser SDK refreshes an eligible Supabase session. When it can no longer do so, return to
login; there is no separate session-expiry countdown warning. Account settings can hold multiple
named passkeys, plus 2FA/backup codes and recent-session revocation. A passkey may live on the
device, a roaming security key, or a synchronized password manager; fingerprint/face/PIN merely
unlocks that provider and is not sent to PT-Portal.

## Computer and mobile presentation

The portal chooses its presentation from the device operating system rather than reported pixel resolution:

- Windows, macOS, Linux, ChromeOS, and unknown desktop clients use the full webpage layout. A 1280 × 800 Windows office monitor therefore keeps the desktop header and dashboard.
- Android and iOS/iPadOS use the mobile app layout, including the compact header, mobile dashboard, touch sizing, and fixed bottom navigation. Mobile responses start with a phone-width layout canvas. After hydration the portal reconciles that canvas with the device's shorter reported screen dimension, capped at 480 CSS pixels. If an Android desktop-site or installed-PWA mode continues reporting a wide virtual canvas, a bounded scale fallback keeps the app at phone size. High physical pixel counts therefore cannot shrink a desktop composition to fit the phone.

The mode is selected before the page renders and applies throughout authenticated dashboard routes. The browser confirms the operating system again after hydration so a proxy-provided generic header cannot leave a phone in the desktop shell. Resizing a desktop browser does not turn it into the mobile app, and widening or rotating a phone does not turn it into the desktop portal. For testing, Settings includes a device-presentation control that persists a manual Mobile or Desktop override in that browser; **Use device default** removes the override.

The two modes are intentionally not identical. The computer layout keeps the full identity header, wide work areas, and desktop notice-board rail. The mobile app begins with a full-width sign-in surface instead of the computer login card. After sign-in its safe-area-aware top bar orders the logo, company/branch identity, stable parent-directory Back action, and menu. The dashboard uses compact two-column module tiles, a first-visit notice sheet, and persistent five-item bottom navigation; it never places the notice board in a right-hand rail. The bottom menu keeps Home in the centre and Settings at the far right. Each employee chooses two shortcuts to the left of Home and one to its right from **Settings → Security & Password → Mobile navigation**; the choice is saved to that employee's account and follows them across devices. Width-based `sm`, `md`, `lg`, and `xl` desktop composition is suppressed inside the Android/iOS dashboard shell, so Settings uses a horizontal tab rail, Timeclock uses full-width action rows and a tall camera surface, Bookings uses a compact seven-column month calendar, and Applications uses two-column service tiles with phone-sized metrics and actions. Authentication controls are at least 56 CSS pixels high, and mobile authentication pages omit the desktop footer and floating issue-report trigger so neither competes with the active form. This is a presentation difference only—role permissions and server-side validation remain the same.

## Dashboard and personal modules

The dashboard presents enabled modules and a notice board. A user can personalize dashboard module visibility and the three configurable phone-navigation slots; administrators manage shared notice slides. On mobile, a notice appears as an accessible first-visit sheet and can be dismissed for the day; on computers it rotates in the fixed-width dashboard rail. Portrait artwork is shown uncropped in a 1504:2816 display area, so the rail grows vertically rather than widening. Notice images accept JPEG, PNG, or WebP up to 5 MB and are delivered through an authenticated portal stream after the saved slide is verified. Common routes include Applications, Bookings, Packages, LMS, Accounting, Pricing, Timeclock, Training, Employee Module, Settings, and Account.

**My performance** is available to every active employee. It keeps source-attributed activity,
timeclock attendance, and earnings deliberately separate: work follows the employee who completed
or owned it, while commission follows the recipient in the effective agreement. Its earnings section
shows the employee's own effective agreement, monthly and year-to-date calculation preview, local
salary/commission view, audited GBP book equivalent, six-month chart, service breakdown, and recent
entries. Every shadow figure is labelled non-payable; it is not a payslip or payment promise. Admin commission
creates a complete agreement around one employee. Copying another agreement is only a starting
point, and future edits never change the source employee or historical versions.

The Activity, Attendance, and Earnings & commission tabs are separate URL-addressable views. Only
the selected tab's section is shown, so operational evidence, timeclock records, and pay information
do not create one long page. Opening My performance without a tab starts on Activity; old My
commissions bookmarks open Earnings & commission.

Activity counts current operational evidence rather than old ledger snapshots. Tickets are counted
when issued, assistance is reported separately, and a linked Package group counts once only after
every resolved Package file remains closed and reconciled; its passengers are counted once across
the group. Reversed, deleted, archived, reopened, or superseded work drops out. Attendance uses the
adjusted punch time where one exists, totals only valid IN-to-OUT pairs, splits overnight work at the
London month boundary, and flags unmatched punches without estimating missing hours.

The advanced engine remains available to authorised staff for reconciliation, exceptions, and
synthetic tests.

## Applications and receipts

Applications covers NADRA, Pakistani passports (including pre-tracking drafts), GB passports, and visas. Depending on service and access, staff can create/search/filter applications, change status, manage notes/complaints/refunds/custody, assign responsibility, and open the document vault.

Receipts are implemented for NADRA, Pakistani-passport, and GB-passport workflows. NADRA receipts include PIN verification; the passport variants do not. History and share audit are available from the receipt UI, and Settings exposes receipt metrics. See [Receipt Operations](RECEIPT_OPERATIONS_GUIDE.md).

## Packages

Packages is an implemented quote-to-operations workflow:

1. Build a quotation with passenger-aware flight, hotel, visa, transport, and extra options.
2. Share the tokenized customer view and let the customer save a selection.
3. Convert the accepted quotation once into an operational package folder.
4. Manage passengers, reservations/items/refunds, invoice releases/amendments, payments/plans, operations, tasks, documents, transport vouchers, and package groups.
5. Release only approved invoice/document/voucher content to the surname-and-reference customer portal or a narrower third-party document share.

Customer views show sale totals and allocations, never internal component costs. Visa cost is allocated to the affected passenger without exposing the agent's underlying visa cost. See [Travel Packages](TRAVEL_PACKAGES_GUIDE.md).

## Bookings

Bookings provides branch/service-aware availability, day/week/list operations, drafts, saved preferences, waitlist, create/edit/reschedule/status flows, manual time overrides, email confirmations/resends/reminders, attendance links, no-show tracking, history, CSV export, and reporting.

Capacity and schedule rules are enforced server-side. Manual override is an explicit staff choice, not a way to silently bypass validation. Reminder and attendance links are email-based; SMS delivery is not implemented. See [Bookings](BOOKINGS_GUIDE.md).

## LMS and accounting

LMS manages customer accounts, service/fee/payment ledger entries, installment plans, payment methods, notes, audit history, statements, and derived balances. Financial changes are persistent: verify the customer, amount, method, date, and remark before submitting.

The current ledger/installment mutations are atomic and idempotency-aware when the required `20260812` schema capability is deployed. A `503` readiness response means an administrator must apply the migration; retrying a partial browser workflow is not a schema fix.

Accounting currently includes the Applications report, with monthly source/category totals and operational analysis. It is separate from the coming-soon Commissions module.

## Pricing

Authorized staff manage service pricing for NADRA, Pakistani/GB passports, visas, and Umrah transport. Package quotations consume configured pricing plus deliberate quote-specific sale choices. Review both cost and sale fields carefully; customer-facing surfaces must receive only intended sale values.

## Timeclock and training

Timeclock supports signed QR scans, event history, team/manager views, corrections, staff manual entry, physical-device activity/health, and device-specific manual codes. Device setup/secret rotation is administrative; never copy device secrets into tickets, chat, or screenshots.

Training provides internal courses, lessons, quizzes, enrollment/attempt progress, and certifications. Course administration is permission-scoped.

## Employee Module and HRMS

The Employee Module provisions missing HRMS identity data and launches a short-lived signed handoff into the separate Frappe/Frio deployment. Administrators use Frappe Transfer and Maintenance for provisioning, health, reconciliation, and sync/outbox visibility. PT-Portal remains the authentication entry point for this flow. See [Frappe HRMS Setup](FRAPPE_HRMS_SETUP.md).

## Documents

Application and package documents are private, server-owned uploads. Use the in-app uploader, preview/download by record, and app confirmation before deletion. Application-vault uploads accept PDF/JPEG/PNG/WebP up to 1.5 MB; package uploads use the same size/type limit but different categories/release rules.

An object key is not authorization. If storage reports fallback/offline state or a migration is in progress, use the Document Storage maintenance view and [Document Management](DOCUMENT_MANAGEMENT_GUIDE.md)—do not upload directly to a bucket as a workaround.

## Settings and administration

Settings includes the browser-local Mobile/Desktop testing control for every signed-in employee. **Security & Password** is the canonical My Account screen and contains the avatar, mobile navigation choices, password, 2FA/backup codes, passkeys, and active sessions. The historic `/dashboard/account` URL redirects there so the portal does not maintain two different security screens. Depending on role, Settings can also include staff/department/location hierarchy, booking configuration, service pricing, notice board, physical timeclock devices, receipt metrics, maintenance, document storage, issue reports, and Super Admin server controls.

Destructive or infrastructure actions may require a fresh TOTP/backup code and explicit in-app confirmation. Role visibility alone does not grant an API operation; the server rechecks authorization.

## When something fails

- Read the toast/error and note the request ID when provided.
- Do not repeatedly retry a `429`; wait for `Retry-After`.
- Report a `503` readiness/security dependency error to an administrator.
- For application documents, verify scope, type, and 1.5 MB limit.
- For customer package access, verify release state, expiry, reference/surname, or third-party code/terms.
- Submit the built-in issue report without including passwords, codes, tokens, customer document contents, or other secrets.
