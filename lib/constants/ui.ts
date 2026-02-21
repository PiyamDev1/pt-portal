/**
 * UI-related constants
 * Colors, sizes, breakpoints, and common classes
 */

export const UI_COLORS = {
  PRIMARY: 'blue-900',
  PRIMARY_LIGHT: 'blue-50',
  SUCCESS: 'green-600',
  SUCCESS_LIGHT: 'green-100',
  SUCCESS_BG: 'green-50',
  ERROR: 'red-600',
  ERROR_LIGHT: 'red-100',
  ERROR_BG: 'red-50',
  WARNING: 'yellow-600',
  WARNING_LIGHT: 'yellow-100',
  WARNING_BG: 'yellow-50',
  INFO: 'blue-600',
  INFO_LIGHT: 'blue-100',
  INFO_BG: 'blue-50',
  NEUTRAL: 'slate-600',
  NEUTRAL_LIGHT: 'slate-100',
  NEUTRAL_BG: 'slate-50',
  DISABLED: 'slate-400',
  DISABLED_BG: 'slate-100',
  BORDER: 'slate-200',
  DIVIDER: 'slate-100',
} as const

export const UI_SIZES = {
  XS: 'text-xs',
  SM: 'text-sm',
  BASE: 'text-base',
  LG: 'text-lg',
  XL: 'text-xl',
  '2XL': 'text-2xl',
  '3XL': 'text-3xl',
} as const

export const UI_SPACING = {
  XS: 'p-1',
  SM: 'p-2',
  MD: 'p-4',
  LG: 'p-6',
  XL: 'p-8',
} as const

export const UI_RADIUS = {
  SM: 'rounded',
  MD: 'rounded-lg',
  LG: 'rounded-xl',
  FULL: 'rounded-full',
} as const

export const UI_SHADOWS = {
  SM: 'shadow-sm',
  MD: 'shadow-md',
  LG: 'shadow-lg',
  NONE: 'shadow-none',
} as const

export const COMMON_CLASSES = {
  BUTTON_PRIMARY: 'bg-blue-900 text-white px-4 py-2 rounded font-medium hover:bg-blue-800 transition disabled:opacity-50',
  BUTTON_SECONDARY: 'bg-slate-200 text-slate-700 px-4 py-2 rounded font-medium hover:bg-slate-300 transition disabled:opacity-50',
  BUTTON_DANGER: 'bg-red-600 text-white px-4 py-2 rounded font-medium hover:bg-red-700 transition disabled:opacity-50',
  BUTTON_SMALL: 'text-sm px-3 py-1',
  INPUT: 'p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none',
  INPUT_ERROR: 'p-2 border border-red-300 rounded focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none bg-red-50',
  SELECT: 'p-2 border border-slate-300 rounded bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none',
  TABLE_HEADER: 'bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 px-4 py-3 text-left',
  TABLE_CELL: 'px-4 py-3 border-b border-slate-100',
  TABLE_ROW: 'hover:bg-slate-50 transition',
  MODAL_HEADER: 'text-xl font-bold text-slate-800',
  MODAL_BODY: 'text-slate-600',
  BADGE: 'inline-block px-3 py-1 rounded-full text-xs font-semibold',
} as const

export const BREAKPOINTS = {
  XS: '320px',
  SM: '640px',
  MD: '768px',
  LG: '1024px',
  XL: '1280px',
  '2XL': '1536px',
} as const

export const Z_INDEX = {
  DROPDOWN: 40,
  STICKY: 50,
  FIXED: 60,
  MODAL_BACKDROP: 70,
  MODAL: 80,
  POPOVER: 90,
  TOOLTIP: 100,
} as const
