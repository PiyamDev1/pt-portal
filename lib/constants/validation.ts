/**
 * Validation rules and messages
 */

export const VALIDATION_RULES = {
  PASSWORD: {
    MIN_LENGTH: 8,
    REQUIRES_UPPERCASE: true,
    REQUIRES_LOWERCASE: true,
    REQUIRES_NUMBER: true,
    REQUIRES_SPECIAL: true,
  },
  EMAIL: {
    PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  PHONE: {
    MIN_LENGTH: 10,
  },
  NAME: {
    MIN_LENGTH: 2,
    MAX_LENGTH: 100,
  },
  AMOUNT: {
    MIN: 0.01,
    MAX: 999999.99,
  },
} as const

export const VALIDATION_MESSAGES = {
  REQUIRED: 'This field is required',
  INVALID_EMAIL: 'Please enter a valid email address',
  INVALID_PHONE: 'Please enter a valid phone number',
  PASSWORD_TOO_SHORT: `Password must be at least ${VALIDATION_RULES.PASSWORD.MIN_LENGTH} characters`,
  PASSWORD_MISSING_UPPERCASE: 'Password must contain an uppercase letter',
  PASSWORD_MISSING_LOWERCASE: 'Password must contain a lowercase letter',
  PASSWORD_MISSING_NUMBER: 'Password must contain a number',
  PASSWORD_MISSING_SPECIAL: 'Password must contain a special character',
  PASSWORDS_DONT_MATCH: 'Passwords do not match',
  NAME_TOO_SHORT: `Name must be at least ${VALIDATION_RULES.NAME.MIN_LENGTH} characters`,
  NAME_TOO_LONG: `Name must be less than ${VALIDATION_RULES.NAME.MAX_LENGTH} characters`,
  AMOUNT_INVALID: 'Please enter a valid amount',
  AMOUNT_TOO_SMALL: 'Amount must be greater than 0',
  UNAUTHORIZED: 'You do not have permission to perform this action',
  ACCOUNT_DISABLED: 'This account has been disabled',
  EMAIL_ALREADY_USED: 'This email address is already in use',
} as const

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
} as const
