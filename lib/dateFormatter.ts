/**
 * Date Formatting Utilities - Centralized date operations
 * Handles conversion between ISO, display (DD/MM/YYYY), and locale formats
 */

/**
 * Convert ISO date string (YYYY-MM-DD) to display format (DD/MM/YYYY)
 * @param isoDate - ISO format date string (e.g., "2024-01-15")
 * @returns Display format string (e.g., "15/01/2024")
 */
export const formatToDisplayDate = (isoDate: string): string => {
  if (!isoDate) return ''
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

/**
 * Convert display format date (DD/MM/YYYY) to ISO format (YYYY-MM-DD)
 * @param displayDate - Display format string (e.g., "15/01/2024")
 * @returns ISO format string (e.g., "2024-01-15")
 */
export const formatToISODate = (displayDate: string): string => {
  if (!displayDate) return ''
  const [day, month, year] = displayDate.split('/')
  return `${year}-${month}-${day}`
}

/**
 * Validate if date string is in DD/MM/YYYY format
 * @param dateString - Date string to validate
 * @returns True if valid DD/MM/YYYY format
 */
export const isValidDateFormat = (dateString: string): boolean => {
  const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/
  if (!dateRegex.test(dateString)) return false

  const [day, month, year] = dateString.split('/').map(Number)

  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  if (year < 1900 || year > 2100) return false

  return true
}

/**
 * Auto-format date input into DD/MM/YYYY as user types
 * @param value - Raw input value
 * @returns Formatted date string
 */
export const handleDateInput = (value: string): string => {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`
}
