# Integrations Guide

This guide explains the external services PT-Portal depends on, what each one is responsible for, and where to look when something breaks.

## Integration map

PT-Portal currently integrates with:

- `Supabase`
- `MinIO`
- `Mailgun`
- `Frappe HRMS`
- `GitHub Actions`

Each service has a distinct operational role. Keeping those roles clear helps a lot when debugging.

## Supabase

Supabase is the main auth and database layer.

Used for:

- user authentication
- session and identity data
- application data
- bookings and audit data
- integration identity maps
- passkeys and WebAuthn challenge persistence

Key variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Common failure signs:

- login/session issues
- route handlers failing on DB access
- missing data after a migration was not applied

## MinIO

MinIO is the primary document storage provider.

Used for:

- direct document uploads
- previews and retrieval
- long-term operational storage

Key variables:

- `MINIO_ENDPOINT`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET_NAME`
- `NEXT_PUBLIC_MINIO_ENDPOINT`

Related docs:

- [DOCUMENT_MANAGEMENT_GUIDE.md](DOCUMENT_MANAGEMENT_GUIDE.md)
- [../technical/STORAGE_SYSTEM.md](../technical/STORAGE_SYSTEM.md)

## Mailgun

Mailgun is used for outbound mail.

Typical uses:

- booking confirmation or reminder emails
- operational notification flows

Key variables:

- `MAILGUN_API_KEY`
- `MAILGUN_DOMAIN`

If email behavior looks wrong, check:

- the relevant API route
- the template or payload generation logic
- the env vars

## Frappe HRMS

Frappe is a separate HRMS environment that PT-Portal talks to over API, webhook, and signed browser handoff.

Used for:

- employee provisioning
- leave sync
- browser handoff from IMS to Frio
- webhook-driven inbound events

Key variables:

- `FRAPPE_BASE_URL`
- `FRAPPE_API_KEY`
- `FRAPPE_API_SECRET`
- `FRAPPE_WEBHOOK_SECRET`
- `FRAPPE_HANDOFF_SECRET`

Operational notes:

- PT-Portal is the main login door
- Frio can be protected so guest launches bounce back through IMS
- the handoff flow now records audit rows in Supabase

Read these together:

- [FRAPPE_HRMS_SETUP.md](FRAPPE_HRMS_SETUP.md)
- [../technical/API_REFERENCE.md](../technical/API_REFERENCE.md)

## GitHub Actions

GitHub Actions is used for automation rather than runtime application behavior.

Workflows in this repo:

- docs publishing
- smoke tests
- document migration cron
- database backups

That means operational docs should always mention both:

- runtime configuration
- repository automation configuration

## Debugging by symptom

### Login or session issues

Look at:

- Supabase env vars
- auth routes under `app/api/auth/`
- [../technical/AUTHENTICATION_FLOW.md](../technical/AUTHENTICATION_FLOW.md)

### Document upload or preview issues

Look at:

- MinIO env vars
- `app/api/documents/`
- [../technical/STORAGE_SYSTEM.md](../technical/STORAGE_SYSTEM.md)

### Booking emails or reminders not working

Look at:

- Mailgun env vars
- `app/api/bookings/`
- `app/api/cron/bookings/reminders/route.ts`
- [BOOKINGS_GUIDE.md](BOOKINGS_GUIDE.md)

### Frappe launch or employee transfer problems

Look at:

- `FRAPPE_*` env vars
- the Frappe bridge deployment
- the maintenance health panel
- handoff audit rows
- [FRAPPE_HRMS_SETUP.md](FRAPPE_HRMS_SETUP.md)

## Integration boundaries

PT-Portal should keep these boundaries clear:

- the frontend should not be the source of truth for sensitive records
- integration secrets stay server-side
- signed handoff tokens should remain short-lived
- external systems should be observable through health/status tooling

That boundary discipline is what keeps the repo maintainable as it grows.
