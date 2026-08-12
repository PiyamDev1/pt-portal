# Shared Hooks

The root hook directory contains client-side behavior shared by more than one feature area.
Feature-specific hooks should remain beside their feature under `app/`.

## Public hooks

| Hook                  | Responsibility                                                    |
| --------------------- | ----------------------------------------------------------------- |
| `useMinioConnection`  | Poll document-storage health and expose manual refresh controls.  |
| `usePricingOptions`   | Load and mutate the service-pricing tables used by Settings.      |
| `useReceipt`          | Generate, list, verify, and mark application receipts as shared.  |
| `useSecuritySessions` | Load the current user's device sessions and backup-code count.    |
| `useStatementData`    | Load an LMS account statement and its installment schedules.      |
| `useStatementFilters` | Filter LMS transactions and calculate debit and credit totals.    |
| `useVisaFiltering`    | Derive visa destinations and types from nationality and metadata. |
| `useVisaFormState`    | Manage visa application form state and resets.                    |

The same surface is exported by `hooks/index.ts`. Direct module imports remain useful when a
consumer only needs one hook:

```tsx
import { useReceipt } from '@/hooks'
import { useStatementFilters } from '@/hooks/useStatementFilters'
```

## Placement rules

- Put a hook here only when it has a current consumer and is reusable outside one feature.
- Keep API response parsing and cancellation behavior inside the hook that owns the request.
- Prefer shared domain utilities from `@/lib/*`; do not duplicate formatting helpers in hooks.
- Add a focused test when a hook contains branching business logic or request orchestration.
