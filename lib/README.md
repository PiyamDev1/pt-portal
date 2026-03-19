# lib Ownership Model

Purpose: keep shared, framework-agnostic business utilities in one stable module root.

## Rules

- Use `@/lib/*` for shared utilities consumed by dashboard, API routes, and hooks.
- Avoid introducing new imports from `@/app/lib/*` in feature code.
- Keep UI-only or route-local helpers near their feature when they are not reusable.

## Migration Notes

- Transitional bridge modules exist in `lib/` for legacy `app/lib` implementations.
- During migration, update imports first (`@/app/lib/*` -> `@/lib/*`) and then move implementations.
- When moving implementations, keep exports stable to avoid breaking callers.

## Current Target Modules

- `dateFormatter`
- `errorHandler`
- `pricingOptions`
- `utils`
- `visaApi`
- `visaConstants`
- `visaTableConfig`

## Done In This Pass

- App code imports standardized to root aliases:
  - `@/app/lib/*` -> `@/lib/*`
  - `@/app/hooks/*` -> `@/hooks/*`
