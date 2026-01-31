/**
 * Standard error handling utilities
 * Provides consistent error handling across the application
 */

export interface ApiError {
  message: string
  code?: string
  status?: number
  originalError?: unknown
}

/**
 * Extract error message from various error formats
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as any).message)
  }

  return 'An unexpected error occurred'
}

/**
 * Standardized error handler for API calls
 */
export function handleApiError(error: unknown, context: string): ApiError {
  const message = getErrorMessage(error)
  const status = (error as any)?.status || (error as any)?.statusCode

  console.error(`[${context}] Error:`, message)

  return {
    message,
    code: (error as any)?.code,
    status,
    originalError: error
  }
}

/**
 * Format error message for user display
 */
export function formatErrorForDisplay(error: ApiError): string {
  if (error.status === 401) {
    return 'Your session has expired. Please log in again.'
  }

  if (error.status === 403) {
    return 'You do not have permission to perform this action.'
  }

  if (error.status === 404) {
    return 'The requested resource was not found.'
  }

  if (error.status && error.status >= 500) {
    return 'A server error occurred. Please try again later.'
  }

  return error.message || 'An error occurred. Please try again.'
}

/**
 * Type-safe error assertion
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const err = error as any
  return (
    err instanceof TypeError ||
    err.name === 'NetworkError' ||
    err.message?.includes('fetch') ||
    err.message?.includes('network')
  )
}
