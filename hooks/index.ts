/**
 * Common hooks used across the application
 * This barrel export makes imports cleaner
 */

export { useAsync } from './useAsync'
export type { AsyncState } from './useAsync'

export { useModal } from './useModal'
export type { ModalState } from './useModal'

export { usePagination } from './usePagination'

export { useFormState } from './useFormState'
export type { FormErrors } from './useFormState'

export { useTableFilters } from './useTableFilters'
export type { FilterState, SortDirection } from './useTableFilters'

// Re-export existing hooks if they exist
try {
  export { usePaymentMethods } from './usePaymentMethods'
} catch {
  // Hook doesn't exist yet
}

try {
  export { usePricingOptions } from './usePricingOptions'
} catch {
  // Hook doesn't exist yet
}
