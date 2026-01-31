/**
 * Service Pricing Options - Centralized dropdown options for all pricing tables
 */

export const PRICING_OPTIONS = {
  NADRA: {
    serviceTypes: ['NICOP/CNIC', 'POC', 'FRC', 'CRC', 'POA'],
    serviceOptions: ['Normal', 'Executive', 'Upgrade to Fast', 'Modification', 'Reprint', 'Cancellation']
  },
  PK_PASSPORT: {
    categories: ['Adult 10 Year', 'Adult 5 Year', 'Child 5 Year'],
    speeds: ['Normal', 'Executive'],
    applicationTypes: ['First Time', 'Renewal', 'Modification', 'Lost']
  },
  GB_PASSPORT: {
    ageGroups: ['Adult', 'Child', 'Infant'],
    pages: ['32', '48', '52'],
    serviceTypes: ['Standard', 'Express', 'Premium']
  }
}

/**
 * Default visa countries - can be expanded based on business needs
 */
export const DEFAULT_VISA_COUNTRIES = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Schengen (EU)',
  'Saudi Arabia',
  'UAE',
  'Singapore',
  'Malaysia',
  'Thailand',
  'Turkey'
]

/**
 * Visa types commonly offered
 */
export const VISA_TYPES = [
  'Tourist',
  'Business',
  'Work',
  'Student',
  'Family',
  'Medical',
  'Transit',
  'Resident'
]
