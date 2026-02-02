export type PakApplicationFormData = {
  applicantName: string
  applicantCnic: string
  applicantEmail: string
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
  Processing = 'Processing',
  PassportArrived = 'Passport Arrived',
  Collected = 'Collected',
}