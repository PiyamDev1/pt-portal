/**
 * Module: app/dashboard/applications/passports/components/utils.ts
 * Dashboard module for applications/passports/components/utils.ts.
 */

import { formatCNIC as coreFormatCNIC, getStatusColor as coreGetStatusColor } from '@/lib/utils'
import type { Application, Applicant, PassportRecord, TrackingStep } from './types'

// Re-export from central location for backward compatibility
export const formatCNIC = coreFormatCNIC

// Wrapper to provide context for passport-specific statuses
export const getStatusColor = (status: string) => {
  return coreGetStatusColor(status, 'passport')
}

export const getPassportRecord = (item: Application): PassportRecord | undefined => {
  const value = item?.pakistani_passport_applications
  return Array.isArray(value) ? value[0] : value
}

export const getApplicantRecord = (item: Application): Applicant | undefined => {
  const value = item?.applicants
  return Array.isArray(value) ? value[0] : value
}

export const getTrackingSteps = (pp?: PassportRecord): TrackingStep[] => {
  const status = pp?.status || ''
  return [
    { status: 'Pending', completed: pp?.status !== 'Pending Submission' },
    { status: 'Biometrics', completed: Boolean(pp?.fingerprints_completed) },
    {
      status: 'Processing',
      completed: ['Processing', 'Approved', 'Passport Arrived', 'Collected'].includes(status),
    },
    {
      status: 'Approved',
      completed: ['Approved', 'Passport Arrived', 'Collected'].includes(status),
    },
    { status: 'Arrived', completed: !!pp?.new_passport_number },
    { status: 'Collected', completed: pp?.status === 'Collected' },
  ]
}

export const getCurrentStepIndex = (pp?: PassportRecord) => {
  const status = pp?.status || ''
  if (pp?.status === 'Collected') return 5
  if (pp?.new_passport_number) return 4
  if (['Approved', 'Passport Arrived'].includes(status)) return 3
  if (pp?.status === 'Processing') return 2
  if (pp?.fingerprints_completed) return 1
  return 0
}
