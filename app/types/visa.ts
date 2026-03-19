/**
 * Visa Domain Types
 * Shared type definitions for visa metadata, forms, and application payloads.
 *
 * @module app/types/visa
 */

export interface VisaCountryOption {
  id: string
  name: string
}

export interface VisaTypeOption {
  id: string
  name: string
  default_cost?: number | null
  default_price?: number | null
  default_validity?: string | null
  country_id: string
  allowed_nationalities?: string[] | null
}

export interface VisaMetadata {
  countries: VisaCountryOption[]
  types: VisaTypeOption[]
}

export interface VisaApplicantInfo {
  first_name?: string | null
  last_name?: string | null
  passport_number?: string | null
  dob?: string | null
}

export interface VisaFormState {
  internalTrackingNo: string
  applicantName: string
  applicantPassport: string
  applicantDob: string
  applicantNationality: string
  countryId: string
  visaTypeName: string
  validity: string
  basePrice: number
  customerPrice: number
  isPartOfPackage: boolean
  status: string
}

export interface ExistingVisaApplication {
  id?: string
  internal_tracking_number?: string | null
  passport_number_used?: string | null
  applicants?: VisaApplicantInfo | null
  visa_countries?: VisaCountryOption | null
  visa_types?: Pick<VisaTypeOption, 'name'> | null
  validity?: string | null
  base_price?: number | null
  customer_price?: number | null
  is_part_of_package?: boolean | null
  status?: string | null
}

export interface VisaApplicationsClientProps {
  initialData: VisaApplicationRecord[]
  currentUserId: string
}

export interface VisaApplicationRecord {
  id: string
  status: string
  internal_tracking_number: string | null
  passport_number_used: string | null
  customer_price: number | null
  validity?: string | null
  applicants?: {
    first_name?: string | null
    last_name?: string | null
    nationality?: string | null
  } | null
  visa_countries?: VisaCountryOption | null
  visa_types?: {
    id?: string
    name: string
  } | null
}

export type SaveVisaApplicationPayload = Omit<VisaFormState, 'countryId'> & {
  currentUserId: string
  countryId: number | null
}
