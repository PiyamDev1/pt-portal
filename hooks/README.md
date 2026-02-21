# Shared Hooks

This directory contains reusable React hooks used across the application for common patterns.

## Available Hooks

### `useAsync<T>`
Generic hook for handling asynchronous operations with automatic loading and error state management.

**Usage:**
```tsx
const { data, loading, error, execute } = useAsync(
  async () => {
    const res = await fetch('/api/data')
    return res.json()
  },
  true // immediate execution
)
```

**Features:**
- Automatic loading state during execution
- Error state management
- Manual retry via `execute()` function
- TypeScript generic for type-safe data

**Props:**
- `fn` - Async function to execute
- `immediate` - Execute immediately on mount (default: false)

---

### `useModal`
Manages modal/dialog state including open/close, loading, and error handling.

**Usage:**
```tsx
const modal = useModal()

// Open/close
modal.open()
modal.close()

// Control state
modal.setLoading(true)
modal.setError('Error message')
modal.reset() // Reset to initial state
```

**Properties:**
- `isOpen` - Whether modal is open
- `isLoading` - Whether modal is processing
- `error` - Error message if any
- `open()` - Open modal
- `close()` - Close modal
- `setLoading(bool)` - Set loading state
- `setError(msg)` - Set error state
- `reset()` - Reset all state

---

### `usePagination`
Handles pagination logic for lists and tables.

**Usage:**
```tsx
const pagination = usePagination(50, 200) // (itemsPerPage, totalItems)

// Navigate
pagination.nextPage()
pagination.prevPage()
pagination.goToPage(3)

// Get current data
const items = allItems.slice(pagination.offset, pagination.offset + pagination.limit)
```

**Properties:**
- `page` - Current page number (1-indexed)
- `limit` - Items per page
- `offset` - Calculated offset for database queries
- `totalPages` - Total number of pages
- `hasNextPage` - Whether next page exists
- `hasPrevPage` - Whether previous page exists
- `setTotal(n)` - Update total item count
- `setLimit(n)` - Update items per page

---

### `useFormState<T>`
Manages form state including values, errors, and touched fields.

**Usage:**
```tsx
const form = useFormState(
  { name: '', email: '' },
  async (values) => {
    await submitForm(values)
  }
)

// Bind to inputs
<input
  name="name"
  value={form.values.name}
  onChange={form.handleChange}
  onBlur={form.handleBlur}
/>

// Show validation errors
{form.touched.name && form.errors.name && (
  <p>{form.errors.name}</p>
)}

// Submit form
<form onSubmit={form.handleSubmit}>
  {/* fields */}
</form>
```

**Features:**
- Automatic change tracking
- Touch tracking (knows if field was focused)
- Error state management
- Loading state during submission
- Type-safe with TypeScript generics

**Methods:**
- `handleChange(event)` - Handle input changes
- `handleBlur(event)` - Handle input blur
- `handleSubmit(event)` - Handle form submission
- `setFieldValue(name, value)` - Manually set field value
- `setFieldError(name, error)` - Manually set field error
- `setFieldTouched(name, touched)` - Manually set touched state

---

### `useTableFilters<T>`
Handles table filtering, searching, and sorting with memoization for performance.

**Usage:**
```tsx
const filters = useTableFilters(items, (item, search) => {
  return item.name.toLowerCase().includes(search.toLowerCase())
})

// Search
<input
  value={filters.search}
  onChange={(e) => filters.setSearch(e.target.value)}
/>

// Filter
filters.setFilter('status', 'active')

// Sort
filters.setSortBy('name')
filters.setSortDirection('asc')

// Render filtered results
{filters.filteredItems.map(item => (/* */)}
```

**Properties:**
- `search` - Current search query
- `filters` - Object of active filters
- `sortBy` - Current sort field
- `sortDirection` - 'asc' or 'desc'
- `filteredItems` - Filtered and sorted items
- `itemCount` - Number of filtered items

**Methods:**
- `setSearch(query)` - Update search query
- `setFilter(key, value)` - Set or update a filter
- `setSortBy(field)` - Set sort field
- `setSortDirection(dir)` - Set sort direction
- `toggleSort(field)` - Toggle sort on a field
- `clearFilters()` - Clear all filters
- `reset()` - Clear everything

---

## Best Practices

### 1. Extracting Common Patterns
If you're using the same hook logic in 2+ components, consider creating a custom hook:

```tsx
// hooks/useStaffList.ts
export function useStaffList() {
  const [staff, setStaff] = useState([])
  const { data, loading, error } = useAsync(() => fetchStaff())
  
  return { staff: data, loading, error }
}

// Usage in component
const { staff, loading } = useStaffList()
```

### 2. Combining Multiple Hooks
For complex components, you can combine several hooks:

```tsx
export function ManageStaff() {
  const form = useFormState({ name: '', email: '' }, handleSubmit)
  const list = useStaffList()
  const modal = useModal()
  
  return (/* use all three */}
}
```

### 3. Type Safety
Always provide types for better TypeScript support:

```tsx
// With typed form state
interface StaffForm {
  name: string
  email: string
  role: 'admin' | 'user'
}

const form = useFormState<StaffForm>({ /* */ })
// Now form.values has full type safety
```

### 4. Performance Optimization
The `useTableFilters` hook uses useMemo - use it when filtering large lists:

```tsx
// Won't re-calculate unless items or search changes
const filters = useTableFilters(1000+ items)
```

---

## Migration Guide

### From useState to useFormState
**Before:**
```tsx
const [values, setValues] = useState({ name: '', email: '' })
const [errors, setErrors] = useState({})
const [loading, setLoading] = useState(false)

const handleChange = (e) => {
  setValues(prev => ({ ...prev, [e.target.name]: e.target.value }))
}

// ... more handlers
```

**After:**
```tsx
const form = useFormState({ name: '', email: '' }, handleSubmit)

// Use: form.values, form.errors, form.isSubmitting
// Methods: form.handleChange, form.handleSubmit
```

---

## Contributing

When adding new hooks:
1. Keep them focused on a single responsibility
2. Provide TypeScript types and generics
3. Add JSDoc comments with usage examples
4. Update this README with documentation
5. Add unit tests for complex logic

## Testing

Example test for `useFormState`:

```tsx
import { renderHook, act } from '@testing-library/react'
import { useFormState } from '@/hooks'

describe('useFormState', () => {
  it('should update field values on change', () => {
    const { result } = renderHook(() => 
      useFormState({ name: '' }, async () => {})
    )
    
    act(() => {
      result.current.handleChange({
        target: { name: 'name', value: 'John' }
      })
    })
    
    expect(result.current.values.name).toBe('John')
  })
})
```

