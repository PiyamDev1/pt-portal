/**
 * Service Pricing Options - Centralized dropdown options for all pricing tables
 */

export const PRICING_OPTIONS = {
  NADRA: {
    serviceTypes: ['NICOP/CNIC', 'POC', 'FRC', 'CRC', 'POA'],
    serviceOptions: [
      'Normal',
      'Executive',
      'Upgrade to Fast',
      'Modification',
      'Reprint',
      'Cancellation',
    ],
  },
  PK_PASSPORT: {
    categories: ['Adult 10 Year', 'Adult 5 Year', 'Child 5 Year'],
    speeds: ['Normal', 'Executive'],
    applicationTypes: ['First Time', 'Renewal', 'Modification', 'Lost'],
  },
  GB_PASSPORT: {
    ageGroups: ['Adult', 'Child', 'Infant'],
    pages: ['34', '48', '52'],
    serviceTypes: ['Standard', 'Express', 'Premium'],
  },
}
