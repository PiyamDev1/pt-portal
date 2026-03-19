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
