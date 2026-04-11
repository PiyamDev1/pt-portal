/**
 * Module: app/dashboard/applications/passports-gb/components/types.ts
 * Dashboard module for applications/passports-gb/components/types.ts.
 */

export interface GbApplicant {
  id?: string
  first_name?: string
  last_name?: string
  passport_number?: string
  date_of_birth?: string
  phone_number?: string
}

export interface GbApplicationRef {
  id?: string
  tracking_number?: string
}

export interface GbEmployee {
  full_name?: string
}

export interface GbHistoryLog {
  id: string
  old_status?: string
  new_status: string
  changed_at: string
  notes?: string
  employees?: GbEmployee | null
}

export interface GbPassportItem {
  id: string
  status?: string
  pex_number?: string
  age_group?: string
  pages?: string
  service_type?: string
  created_at?: string
  applicants?: GbApplicant | null
  applications?: GbApplicationRef | null
}

export interface GbPricingRule {
  age: string
  pages: string
  service: string
  cost: number
  price: number
}

export interface GbMetadata {
  ages: Array<{ id: string | number; name: string }>
  pages: Array<{ id: string | number; option_label: string }>
  services: Array<{ id: string | number; name: string }>
  pricing: GbPricingRule[]
}

export interface GbEditFormData {
  id: string
  applicantName: string
  applicantPassport: string
  dateOfBirth: string
  phoneNumber: string
  pexNumber: string
  status: string
}
