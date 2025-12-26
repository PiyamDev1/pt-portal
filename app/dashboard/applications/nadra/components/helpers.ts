// Helper Functions for NADRA Ledger

export const getStatusColor = (status: string): string => {
  switch (status) {
    case 'Completed':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'In Progress':
      return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'Submitted':
      return 'bg-purple-100 text-purple-700 border-purple-200'
    case 'Cancelled':
      return 'bg-red-100 text-red-700 border-red-200'
    default:
      return 'bg-amber-50 text-amber-700 border-amber-200'
  }
}

// Auto-format CNIC to 12345-1234567-1 (NADRA Standard)
export const formatCNIC = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 13)
  if (digits.length <= 5) return digits
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`
}

// Extract nadra service record (handle array/object)
export const getNadraRecord = (item: any) => {
  return Array.isArray(item.nadra_services) ? item.nadra_services[0] : item.nadra_services
}

// Extract nicop_cnic_details (handle array/object)
export const getDetails = (nadra: any) => {
  return Array.isArray(nadra?.nicop_cnic_details)
    ? nadra?.nicop_cnic_details[0]
    : nadra?.nicop_cnic_details
}

// Count applications by status
export const countByStatus = (applications: any[], status: string): number => {
  return applications.filter((a: any) => {
    const nadra = getNadraRecord(a)
    return (nadra?.status || 'Pending Submission') === status
  }).length
}
