/**
 * API Error Handling Utilities
 * Extract consistent error messages from various error types
 * 
 * @module lib/api/error
 */

/**
 * Extract error message from various error types
 * @param error The error object (Error, string, object with message, etc.)
 * @param fallback Default message if error message cannot be extracted
 * @returns The error message string
 */
export function toErrorMessage(error: unknown, fallback = 'Unexpected error') {
  if (error instanceof Error) return error.message
  if (error && typeof (error as any).message === 'string') return (error as any).message
  return fallback
}
