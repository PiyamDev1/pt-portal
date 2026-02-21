# Codebase Cleanup & Maintenance Guide

This document provides guidelines for maintaining a clean, organized codebase.

## Completed Cleanup Tasks ✅

### Phase 1: Refactoring Foundation (Completed)
- [x] Extracted reusable hooks (`useAsync`, `useModal`, `usePagination`, `useFormState`, `useTableFilters`)
- [x] Centralized constants (`api.ts`, `validation.ts`, `ui.ts`)
- [x] Created reusable components (`ModalBase`, `ConfirmationDialog`)
- [x] Set up barrel exports for clean imports
- [x] Created comprehensive documentation

### Phase 2: Code Organization (Completed)
- [x] Organized hooks with clear categorization
- [x] Organized constants by feature/purpose
- [x] Organized components with reusable patterns
- [x] Added README files with usage examples

### Phase 3: Documentation (Completed)
- [x] Created `hooks/README.md` with hook documentation
- [x] Created `components/README.md` with component patterns
- [x] Created `lib/constants/README.md` with constant usage
- [x] Updated `CODEBASE_REFACTORING_PLAN.md` to focus on cleanup
- [x] Updated `CODEBASE_STRUCTURE_GUIDE.md` with patterns

---

## Current Code Quality Status 📊

### Strong Areas
✅ New modules have:
- TypeScript with strict types
- JSDoc documentation
- Tree-shaking friendly exports
- Zero unused dependencies
- Clear naming conventions
- Proper error handling

### Areas for Future Improvement
⚠️ Legacy code has:
- Some console.error statements (for debugging, acceptable)
- Large component files (400+ lines)
- Mixed concerns in some API routes
- Scattered constants

**Action:** Legacy code cleanup deferred to Phase 2-4 per user request

---

## File Organization Standards

### ✅ Correct Structure
```
feature/
├── index.tsx         # Main export
├── Feature.tsx       # Implementation
├── use.ts           # Custom hooks
├── types.ts         # Type definitions
├── utils.ts         # Helper functions
└── components/      # Sub-components
    ├── SubComponent.tsx
    └── index.ts
```

### ✅ Correct Imports
```tsx
// Good: Using barrel exports
import { useAsync, useModal } from '@/hooks'
import { ModalBase } from '@/components'
import { API_ENDPOINTS, COLORS } from '@/lib/constants'

// Good: Path aliases
import { MyComponent } from '@/dashboard/my-feature'

// Avoid: Deep imports
// import { useAsync } from '@/hooks/useAsync'
```

### ✅ Correct Naming
```tsx
// Components: PascalCase
export function MyComponent() {}

// Hooks: usePrefix camelCase
export function useMyHook() {}

// Constants: UPPER_SNAKE_CASE
export const MY_CONSTANT = 'value'

// Utilities: camelCase
export function myUtilFunction() {}
```

---

## Code Quality Checklist

Before committing code, verify:

### TypeScript
- [ ] No `any` types (use `unknown` if needed)
- [ ] All function parameters typed
- [ ] Return types specified for hooks
- [ ] Proper use of generics
- [ ] No type assertion (`as Type`)

### Documentation
- [ ] Function/component has JSDoc
- [ ] Complex logic has comments
- [ ] README updated if adding new directory
- [ ] Usage examples provided

### Testing
- [ ] Critical hooks have tests
- [ ] Edge cases handled
- [ ] Error states tested
- [ ] Loading states work correctly

### Performance
- [ ] No unnecessary re-renders
- [ ] useMemo/useCallback used appropriately
- [ ] No N+1 data fetching
- [ ] Images optimized
- [ ] Bundle size considered

### Accessibility
- [ ] Proper semantic HTML
- [ ] ARIA labels where needed
- [ ] Keyboard navigation works
- [ ] Color contrast sufficient
- [ ] Focus management correct

---

## Common Cleanup Tasks

### Remove Unused Components

**Before:**
```tsx
// dashboard/old-component.tsx
export function OldComponent() {
  // Old implementation
}
```

**Action:**
1. Search for usages: `grep -r "OldComponent" app`
2. If no usages, rename with `.deprecated` suffix
3. Add deprecation message in JSDoc
4. Remove after 2 weeks

### Consolidate Duplicate Constants

**Before:**
```tsx
// Multiple files with same constant
export const API_URL = 'https://api.example.com'
export const API_BASE_URL = 'https://api.example.com'
```

**Action:**
1. Add to `/lib/constants/api.ts`
2. Replace imports in all files
3. Delete from individual files

### Remove Unused Imports

**TypeScript check:**
```bash
npx tsc --noEmit
```

**Editor check:**
- VS Code: Right-click file → "Refactor" → "Organize Imports"

### Fix Import Organization

Use the new constants barrel export:

