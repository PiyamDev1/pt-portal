# Usage Guide

This guide explains the main product areas in PT-Portal from an operator or admin point of view.

## What PT-Portal is used for

PT-Portal supports the daily internal workflows for:

- travel document applications
- branch appointment bookings
- pricing and service configuration
- LMS and payment tracking
- employee/admin settings
- document upload and storage review
- Frappe HRMS handoff and provisioning

The exact menu you see depends on your role.

## Main navigation

Most users work from the left-side dashboard navigation.

Primary sections:

- `Dashboard`
- `Applications`
- `Bookings`
- `LMS`
- `Pricing`
- `Settings`
- `Timeclock`

Admins and maintenance roles see more settings and operational tools than standard staff.

## Applications

The applications area is split by service type:

- NADRA services
- Pakistani passports
- GB passports
- visa applications

Common actions across these modules:

- create a new application
- search and filter existing records
- update statuses
- add notes
- review or attach supporting documents
- generate or review receipts when enabled

The UI pattern varies a little by module, but the operational idea is consistent: staff create or update service records, then track their lifecycle through the application dashboard.

## Bookings

The bookings module is the newest large operational area and is still evolving.

Current capabilities include:

- branch-aware appointment scheduling
- service-based slot generation
- appointment rescheduling and edits
- reminder emails
- waitlist support
- no-show flags and penalties
- operational history and audit visibility

For the current implementation state and limitations, use [BOOKINGS_GUIDE.md](BOOKINGS_GUIDE.md).

## LMS and payments

The LMS section is used for account and transaction management.

Typical workflows:

- review customer balances
- add transactions
- manage installment plans
- view payment history
- print or export statements

This is operational data, so staff should treat edits carefully and use the built-in review steps before finalizing changes.

## Pricing

The pricing section is for service pricing administration.

Typical actions:

- update service sale prices
- maintain cost price data
- manage price variants by service
- review current configured values before operational use

Pricing changes affect downstream staff workflows, so this area is usually limited to authorized admin roles.

## Settings

Settings is the main admin console. It covers:

- account security
- staff management
- branches and locations
- hierarchy
- issue reports
- maintenance operations
- Frappe transfer/provisioning

Important operational panels:

- `Frappe Transfer`
- `Data Maintenance`
- `Document Storage`
- `Receipt Metrics`

## Employee module and Frappe HRMS

The employee-facing HRMS path is intentionally IMS-controlled.

Expected flow:

1. The user opens `Employee Module` inside IMS.
2. If it is the first time, PT-Portal collects the missing HRMS fields it needs.
3. If the user is already linked, IMS signs a short-lived handoff into Frio HRMS.
4. Direct Frio guest access is not the primary login path once enforcement is enabled.

Admins can also manage transfer readiness from the `Frappe Transfer` settings area.

For the underlying implementation and deployment details, use [FRAPPE_HRMS_SETUP.md](FRAPPE_HRMS_SETUP.md) and [INTEGRATIONS_GUIDE.md](INTEGRATIONS_GUIDE.md).

## Document management

Document flows exist both inside service modules and in dedicated maintenance/preview views.

Typical operations:

- upload files
- preview files
- generate thumbnails for PDFs
- categorize or re-check stored items
- diagnose storage/provider status

For document-specific behavior, use [DOCUMENT_MANAGEMENT_GUIDE.md](DOCUMENT_MANAGEMENT_GUIDE.md).

## Security and login

The portal supports:

- Supabase-backed login
- 2FA setup and verification
- backup codes
- session warnings
- mobile passkeys/biometric login
- PWA install prompts

The login and account experience can differ slightly between desktop, normal mobile browser, and installed PWA mode.

## What is still evolving

Some parts of the system are stable and established. Others are still being refined operationally.

Areas to treat as active work:

- branch bookings rules and operational policy details
- paired IMS and Frio mobile/PWA behavior
- some Frappe synchronization and handoff monitoring workflows

That does not mean these features are unusable. It means the docs reflect the current state honestly so staff and developers know where process and code may still move.
