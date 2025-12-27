export const formatCNIC = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 13)
  if (digits.length <= 5) return digits
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`
}

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'Collected': return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'Passport Arrived': return 'bg-indigo-100 text-indigo-800 border-indigo-200'
    case 'Processing': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    case 'Biometrics Taken': return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'Pending Submission': return 'bg-gray-100 text-gray-800 border-gray-200'
    case 'Cancelled': return 'bg-red-100 text-red-800 border-red-200'
    default: return 'bg-amber-50 text-amber-800 border-amber-200'
  }
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