**Before:**
```tsx
import { useAsync } from '@/dashboard/lms/hooks/useAsync'
import { COLORS } from '@/lib/colors'
import { API_ENDPOINTS } from '@/api/endpoints'
```

**After:**
```tsx
import { useAsync } from '@/hooks'
import { COLORS, API_ENDPOINTS } from '@/lib/constants'
```

---

## Refactoring Guidelines

### When to Refactor
✅ When:
- File exceeds 300 lines
- Same code appears 3+ times
- Component has 10+ useState calls
- Adding new feature to old code
- Test coverage is difficult

❌ Don't:
- Refactor working code without tests
- Refactor in same PR as feature
- Break backward compatibility unnecessarily
- Refactor code you don't understand

### Refactoring Workflow
1. **Create branch:** `refactor/feature-name`
2. **Write tests first:** Capture current behavior
3. **Make small changes:** Commit often
4. **Verify tests pass:** Ensure nothing breaks
5. **Update documentation:** Document changes
6. **Create PR:** For review

### Using New Utilities

Replace common patterns with hooks:

**Before:**
```tsx
const [items, setItems] = useState([])
const [loading, setLoading] = useState(false)
const [error, setError] = useState(null)

useEffect(() => {
  fetchItems()
}, [])

const fetchItems = async () => {
  setLoading(true)
  try {
    const data = await api.getItems()
    setItems(data)
  } catch (err) {
    setError(err.message)
  } finally {
    setLoading(false)
  }
}
```

**After:**
```tsx
const { data: items, loading, error } = useAsync(() => api.getItems(), true)
```

---

## Maintenance Schedule

### Daily
- Review for obvious issues
- Fix TypeScript errors
- Monitor console warnings

### Weekly
- Check for unused code
- Review PR feedback patterns
- Update broken links in docs

### Monthly
- Audit large files
- Check for deprecated APIs
- Update dependencies safely

### Quarterly
- Major refactoring review
- Performance audit
- Security vulnerability check

---

## Documentation Updates

### When Adding Features
1. Update relevant README
2. Add usage examples
3. Document type definitions
4. Add inline JSDoc comments

### When Removing Code
1. Check if documented
2. Update README if needed
3. Note in git commit message
4. Update migration guides if breaking

### When Adding Constants
1. Organize by category
2. Add to barrel export
3. Document with examples
4. Update constants README

---

## Performance Considerations

### Bundle Size
Keep components small and focused:
- Aim for <100 lines per component
- Extract sub-components for large UI
- Use dynamic imports for heavy features

### Runtime
Optimize data fetching:
- Use pagination for large lists
- Debounce search/filter inputs
- Memoize expensive calculations
- Avoid deep re-renders

### Examples
```tsx
// Good: Memoized sorting
const filtered = useMemo(
  () => items.filter(item => item.name.includes(search)),
  [items, search]
)

// Bad: Recreates on every render
const filtered = items.filter(item => item.name.includes(search))
```

---

## Common Issues & Fixes

### Issue: Import From Deep Path
**Problem:** `import { useAsync } from '@/hooks/useAsync'`
**Solution:** `import { useAsync } from '@/hooks'` (use barrel export)

### Issue: Magic Strings/Numbers
**Problem:** `const API_URL = 'https://api.example.com'` in component
**Solution:** Move to `/lib/constants/api.ts`

### Issue: Large Component File
**Problem:** Component with 500+ lines and 15+ useState calls
**Solution:** Extract into smaller components and custom hooks

### Issue: Duplicate Validation Rules
**Problem:** Email regex defined in multiple components
**Solution:** Move to `/lib/constants/validation.ts`

### Issue: Unused Imports
**Problem:** `import { Component } from '@/components'` but not used
**Solution:** Remove or use refactoring tool

---

## Contributing Standards

### Before Creating Pull Request
- [ ] Code passes TypeScript: `npx tsc --noEmit`
- [ ] Follows naming conventions
- [ ] Updated documentation
- [ ] No console warnings/errors
- [ ] Imports organized
- [ ] Tests pass (if applicable)

### PR Template
```markdown
## Description
What does this change do?

## Type
- [ ] Cleanup
- [ ] Refactoring
- [ ] Documentation
- [ ] Bug fix
- [ ] Feature

## Changes
- List key changes

## Testing
- How to verify the changes

## Related
- Closes #123
```

---

## Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React Best Practices](https://react.dev/learn)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Next.js Docs](https://nextjs.org/docs)

---

## Questions?

Refer to:
- `CODEBASE_STRUCTURE_GUIDE.md` - Architecture and patterns
- `CODEBASE_REFACTORING_PLAN.md` - Refactoring strategy
- `hooks/README.md` - Hook usage
- `components/README.md` - Component patterns
- `lib/constants/README.md` - Constants organization

