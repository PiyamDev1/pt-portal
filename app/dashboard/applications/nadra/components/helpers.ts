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

export const normalizeStatus = (status: string): string => {
  const value = String(status || '').trim().toLowerCase()

  if (!value || value === 'pending') return 'Pending Submission'
  if (value === 'pending submission') return 'Pending Submission'
  if (value === 'submitted') return 'Submitted'
  if (value === 'in progress') return 'In Progress'
  if (value === 'under process') return 'Under Process'
  if (value === 'completed') return 'Completed'
  if (value === 'cancelled' || value === 'canceled') return 'Cancelled'

  if (value.includes('process')) return 'Under Process'
  if (value.includes('progress')) return 'In Progress'

  return status || 'Pending Submission'
}

export const countByStatuses = (applications: any[], statuses: string[]): number => {
  const normalized = new Set(statuses.map((status) => normalizeStatus(status)))

  return applications.filter((a: any) => {
    const nadra = getNadraRecord(a)
    if (!nadra) return false
    const currentStatus = normalizeStatus(nadra.status || 'Pending Submission')
    return normalized.has(currentStatus)
  }).length
}

// Count applications by status
export const countByStatus = (applications: any[], status: string): number => {
  return countByStatuses(applications, [status])
}
