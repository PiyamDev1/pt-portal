# Codebase Structure & Best Practices Guide

## New Directory Structure

This document outlines the refactored codebase structure and guidelines for using new utilities and components.

### Updated File Architecture

```
app/
├── api/                    # API routes
├── dashboard/              # Dashboard pages and components
├── auth/                   # Auth-related pages
├── components/             # Shared components
│   ├── index.ts           # Barrel export (NEW)
│   ├── ModalBase.tsx      # Base modal component (NEW)
│   ├── ConfirmationDialog.tsx # Confirmation dialog (NEW)
│   └── ...
├── hooks/                  # Shared hooks (REFACTORED)
│   ├── index.ts           # Barrel export (NEW)
│   ├── useAsync.ts        # Generic async hook (NEW)
│   ├── useModal.ts        # Modal state hook (NEW)
│   ├── usePagination.ts   # Pagination hook (NEW)
│   ├── useFormState.ts    # Form state hook (NEW)
│   ├── useTableFilters.ts # Filtering/sorting hook (NEW)
│   └── ...existing
├── lib/
│   ├── constants/         # Centralized constants (NEW)
│   │   ├── index.ts       # Barrel export (NEW)
│   │   ├── api.ts         # API constants (NEW)
│   │   ├── validation.ts  # Validation rules (NEW)
│   │   └── ui.ts          # UI constants (NEW)
│   ├── installmentsDb.ts
│   └── ...
└── types/                 # Type definitions
    ├── common.ts
    └── ...
```

## New Hooks - Usage Guide

### 1. `useAsync<T>` - Handle Async Operations

**Use when:** You need to fetch data, make API calls, or handle async operations.

```tsx
// Simple fetch
const { data, loading, error, execute } = useAsync(
  () => fetch('/api/data').then(r => r.json()),
  true // immediate execution
)

// With components
{loading && <Spinner />}
{error && <ErrorMessage error={error} />}
{data && <DataDisplay data={data} />}

// Manual trigger
<button onClick={() => execute()}>Retry</button>
```

### 2. `useModal` - Modal State Management

**Use when:** You need to manage modal open/close state without prop drilling.

```tsx
const modal = useModal()

<button onClick={modal.open}>Open Modal</button>

<ModalBase
  isOpen={modal.isOpen}
  onClose={modal.close}
  title="My Modal"
  isLoading={modal.isLoading}
>
  {modal.error && <ErrorMessage error={modal.error} />}
  {/* Content */}
</ModalBase>

// Control state
modal.setLoading(true)
modal.setError('Something went wrong')
modal.reset()
```

### 3. `usePagination` - Pagination Logic

**Use when:** You need to handle pagination for lists or tables.

```tsx
const pagination = usePagination(50, totalItems)

// Fetch data with pagination
const items = await fetchItems(pagination.offset, pagination.limit)
pagination.setTotal(totalItems)

// Render controls
<div className="flex gap-2">
  <button onClick={pagination.prevPage} disabled={!pagination.hasPrevPage}>
    Previous
  </button>
  <span>Page {pagination.page} of {pagination.totalPages}</span>
  <button onClick={pagination.nextPage} disabled={!pagination.hasNextPage}>
    Next
  </button>
</div>

// Direct control
pagination.goToPage(3)
pagination.setLimit(100)
```

### 4. `useFormState<T>` - Form State Management

**Use when:** You need to manage form input state, errors, and submission.

```tsx
const form = useFormState(
  { name: '', email: '', password: '' },
  async (values) => {
    await submitForm(values)
  }
)

<form onSubmit={form.handleSubmit}>
  <input
    name="name"
    value={form.values.name}
    onChange={form.handleChange}
    onBlur={form.handleBlur}
  />
  {form.touched.name && form.errors.name && (
    <p className="error">{form.errors.name}</p>
  )}

  <button disabled={form.isSubmitting}>
    {form.isSubmitting ? 'Saving...' : 'Save'}
  </button>
</form>
```

### 5. `useTableFilters<T>` - Filtering & Sorting

