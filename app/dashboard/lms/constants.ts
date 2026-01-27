// LMS Module Constants

// Modal sizes
export const MODAL_SIZES = {
  DEFAULT: 'max-w-lg',
  LARGE: 'max-w-4xl'
} as const

// Date calculations
export const DATE_OFFSETS = {
  FIRST_PAYMENT_DAYS: 30,
  MIN_WEEKS: 3,
  MAX_WEEKS: 12
} as const

// Status colors and styles
export const STATUS_COLORS = {
  SETTLED: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200'
  },
  OVERDUE: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200'
  },
  DUE_SOON: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200'
  },
  ACTIVE: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200'
  }
} as const

export const STAT_CARD_COLORS = {
  blue: 'from-blue-50 to-blue-100 text-blue-700 border-blue-200',
  slate: 'from-slate-50 to-slate-100 text-slate-700 border-slate-200',
  red: 'from-red-50 to-red-100 text-red-700 border-red-200',
  amber: 'from-amber-50 to-amber-100 text-amber-700 border-amber-200'
} as const

// Filter options
export const FILTER_OPTIONS = ['active', 'overdue', 'all', 'settled'] as const

// Transaction types
export const TRANSACTION_TYPES = {
  SERVICE: 'service' as const,
  PAYMENT: 'payment' as const,
  FEE: 'fee' as const
} as const

// Payment frequency options
export const PAYMENT_FREQUENCIES = {
  WEEKLY: 'weekly' as const,
  BIWEEKLY: 'biweekly' as const,
  MONTHLY: 'monthly' as const
} as const

// Installment term options
export const INSTALLMENT_TERM_OPTIONS = {
  WEEKLY: (count: number) => Array.from({ length: 10 }, (_, i) => {
    const weeks = i + 3
    return { value: weeks.toString(), label: `${weeks} week${weeks === 1 ? '' : 's'}` }
  }),
  BIWEEKLY: () => [2, 4, 6, 8, 10, 12].map((weeks) => ({ 
    value: weeks.toString(), 
    label: `${weeks} weeks (bi-weekly)` 
  })),
  MONTHLY: () => [1, 2, 3, 4, 5, 6].map((months) => ({ 
    value: months.toString(), 
    label: `${months} month${months === 1 ? '' : 's'}` 
  }))
} as const

// API endpoints
export const API_ENDPOINTS = {
  LMS: '/api/lms',
  PAYMENT_METHODS: '/api/lms/payment-methods'
} as const

// Grid and layout
export const LAYOUT = {
  STAT_GRID_COLS: 'grid-cols-2 md:grid-cols-5',
  BUTTON_ICON_SIZE: 'w-6 h-6',
  MODAL_PADDING: 'p-6',
  FORM_SPACING: 'space-y-4'
} as const
