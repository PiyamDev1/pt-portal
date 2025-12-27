export type PakApplicationFormData = {
  applicantName: string
  applicantCnic: string
  applicantEmail: string
  applicationType: 'First Time' | 'Renewal' | 'Modification' | 'Lost'
  category: 'Adult 10 Year' | 'Adult 5 Year' | 'Child 5 Year'
  pageCount: '34 pages' | '54 pages' | '72 pages' | '100 pages'
  speed: 'Normal' | 'Executive'
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