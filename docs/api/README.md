# Detailed API Documentation

Last verified against `app/api/**/route.{ts,js}`: August 23, 2026.

This directory is the field-level HTTP contract for PT-Portal. The compact
[API Reference](../technical/API_REFERENCE.md) remains the route inventory;
these domain references document authentication, inputs, response shapes,
errors, side effects, and examples for every exported handler.

## Domain references

- [Authentication, administration, scheduled work, and telemetry](AUTH_ADMIN_SCHEDULED.md)
- [Bookings, LMS, accounting, and receipts](BOOKINGS_LMS_ACCOUNTING.md)
- [Ticketing operations](TICKETING.md)
- [Packages, customer portals, groups, and pricing](PACKAGES.md)
- [Applications, passports, visas, documents, and issue reports](APPLICATIONS_DOCUMENTS.md)
- [Timeclock, Frappe, HR, training, and dashboard services](TIMECLOCK_INTEGRATIONS.md)

## Shared wire conventions

- Requests and responses use JSON unless an entry explicitly says multipart,
  binary, redirect, or HTML.
- Staff authentication is the Supabase session cookie established by the web
  client. Callers must not send a service-role key or invent actor fields.
- Public-token, cron, webhook, and physical-device routes document their own
  authentication because they intentionally do not use an ordinary staff
  cookie.
- JSON errors use `{ "error": "message" }`, sometimes with bounded diagnostic
  fields. Common statuses are `400`, `401`, `403`, `404`, `409`, `410`, `413`,
  `429`, and `503`.
- `x-request-id` can be supplied using the safe format accepted by `proxy.ts`;
  otherwise the server creates one. Private and security-sensitive responses
  are generally `private, no-store`.
- Monetary values are JSON numbers in the unit used by the corresponding
  route/database column. Timestamps are ISO 8601 strings unless a route
  explicitly documents Unix seconds.

## Authority and maintenance

The route implementation, validation schema, database migration, and focused
test remain authoritative if a deployment has moved ahead of this snapshot.
`npm run docs:check-api` enforces that every exported HTTP method has exactly
one detailed entry containing access, input, success, and error contracts.

When a route changes, update its domain entry in the same change and run:

```bash
npm run docs:check-api
npm run docs:check
npm run format:check
```
