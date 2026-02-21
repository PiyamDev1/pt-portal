/**
 * API-related constants
 */

export const API_ENDPOINTS = {
  // LMS
  LMS: '/api/lms',
  LMS_INSTALLMENTS: '/api/lms/installments',
  LMS_INSTALLMENT_PAYMENT: '/api/lms/installment-payment',
  LMS_AUDIT_LOGS: '/api/lms/audit-logs',
  LMS_NOTES: '/api/lms/notes',
  LMS_PAYMENT_METHODS: '/api/lms/payment-methods',

  // NADRA
  NADRA: '/api/nadra',
  NADRA_ADD_APPLICATION: '/api/nadra/add-application',
  NADRA_MANAGE_RECORD: '/api/nadra/manage-record',
  NADRA_STATUS_HISTORY: '/api/nadra/status-history',
  NADRA_UPDATE_STATUS: '/api/nadra/update-status',

  // Passports
  PASSPORTS_PAK: '/api/passports/pak',
  PASSPORTS_GB: '/api/passports/gb',

  // Visas
  VISAS: '/api/visas',

  // Admin
  ADMIN_ADD_EMPLOYEE: '/api/admin/add-employee',
  ADMIN_RESET_PASSWORD: '/api/admin/reset-password',
  ADMIN_DISABLE_EMPLOYEE: '/api/admin/disable-enable-employee',
  ADMIN_DELETE_EMPLOYEE: '/api/admin/delete-employee',

  // Auth
  AUTH_BACKUP_CODES: '/api/auth/backup-codes',
  AUTH_GENERATE_BACKUP_CODES: '/api/auth/generate-backup-codes',
  AUTH_RESET_2FA: '/api/auth/reset-2fa',
  AUTH_SESSIONS: '/api/auth/sessions',

  // Timeclock
  TIMECLOCK_EVENTS: '/api/timeclock/events',
  TIMECLOCK_SCAN: '/api/timeclock/scan',
} as const

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const

export const PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
  DEFAULT_PAGE: 1,
} as const

export const TIMEOUT = {
  FETCH: 30000, // 30 seconds
  NOTIFICATION: 3000, // 3 seconds
  DEBOUNCE: 300, // 300ms
} as const
