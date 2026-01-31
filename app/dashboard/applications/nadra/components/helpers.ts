// Helper Functions for NADRA Ledger
// Core formatting functions moved to app/lib/utils.ts

import { formatCNIC as coreFormatCNIC, getStatusColor as coreGetStatusColor } from '@/app/lib/utils'

// Re-export from central location for backward compatibility
export const formatCNIC = coreFormatCNIC
export const getStatusColor = coreGetStatusColor

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
    if (!nadra) return false
    return (nadra.status || 'Pending Submission') === status
  }).length
}
