# Type safety and request validation

## Supabase schema types

Application code should import `Database` from `types/supabase.generated.ts` when constructing a
Supabase client. Refresh the file after every database migration:

```bash
npm run types:supabase
```

The command uses the repository's linked Supabase project and replaces the generated file only
after the CLI returns a valid `Database` definition. Authenticate and link the Supabase CLI before
running it. The bootstrap type committed with the repository is deliberately permissive so a fresh
checkout remains buildable; a generated schema replaces it in development and should be committed
with the migration that changed the database.

`getStrictSupabaseClient()` exposes the exact generated schema for new and migrated server code.
The existing `getSupabaseClient()` retains generated table-name checking through a compatibility
type while older handwritten payloads are migrated; do not use the compatibility type in new code.

## API request bodies

New or modified mutation routes should define a Zod schema at the route boundary and parse the body
with `parseBodyWithSchema` from `lib/api/request.ts`. Business logic should only receive the parsed
output. Avoid TypeScript assertions on `request.json()`: assertions do not validate runtime input.

Return HTTP 400 with the helper's error for invalid input. Keep authorization separate and perform
it before any service-role database mutation.

## Pull-request checks

The code-quality workflow runs lint, TypeScript, unit tests, production build, and Prettier checks as
separate jobs. Formatting is ratcheted over changed files so legacy formatting debt does not require
an unrelated mass rewrite. The full repository can still be audited with `npm run format:check`.
