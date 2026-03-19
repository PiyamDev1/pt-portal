/**
 * NADRA Service Type Definitions
 * Comprehensive types for NADRA (National Database & Registration Authority) applications
 * Includes persons, applications, services, history entries, and family groups
 * 
 * @module app/types/nadra
 */

/**
 * NADRA person (applicant or family head)
 */
export interface NadraPerson {
  id: string
  first_name: string | null
  last_name: string | null
  citizen_number: string | null
  phone_number?: string | null
  email?: string | null
}

export interface NadraEmployee {
  id: string
  full_name: string | null
}

export interface NadraServiceDetails {
  service_option?: string | null
}

export interface NadraServiceRecord {
  id: string
  service_type?: string | null
  status?: string | null
  is_refunded?: boolean | null
  refunded_at?: string | null
  application_pin?: string | null
  tracking_number?: string | null
  created_at?: string | null
  employee_id?: string | null
  notes?: string | null
  nicop_cnic_details?: NadraServiceDetails | NadraServiceDetails[] | null
  employees?: NadraEmployee | NadraEmployee[] | null
}

/**
 * NADRA application document with applicant and services
 */
export interface NadraApplication {
  id: string | null
  tracking_number: string | null
  family_head_id: string | null
  family_heads?: NadraPerson | null
  applicants?: NadraPerson | null
  nadra_services?: NadraServiceRecord | NadraServiceRecord[] | null
  created_at?: string | null
}

export interface NadraHistoryEntry {
  id: string
  entryType: string
  status: string | null
  complaintNumber: string | null
  details: string
  changed_by: string
  date: string
}

/**
 * NADRA family processing group
 * Contains a family head and all their related applications
 */
export interface NadraFamilyGroup {
  head: NadraPerson | null | undefined
  members: NadraApplication[]
}

export interface NadraClientProps {
  initialApplications: NadraApplication[]
  currentUserId: string
  initialComplainedNadraIds?: string[]
}

export type NadraEditType = 'application' | 'family_head'

export interface NadraEditFormData {
  id?: string
  applicationId?: string
  applicantId?: string
  firstName?: string
  lastName?: string
  cnic?: string
  newBorn?: boolean
  email?: string
  phone?: string
  serviceType?: string
  serviceOption?: string
  trackingNumber?: string
  pin?: string
  employeeId?: string
  employeeName?: string
  notes?: string
}
