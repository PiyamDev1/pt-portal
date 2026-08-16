# Changelog

Notable PT-Portal changes are recorded here. This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses semantic versioning for releases.

## Unreleased

### Added

- Native Supabase Auth passkeys with discoverable conditional sign-in, multiple named
  credentials, and in-app rename/removal management.

### Changed

- Passkey login assurance now comes from signature-verified Supabase JWT authentication-method
  claims instead of browser-controlled hints; password and Microsoft sign-in also rerun active
  employee and MFA routing checks.

### Removed

- The custom passkey challenge, credential, and magic-link proxy routes. Supabase Auth now owns
  WebAuthn challenges, counters, credential storage, and session issuance.

## 2.0.0 - 2026-08-12

### Added

- Native travel-package quotation and operations workflows, including linked-family groups, customer quote selection, reservations, invoices, payments, refunds, documents, and transport vouchers.
- Pakistani passport draft mode with department-scoped assignment and notifications.
- Application accounting reports and GB passport PEX tracking.
- Secure ESP32 timeclock integration, signed device activity, manual codes, and operational handoff documentation.
- Repository metadata, licensing, release history, and maintained documentation navigation.
- Database-backed fixed-window rate limiting with hashed identities and atomic backup-code replacement.
- Atomic, idempotent LMS ledger/installment operations and schema-capability checks.
- PostgreSQL 16 integration workflows for LMS and shared security migrations.
- Authenticated Playwright smoke coverage for security, document storage, LMS, packages, and receipts.
- Structured server observability with request correlation, secret redaction, and optional trusted alert delivery.
- App-native promise-based dialogs for confirmations and prompts.
- Field-level API contracts for every exported handler, with an exact route/method documentation coverage check in CI.

### Changed

- Upgraded the application and lint configuration to Next.js 16.3.
- Reorganized the active product, setup, technical, operations, planning, and archive documentation under `docs/`.
- Hardened password login, password changes, session revocation, backup-code lifecycle, employee onboarding, administrative password reset, and break-glass 2FA recovery.
- Standardized protected route authorization around verified cookie-backed staff sessions and narrow role/department checks.
- Hardened document and package uploads with bounded multipart parsing, scope checks, filename/MIME/extension/signature validation, private delivery, and metadata/object cleanup.
- Required fresh 2FA and shared abuse limits for destructive administrative and LMS operations.
- Split large bookings and package screens into smaller feature components/models without changing product contracts.
- Expanded CI to cover dependency audit, lint, types, API validation boundaries, unit tests, formatting, production build, database migrations, smoke tests, docs publishing, backup, and document migration.
- Reconciled active setup, architecture, API, database, security, storage, deployment, and contributor documentation with current source.

### Removed

- Native browser `alert`, `confirm`, and `prompt` usage in application flows; notifications use toasts and decisions/input use app dialogs.
- Legacy browser-supplied admin Bearer authorization paths.
- Unused generic hooks, compatibility barrels, constant modules, component wiring, and redundant type stubs identified during cleanup.

## 1.0.0 - 2026-01-15

### Added

- Initial NADRA, Pakistani passport, GB passport, visa, LMS, pricing, authentication, and dashboard features.