**Use when:** You need to filter, search, and sort table data.

```tsx
const filters = useTableFilters(items, (item, search) => {
  return item.name.toLowerCase().includes(search.toLowerCase())
})

// Search
<input
  placeholder="Search..."
  value={filters.search}
  onChange={(e) => filters.setSearch(e.target.value)}
/>

// Filters
<select
  value={filters.filters.status || ''}
  onChange={(e) => filters.setFilter('status', e.target.value)}
>
  <option value="">All</option>
  <option value="active">Active</option>
</select>

// Sorting
<th onClick={() => filters.setSortBy('name')}>
  Name {filters.sortBy === 'name' ? 
    (filters.sortDirection === 'asc' ? '▲' : '▼') : 
    ''}
</th>

// Render filtered data
{filters.filteredItems.map(item => (
  <tr key={item.id}>{/* */}</tr>
))}
<p>Showing {filters.itemCount} of {items.length}</p>
```

## New Components - Usage Guide

### 1. `ModalBase` - Consistent Modal Wrapper

**Use for:** All modals to ensure consistent styling and behavior.

**Before:**
```tsx
export function MyModal({ isOpen, onClose }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
          <h2>{title}</h2>
          <div>{children}</div>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </>
  )
}
```

**After:**
```tsx
export function MyModal({ isOpen, onClose }) {
  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      title="My Modal"
      size="md"
    >
      {children}
    </ModalBase>
  )
}
```

### 2. `ModalFooter` - Consistent Modal Actions

**Use for:** Action buttons in modals.

```tsx
<ModalBase isOpen={isOpen} onClose={onClose} title="Edit Item">
  {/* Content */}
  <ModalFooter
    onCancel={onClose}
    onSubmit={handleSave}
    submitLabel="Save"
    submitVariant="primary"
    isLoading={isSaving}
  />
</ModalBase>
```

### 3. `ConfirmationDialog` - Destructive Actions

**Use for:** Delete confirmations, dangerous operations.

```tsx
const confirmation = useConfirmation(async () => {
  await deleteItem()
})

<button onClick={confirmation.open}>Delete</button>

<ConfirmationDialog
  isOpen={confirmation.isOpen}
  onClose={confirmation.close}
  onConfirm={confirmation.handleConfirm}
  title="Delete Item?"
  message="This action cannot be undone."
  confirmLabel="Delete"
  type="danger"
  isLoading={confirmation.isLoading}
/>
```

## Constants - Usage Guide

### API Endpoints

```tsx
import { API_ENDPOINTS } from '@/lib/constants'

// Before
const res = await fetch('/api/lms')

// After (safer, single source of truth)
const res = await fetch(API_ENDPOINTS.LMS)
```

### Validation Messages

```tsx
import { VALIDATION_MESSAGES } from '@/lib/constants'

<input required placeholder="Email" />
{errors.email && <p>{VALIDATION_MESSAGES.INVALID_EMAIL}</p>}
```

### UI Classes

```tsx
import { COMMON_CLASSES } from '@/lib/constants'

<button className={COMMON_CLASSES.BUTTON_PRIMARY}>Save</button>
<input className={COMMON_CLASSES.INPUT} />
```

## Import Examples

### Before (Scattered Imports)
```tsx
import { useState } from 'react'
import { ModalBase as MB } from '@/components/ModalBase'
import { useAsync } from '@/dashboard/lms/hooks/custom'
import { API_ENDPOINTS } from '@/api/constants'
import { VALIDATION_MESSAGES } from '@/lib/validation-messages'
```

### After (Clean, Organized)
```tsx
import { useState } from 'react'
import { ModalBase, useAsync, usePagination } from '@/hooks'
import { useConfirmation } from '@/components'
import { API_ENDPOINTS, VALIDATION_MESSAGES } from '@/lib/constants'
```

## Component Structure Template

Use this structure for new components:

