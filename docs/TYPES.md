# Type System Guide

Last updated: March 2026

## Goals

- Keep domain types in `app/types/*`.
- Avoid inline complex interfaces in feature files when reusable.
- Use root alias imports for consistency: `@/app/types/*` or `@/app/types`.

## File Map

- `app/types/auth.ts`: Auth/session/user-facing identity types
- `app/types/lms.ts`: LMS account/transaction/installment types
- `app/types/nadra.ts`: NADRA domain models
- `app/types/pricing.ts`: Pricing and tab models
- `app/types/visa.ts`: Visa metadata/form models
- `app/types/index.ts`: Barrel export for all shared types

## Conventions

- Use `interface` for object contracts that may be extended.
- Use `type` for unions/intersections and payload composition.
- Prefer `unknown` + guards over `any`.
- Keep API payloads explicit (`CreateXPayload`, `UpdateXPayload`).

## Examples

```ts
import type { VisaFormState, VisaMetadata } from '@/app/types'
```

```ts
function isErrorWithMessage(value: unknown): value is { message: string } {
  return typeof value === 'object' && value !== null && 'message' in value
}
```
