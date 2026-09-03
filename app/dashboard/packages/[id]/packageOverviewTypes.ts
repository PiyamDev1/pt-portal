import type {
  TravelPackageDocument,
  TravelPackageDocumentCategory,
  TravelPackageFolder,
  TravelPackageGroup,
  TravelPackageInvoice,
  TravelPackageInvoiceStatus,
  TravelPackageReservation,
  TravelPackageReservationItem,
  TravelPackageReservationItemStatus,
  TravelPackageReservationItemType,
  TravelPackageReservationStatus,
  TravelPackageReservationType,
  TravelPackageThirdPartyDocumentShare,
} from '@/app/types/packages'
import type { TravelPackageGroupDetail } from '@/lib/packageGroups'

export type PackageWorkspaceTab = 'overview' | 'documents' | 'reservations' | 'invoice'

export type PackageEmployeeOption = {
  id: string
  full_name: string | null
  email?: string | null
  location_id?: string | null
  locations?:
    | { id?: string | null; name?: string | null; branch_code?: string | null }
    | Array<{ id?: string | null; name?: string | null; branch_code?: string | null }>
    | null
}

export type PackageLocationOption = {
  id: string
  name: string
  branch_code?: string | null
}

export type PackageOverviewClientProps = {
  packageId: string
  employees?: PackageEmployeeOption[]
  locations?: PackageLocationOption[]
}

export type PackageResponse = {
  package?: TravelPackageFolder | null
  setupRequired?: boolean
  message?: string
  error?: string
}

export type ReservationsResponse = {
  reservations?: TravelPackageReservation[]
  reservation?: TravelPackageReservation | null
  items?: TravelPackageReservationItem[]
  item?: TravelPackageReservationItem | null
  setupRequired?: boolean
  message?: string
  error?: string
}

export type DocumentsResponse = {
  documents?: TravelPackageDocument[]
  document?: TravelPackageDocument | null
  setupRequired?: boolean
  message?: string
  error?: string
}

export type ThirdPartySharesResponse = {
  shares?: TravelPackageThirdPartyDocumentShare[]
  share?: TravelPackageThirdPartyDocumentShare | null
  shareUrl?: string
  accessCode?: string
  setupRequired?: boolean
  message?: string
  error?: string
}

export type InvoiceResponse = {
  invoice?: TravelPackageInvoice | null
  setupRequired?: boolean
  message?: string
  error?: string
}

export type PackageGroupsResponse = {
  groups?: TravelPackageGroup[]
  setupRequired?: boolean
  message?: string
  error?: string
}

export type PackageGroupResponse = {
  group?: TravelPackageGroupDetail | TravelPackageGroup | null
  setupRequired?: boolean
  message?: string
  error?: string
}

export type ReservationFormState = {
  reservationType: TravelPackageReservationType
  title: string
  status: TravelPackageReservationStatus
  supplierName: string
  supplierReference: string
  bookedCostTotal: string
  soldPriceTotal: string
  discountTotal: string
  commissionExpectedTotal: string
  depositRequired: boolean
  depositAmount: string
  paymentDueAt: string
  internalNotes: string
}

export type ReservationItemFormState = {
  itemType: TravelPackageReservationItemType
  title: string
  status: TravelPackageReservationItemStatus
  quantity: string
  unitBookedCost: string
  unitSoldPrice: string
  discountAmount: string
  commissionExpectedAmount: string
  supplierReference: string
  description: string
}

export type ReservationDetailFormState = {
  reservationType: TravelPackageReservationType
  title: string
  status: TravelPackageReservationStatus
  supplierName: string
  supplierReference: string
  bookingReference: string
  internalNotes: string
}

export type ReservationFinancialFormState = {
  bookedCostTotal: string
  soldPriceTotal: string
  discountTotal: string
  commissionExpectedTotal: string
  depositRequired: boolean
  depositAmount: string
  paymentDueAt: string
}

export type ReservationRefundFormState = {
  refundKind: 'supplier' | 'customer'
  amount: string
  paymentMethod: 'cash' | 'bank_transfer' | 'card' | 'other'
  reference: string
  reason: string
}

export type QuoteReservationPrefill = {
  key: string
  reservationType: TravelPackageReservationType
  title: string
  bookedCostTotal?: number
  soldPriceTotal: number
  discountTotal?: number
  internalNotes: string
  sourceLabel: string
  metadata?: Record<string, unknown>
}

export type InvoiceFormState = {
  status: TravelPackageInvoiceStatus
  subtotalSold: string
  discountTotal: string
  totalPaid: string
  totalBookedCost: string
  expectedCommissionTotal: string
  receivedCommissionTotal: string
  releasedToCustomer: boolean
  customerTerms: string
  internalNotes: string
  dueAt: string
  amendmentReason: string
}

export type ThirdPartyShareFormState = {
  label: string
  recipientName: string
  purpose: string
  expiresAt: string
  allowedCategories: TravelPackageDocumentCategory[]
}