```typescript
// components/MyComponent/index.tsx
export { MyComponent } from './MyComponent'
export { useMyComponent } from './use'
export type { MyComponentProps } from './types'

// components/MyComponent/MyComponent.tsx
import { useMyComponent } from './use'
import type { MyComponentProps } from './types'

export function MyComponent(props: MyComponentProps) {
  // Implementation
}

// components/MyComponent/use.ts
import { useState } from 'react'

export function useMyComponent() {
  // Hook logic
}

// components/MyComponent/types.ts
export interface MyComponentProps {
  // Props
}

// components/MyComponent/__tests__/
// Add tests here
```

## Refactoring Guidelines

### When to Extract Code

1. **Repeated patterns** - If you write the same code 3+ times
2. **Large files** - If a file exceeds 300 lines
3. **Mixed concerns** - If a file handles multiple unrelated things
4. **Testing** - If logic is hard to test, extract it

### Example: Refactoring a Large Component

**Before:** `TransactionModal.tsx` (498 lines)
```tsx
export function TransactionModal({ data, onClose, onSave }) {
  const [form, setForm] = useState({ /* 10+ fields */ })
  const [loading, setLoading] = useState(false)
  // ... 50 lines of state logic
  // ... 200 lines of form handling
  // ... 150 lines of JSX
}
```

**After:** Modularized

```tsx
// hooks/useTransactionForm.ts
export function useTransactionForm(type: string) {
  const [form, setForm] = useState({ /* */ })
  // Form logic (50 lines)
  return { form, setForm, /* methods */ }
}

// components/TransactionModal/TransactionForm.tsx
export function TransactionForm({ form, onSubmit }) {
  // Form JSX (80 lines)
}

// components/TransactionModal/index.tsx
export function TransactionModal({ data, onClose, onSave }) {
  const form = useTransactionForm(data.type) // 1 line
  const [loading, setLoading] = useState(false)
  // 30 lines of handler
  return (
    <ModalBase isOpen onClose={onClose} title="Transaction">
      <TransactionForm form={form} onSubmit={handleSubmit} />
      <ModalFooter onCancel={onClose} onSubmit={handleSave} />
    </ModalBase>
  )
}
```

## Testing New Utilities

```tsx
// __tests__/hooks/usePagination.test.ts
import { renderHook, act } from '@testing-library/react'
import { usePagination } from '@/hooks'

describe('usePagination', () => {
  it('should calculate offset correctly', () => {
    const { result } = renderHook(() => usePagination(50, 200))
    
    expect(result.current.offset).toBe(0)
    
    act(() => {
      result.current.goToPage(2)
    })
    
    expect(result.current.offset).toBe(50)
  })
})
```

## Migration Checklist for Old Files

When refactoring existing large components:

- [ ] Extract state management → custom hooks
- [ ] Extract form handling → `useFormState`
- [ ] Extract modals → `ModalBase`
- [ ] Extract constants → `/lib/constants`
- [ ] Replace duplicated code with shared hooks
- [ ] Update imports to use barrel exports
- [ ] Add type definitions to `app/types`
- [ ] Add unit tests for extracted utilities
- [ ] Update component documentation
- [ ] Verify all existing tests still pass

## Performance Considerations

### Memoization
```tsx
import { useMemo, useCallback } from 'react'

// Expensive calculations
const filtered = useMemo(
  () => filters.filteredItems,
  [filters.filteredItems]
)

// Stable callbacks
const handleClick = useCallback(() => {
  // Handler
}, [dependencies])
```

### Code Splitting
Use `React.lazy()` for large modals or sections:

```tsx
const TransactionModal = React.lazy(
  () => import('./TransactionModal')
)

// In component
<Suspense fallback={<Spinner />}>
  <TransactionModal />
</Suspense>
```

## Next Steps

1. **Review this structure** with your team
2. **Start using new hooks** in new features
3. **Refactor old components** one at a time
4. **Add tests** for extracted utilities
5. **Document patterns** for team

## Questions or Issues?

Refer to:
- CODEBASE_REFACTORING_PLAN.md - Overall strategy
- Individual component README files
- Hook type definitions for prop signatures
