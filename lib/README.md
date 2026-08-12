# Shared Library Ownership

`lib/` owns reusable domain and infrastructure code. Consumers import the module they need through
an explicit root alias such as `@/lib/api/request`; there is intentionally no catch-all `@/lib`
barrel.

## Main areas

| Area                     | Responsibility                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `api/`                   | Request parsing, consistent JSON responses, and server-side Supabase clients.        |
| `auth/`                  | Canonical staff sessions, fresh second-factor checks, passkeys, and security events. |
| `security/`              | Shared database-backed rate limiting and cryptographically secure generators.        |
| `observability/`         | Structured server events, request IDs, redaction, and operational alerts.            |
| `integrations/frappe/`   | Frappe API, provisioning, webhook, sync, and handoff contracts.                      |
| `lms/` and `accounting/` | LMS authorization and application-report aggregation.                                |
| `passports/`             | Passport pricing, draft normalization, and assignment email logic.                   |
| `services/`              | Document and receipt client/server services. Import the concrete service module.     |

Top-level modules contain shared booking, document, package, receipt, storage, timeclock, and visa
logic. Route-local or UI-only helpers should remain beside their feature instead.

## Rules

- Import concrete modules (`@/lib/...`) so client code does not accidentally pull server-only code
  through a barrel.
- Keep service credentials and privileged clients in server-only modules.
- Use `lib/api/request.ts` for bounded request parsing and `lib/api/http.ts` for standard responses.
- Use `lib/observability/server.ts` for server logging; never log credentials or raw tokens.
- Put durable schema changes in `scripts/migrations/` and regenerate Supabase types after deployment.
- Remove compatibility helpers once their final consumer has migrated.
