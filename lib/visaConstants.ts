/**
 * Visa Application Constants
 * Default form states, common nationalities, and visa types
 * Used across visa module components
 * 
 * @module lib/visaConstants
 */

import type { VisaFormState } from '@/app/types/visa'

/**
 * Nationalities shown first in applicant nationality dropdowns
 */
export const COMMON_NATIONALITIES = [
  'United Kingdom',
  'Pakistan',
  'India',
  'Bangladesh',
  'United States',
  'Travel Document',
]

/**
 * Initial/default form state for visa applications
 * Used when creating new visa application forms
 */
export const DEFAULT_VISA_FORM_STATE: VisaFormState = {
  internalTrackingNo: '',
  applicantName: '',
  applicantPassport: '',
  applicantDob: '',
  applicantNationality: '',
  countryId: '',
  visaTypeName: '',
  validity: '',
  basePrice: 0,
  customerPrice: 0,
  isPartOfPackage: false,
  status: 'Pending',
}
