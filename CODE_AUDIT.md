# Code Audit & Refactoring Plan

## 🧹 Cleanup Issues Found

### 1. **Backup Files to Remove** (Safe - No references)
- `app/dashboard/applications/passports/client-old.tsx.backup`
- `app/dashboard/applications/passports/client.tsx.backup`
- `app/dashboard/settings/client-old.tsx.backup`

---

## 📦 Large Files for Modularization

### 1. **ServicePricingTab.tsx** (1,465 lines) ⚠️ CRITICAL
**Issues:**
- Single giant component handling 4 service types + management tab
- 800+ lines of JSX markup
- 8 state variables for dropdowns
- Repeating patterns for NADRA, PK, GB, Visa tabs

**Refactoring Plan:**
- Extract interfaces to `types.ts`
- Extract dropdown options to `options.ts`
- Create separate tab components:
  - `NadraPricingTab.tsx`
  - `PKPassportPricingTab.tsx`
  - `GBPassportPricingTab.tsx`
  - `VisaPricingTab.tsx`
  - `ManageOptionsTab.tsx`
- Extract hooks: `useServicePricing.ts`
- Create UI components: `PricingTable.tsx`, `AddEntryForm.tsx`, `OptionsManager.tsx`

**Estimated reduction:** 1,465 → ~300 lines (main component) + modular pieces

---

### 2. **Statement Page [accountId]** (751 lines)
**Issues:**
- Page component handling too much logic
- Inline filters, calculations, exports
- Date formatting utilities mixed with component logic

**Refactoring Plan:**
- Extract date utilities to `utils/dateFormatting.ts`
- Extract hooks: `useAccountStatement.ts`, `useStatementFilters.ts`
- Extract components: `StatementFilters.tsx`, `StatementTable.tsx`, `ExportOptions.tsx`
- Move API calls to separate service layer

**Estimated reduction:** 751 → ~150 lines (page) + modular pieces

---

### 3. **TransactionModal.tsx** (622 lines)
**Refactoring Plan:**
- Extract form sections to separate components
- Extract calculations to utilities
- Extract API operations to service layer
- Reduce nesting depth

---

### 4. **NADRA Client** (537 lines)
**Refactoring Plan:**
- Extract list rendering to `NadraList.tsx`
- Extract search/filter logic
- Extract modals to separate components

---

### 5. **SecurityTab.tsx** (477 lines)
**Refactoring Plan:**
- Extract branch management to `BranchManagement.tsx`
- Extract user management to `UserManagement.tsx`
- Extract settings panel to `SecuritySettings.tsx`

---

## 🔍 Code Quality Improvements

### Issues to Fix:
1. **Missing error handling** in several API calls
2. **Type safety** - many `any` types should be properly typed
3. **Duplicate utility functions** across files
4. **Inconsistent error messages** in toast notifications
5. **No loading states** in some async operations

---

## 📋 Action Items (Priority Order)

### P0 - Critical (Do First)
- [ ] Remove backup files
- [ ] Add proper type definitions throughout
- [ ] Add error boundaries for critical components

### P1 - High Impact
- [ ] Refactor ServicePricingTab.tsx (1,465 lines)
- [ ] Extract common utilities to `lib/`
- [ ] Create service layer for API calls

### P2 - Medium Impact
- [ ] Refactor Statement page (751 lines)
- [ ] Improve error handling
- [ ] Add missing loading states

### P3 - Nice to Have
- [ ] Extract modal components
- [ ] Standardize toast notifications
- [ ] Add JSDoc comments
