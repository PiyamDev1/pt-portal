/**
 * Module: app/dashboard/applications/passports/components/types.ts
 * Dashboard module for applications/passports/components/types.ts.
 */

export type PakApplicationFormData = {
  applicantName: string
  applicantCnic: string
  applicantEmail: string
  applicantPhone: string
  familyHeadEmail: string
  applicationType: string
  category: string
  pageCount: string
  speed: string
  trackingNumber: string
  oldPassportNumber: string
  fingerprintsCompleted: boolean
}

export type PakApplicationCreatePayload = PakApplicationFormData & {
  currentUserId: string | number
}

export enum PakStatus {
  PendingSubmission = 'Pending Submission',
  BiometricsTaken = 'Biometrics Taken',
  Processing = 'Processing',
  Approved = 'Approved',
  PassportArrived = 'Passport Arrived',
  Collected = 'Collected',
  Cancelled = 'Cancelled',
}

export type PassportRecord = {
  id: string
  application_id: string
  application_type: string
  category: string
  page_count: string
  speed: string
  status: string
  requested_page_number?: string
  requested_page_provided?: boolean
  old_passport_number?: string
  new_passport_number?: string
  family_head_email?: string
  is_old_passport_returned: boolean
  is_refunded?: boolean
  refunded_at?: string
  old_passport_returned_at?: string
  fingerprints_completed: boolean
  notes?: string
  created_at: string
}

export type Applicant = {
  id: string
  first_name: string
  last_name: string
  citizen_number: string
  email?: string
  phone_number?: string
}

export type Application = {
  id: string
  tracking_number: string
  created_at?: string
  applicants?: Applicant | Applicant[]
  pakistani_passport_applications?: PassportRecord | PassportRecord[]
}

export type ModalState = {
  trackingNumber?: string
  applicationId?: string
  passportId?: string
}

export type TrackingStep = {
  status: string
  completed: boolean
}

export type PakUpdateRecordPayload = {
  status: string
  oldPassportReturned?: boolean
  isRefunded?: boolean
}

export type PakEditFormData = {
  id: string
  passportId?: string
  applicantId?: string
  applicantName: string
  applicantCnic?: string
  applicantEmail: string
  applicantPhone: string
  familyHeadEmail: string
  trackingNumber: string
  oldPassportNumber: string
  requestedPageNumber?: string
  requestedPageProvided?: boolean
  applicationType?: string
  category?: string
  speed?: string
  status?: string
}

export type Metadata = {
  categories: string[]
  speeds: string[]
  applicationTypes: string[]
  pageCounts: string[]
}

export type PakPassportDraftStatus =
  | 'Draft'
  | 'Documents Pending'
  | 'Ready to Process'
  | 'With External Staff'
  | 'Tracking Received'
  | 'Converted'
  | 'Cancelled'

export type PakPassportDraftPaymentStatus = 'unknown' | 'not_taken' | 'taken' | 'refunded'

export type EmployeeOption = {
  id: string
  full_name: string
}

export type PakPassportDraft = {
  id: string
  draft_id: string
  applicant_id?: string | null
  applicant_name: string
  applicant_cnic: string
  applicant_email?: string | null
  applicant_phone?: string | null
  family_head_email: string
  application_type: string
  category: string
  page_count?: string | null
  speed: string
  old_passport_number?: string | null
  fingerprints_completed: boolean
  requested_page_number?: string | null
  requested_page_provided?: boolean
  notes?: string | null
  status: PakPassportDraftStatus
  payment_status: PakPassportDraftPaymentStatus
  payment_amount?: number | string | null
  payment_note?: string | null
  payment_refunded_at?: string | null
  assigned_employee_id?: string | null
  created_by?: string | null
  updated_by?: string | null
  sent_to_external_at?: string | null
  converted_application_id?: string | null
  converted_by?: string | null
  converted_at?: string | null
  official_tracking_number?: string | null
  cancelled_at?: string | null
  cancelled_by?: string | null
  cancellation_reason?: string | null
  created_at: string
  updated_at: string
  assigned_employee?: EmployeeOption | EmployeeOption[] | null
  created_by_employee?: EmployeeOption | EmployeeOption[] | null
}

export type PakPassportDraftFormData = {
  applicantName: string
  applicantCnic: string
  applicantEmail: string
  applicantPhone: string
  familyHeadEmail: string
  applicationType: string
  category: string
  pageCount: string
  speed: string
  oldPassportNumber: string
  fingerprintsCompleted: boolean
  requestedPageNumber: string
  notes: string
  status: PakPassportDraftStatus
  assignedEmployeeId: string
  paymentStatus: PakPassportDraftPaymentStatus
  paymentAmount: string
  paymentNote: string
}
