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

type ErrorLike = {
  message?: unknown
  status?: unknown
  statusCode?: unknown
  code?: unknown
  name?: unknown
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const asErrorLike = (value: unknown): ErrorLike => (isObject(value) ? (value as ErrorLike) : {})

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
    return String(asErrorLike(error).message)
  }

  return 'An unexpected error occurred'
}

/**
 * Standardized error handler for API calls
 */
export function handleApiError(error: unknown, context: string): ApiError {
  const message = getErrorMessage(error)
  const err = asErrorLike(error)
  const statusCandidate = err.status ?? err.statusCode
  const status = typeof statusCandidate === 'number' ? statusCandidate : undefined

  console.error(`[${context}] Error:`, message)

  return {
    message,
    code: typeof err.code === 'string' ? err.code : undefined,
    status,
    originalError: error,
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

  const err = asErrorLike(error)
  const name = typeof err.name === 'string' ? err.name : ''
  const message = typeof err.message === 'string' ? err.message : ''
  return (
    err instanceof TypeError ||
    name === 'NetworkError' ||
    message.includes('fetch') ||
    message.includes('network')
  )
}
