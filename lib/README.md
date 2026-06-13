# lib Ownership Model

Purpose: keep shared, framework-agnostic business utilities in one stable module root.

## Rules

- Use `@/lib/*` for shared utilities consumed by dashboard, API routes, and hooks.
- Keep UI-only or route-local helpers near their feature when they are not reusable.
- Do not reintroduce duplicate utility layers under `app/lib`.

## Status

- The old compatibility bridge from `app/lib` and `app/hooks` has been removed.
- Shared imports should now point directly at `@/lib/*` and `@/hooks/*`.

## Current Target Modules

- `dateFormatter`
- `errorHandler`
- `pricingOptions`
- `utils`
- `visaApi`
- `visaConstants`
- `visaTableConfig`

## Done In This Pass

- App code imports were standardized to root aliases:
  - `@/lib/*`
  - `@/hooks/*`
