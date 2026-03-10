import { formatCNIC as coreFormatCNIC, getStatusColor as coreGetStatusColor } from '@/app/lib/utils'

// Re-export from central location for backward compatibility
export const formatCNIC = coreFormatCNIC

// Wrapper to provide context for passport-specific statuses
export const getStatusColor = (status: string) => {
  return coreGetStatusColor(status, 'passport')
}

export const getPassportRecord = (item: any) => {
  const value = item?.pakistani_passport_applications
  return Array.isArray(value) ? value[0] : value
}

export const getTrackingSteps = (pp: any) => {
  return [
    { status: 'Pending', completed: pp?.status !== 'Pending Submission' },
    { status: 'Biometrics', completed: pp?.fingerprints_completed },
    { status: 'Processing', completed: ['Processing', 'Passport Arrived', 'Collected'].includes(pp?.status) },
    { status: 'Arrived', completed: !!pp?.new_passport_number },
    { status: 'Collected', completed: pp?.status === 'Collected' }
  ]
}

export const getCurrentStepIndex = (pp: any) => {
  if (pp?.status === 'Collected') return 4
  if (pp?.new_passport_number) return 3
  if (['Processing', 'Passport Arrived'].includes(pp?.status)) return 2
  if (pp?.fingerprints_completed) return 1
  return 0
}
