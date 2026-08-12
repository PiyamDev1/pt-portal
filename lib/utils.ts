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
 * Get status color classes for consistent UI across app
 * Status: color mapping for badges and indicators
 */
export function getStatusColor(
  status: string,
  context: 'nadra' | 'passport' | 'visa' | 'generic' = 'generic',
): string {
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
      case 'approved':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200'
      case 'biometrics taken':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'pending submission':
        return 'bg-gray-100 text-gray-800 border-gray-200'
      case 'cancelled':
        return 'bg-orange-100 text-orange-800 border-orange-200'
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
