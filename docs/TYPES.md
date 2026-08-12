# Domain Type Conventions

Last verified against the repository: August 12, 2026.

PT-Portal separates generated database types from application/domain contracts.

## File map

| Path                          | Responsibility                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `types/supabase.generated.ts` | Last linked-project schema snapshot: tables, views, functions, enums, rows, inserts, and updates                             |
| `types/supabase.ts`           | Current `Database` overlay for committed, not-yet-regenerated migrations plus the temporary legacy-caller compatibility view |
| `app/types/auth.ts`           | User/session/navigation-facing identity contracts                                                                            |
| `app/types/bookings.ts`       | Booking, schedule, draft, waitlist, and reminder contracts                                                                   |
| `app/types/lms.ts`            | LMS accounts, transactions, installments, notes, and filters                                                                 |
| `app/types/nadra.ts`          | NADRA application and related domain contracts                                                                               |
| `app/types/packages.ts`       | Quote, selection, folder, passenger, invoice, payment, reservation, document, voucher, and group contracts                   |
| `app/types/pricing.ts`        | Pricing/configuration rows and form values                                                                                   |
| `app/types/visa.ts`           | Visa metadata and form contracts                                                                                             |
| `app/types/index.ts`          | Existing barrel for auth, LMS, NADRA, pricing, and visa only                                                                 |

Import bookings and packages directly:

```ts
import type { Booking, BookingStatus } from '@/app/types/bookings'
import type { TravelPackageFolder, TravelPackageQuote } from '@/app/types/packages'
```

The barrel is valid only for what it currently exports:

```ts
import type { VisaFormState, VisaMetadata } from '@/app/types'
```

## Conventions

- Prefer a shared domain contract when the same shape crosses multiple components, helpers, or routes.
- Keep one-off view state close to the component that owns it.
- Use `type` imports when the value is erased at runtime.
- Prefer discriminated unions for lifecycle/action variants and `unknown` plus a guard for untrusted values.
- Do not use `any`, unchecked casts, or non-null assertions to conceal an unresolved boundary.
- Name request/response contracts for their operation, such as `CreateXInput` or `XResponse`, rather than reusing a database row when the HTTP shape differs.
- Keep customer/public DTOs explicit so internal costs, audit fields, object keys, and staff-only notes cannot leak through broad spreads.

## Database contracts

Use `Database` from `types/supabase.ts` for new database access. It combines the generated snapshot with narrowly typed pending-migration additions; `LegacyDatabase` exists only to migrate older callers incrementally. After applying a migration to the linked project, run:

```bash
npm run types:supabase
```

Then remove any now-redundant pending overlay entry once the generated snapshot contains it. Never hand-edit `supabase.generated.ts` or turn the overlay into a parallel handwritten schema.

See [Type Safety and Request Validation](technical/TYPE_SAFETY.md) and [Database Schema Overview](technical/DATABASE_SCHEMA_OVERVIEW.md).
