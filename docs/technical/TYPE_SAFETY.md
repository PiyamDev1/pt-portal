# Type Safety and Request Validation

Last verified against the repository: August 29, 2026.

## Supabase schema types

`types/supabase.generated.ts` is the checked-in linked-project public-schema snapshot. It is not a permissive bootstrap stub. Regenerate it after applying any linked Supabase schema change:

```bash
npm run types:supabase
```

The generator runs the current Supabase CLI against the linked project, validates that output contains `Database`, writes through a temporary file, and preserves the existing file if generation fails. Authenticate and link the Supabase CLI before running it; review and commit the resulting type diff with the migration.

`types/supabase.ts` exports the current repository `Database`: the generated snapshot plus narrow
function overrides for committed functions not yet present in the linked snapshot and nullable
PostgreSQL inputs that the generator does not preserve. The generated snapshot includes Commission
capability `2026082904`; its former table overlay has been removed. Remove a pending override after
the deployed schema is regenerated, but retain a documented semantic correction while the generated
contract would otherwise reject a valid database input. Do not hand-edit the generated file.

`getStrictSupabaseClient()` exposes `SupabaseClient<Database>` for the combined current contract. `getSupabaseClient()` uses `LegacyDatabase` from the same file: it preserves current table/view/function names but allows legacy record payloads while older callers are migrated. Do not widen the overlay or use the compatibility layer for new code merely to avoid a type error.

Cookie-scoped route clients and server-only service-role clients are separate authorization concerns. A typed service-role client still bypasses RLS; authenticate and authorize before using it.

## Domain types

Reusable UI/business contracts live in `app/types/`. Import bookings and package contracts directly from their modules; the current `app/types/index.ts` barrel exports the auth, LMS, NADRA, pricing, and visa modules only. See [Domain Type Conventions](../TYPES.md).

## HTTP boundary validation

New or changed mutation routes should:

1. Define a bounded Zod schema at the route boundary.
2. Parse with `parseBodyWithSchema()` from `lib/api/request.ts`, setting a deliberate byte limit.
3. Return `400` for invalid input and `413` for bodies over the route limit.
4. Pass only validated output to business/database code.
5. Authenticate/authorize before any service-role mutation.

A TypeScript assertion on `await request.json()` is not runtime validation. The `npm run api:check-boundaries` ratchet identifies routes that still parse raw JSON without the shared helper; its baseline is migration debt, not an approved pattern for new routes.

Multipart routes require their own byte/MIME/count checks because JSON parsing helpers do not apply. Validate uploads before persistence and enforce the route's server-side contract regardless of client checks.

## Verification

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run api:check-boundaries
npm run build
```

Run `npm run test:db:lms` or `npm run test:db:security` when a type/schema change affects those PostgreSQL contracts. Never run those fixtures against production.
