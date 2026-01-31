/**
 * Shared utility functions used across the application
 * Centralized to reduce duplication and improve maintainability
 */

/**
 * Format CNIC to NADRA standard: 12345-1234567-1
 * Handles both formatCNIC variations from different components
 */
export function formatCNIC(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 13)
  if (digits.length <= 5) return digits
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`
}

/**
 * Format currency values with pound symbol
 */
export function formatCurrency(value: number | string, precision = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  return `£${num.toFixed(precision)}`
}

/**
 * Parse currency input value
 */
export function parseCurrency(value: string): number {
  return parseFloat(value.replace(/[^\d.-]/g, '')) || 0
}

/**
 * Format percentage with optional decimal places
 */
export function formatPercentage(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`
}

/**
 * Calculate percentage of total
 */
export function calculatePercentage(current: number, total: number): number {
  return total === 0 ? 0 : (current / total) * 100
}

/**
 * Format large numbers with abbreviations (K, M, B)
 */
export function formatLargeNumber(value: number): string {
  if (value >= 1_000_000_000) {
    return (value / 1_000_000_000).toFixed(1) + 'B'
  }
  if (value >= 1_000_000) {
    return (value / 1_000_000).toFixed(1) + 'M'
  }
  if (value >= 1_000) {
    return (value / 1_000).toFixed(1) + 'K'
  }
  return value.toFixed(0)
}

/**
 * Handle date input with auto-formatting (DD/MM/YYYY)
 * Used across statement filters, search components, etc.
 */
export function handleDateInput(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`
}

/**
 * Get status color classes for consistent UI across app
 * Status: color mapping for badges and indicators
 */
export function getStatusColor(status: string, context: 'nadra' | 'passport' | 'visa' | 'generic' = 'generic'): string {
  // NADRA-specific statuses
  if (context === 'nadra' || !status) {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200'
      case 'in progress':
        return 'bg-blue-100 text-blue-700 border-blue-200'
      case 'submitted':
        return 'bg-purple-100 text-purple-700 border-purple-200'
      case 'cancelled':
        return 'bg-red-100 text-red-700 border-red-200'
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200'
    }
  }

  // Passport-specific statuses
  if (context === 'passport') {
    switch (status?.toLowerCase()) {
      case 'collected':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200'
      case 'passport arrived':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200'
      case 'processing':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'biometrics taken':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'pending submission':
        return 'bg-gray-100 text-gray-800 border-gray-200'
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200'
    }
  }

  // Visa-specific statuses
  if (context === 'visa') {
    switch (status?.toLowerCase()) {
      case 'approved':
        return 'bg-green-100 text-green-700 border-green-200'
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200'
      case 'rejected':
        return 'bg-red-100 text-red-700 border-red-200'
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200'
    }
  }

  // Generic status fallback
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

/**
 * Clamp a number between min and max values
 * Used for pagination and progress calculations
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Check if value is empty (null, undefined, empty string, empty array)
 */
export function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'object' && Object.keys(value).length === 0)
  )
}

/**
 * Safe object property access with fallback
 */
export function getProperty<T, K extends keyof T>(obj: T, key: K, fallback?: unknown): unknown {
  return obj?.[key] ?? fallback
}

/**
 * Sleep utility for delays (ms)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Debounce function to limit function calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null

  return function (...args: Parameters<T>) {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      func(...args)
      timeoutId = null
    }, delay)
  }
}

/**
 * Memoize a pure function to cache results
 */
export function memoize<Args extends readonly unknown[], Return>(
  fn: (...args: Args) => Return
): (...args: Args) => Return {
  const cache = new Map<string, Return>()

  return (...args: Args): Return => {
    const key = JSON.stringify(args)
    if (cache.has(key)) {
      return cache.get(key)!
    }
    const result = fn(...args)
    cache.set(key, result)
    return result
  }
}
