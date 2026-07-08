/**
 * Travel package quote types.
 *
 * The package creator starts from the old hotel combiner idea, but stores a
 * richer quote payload that can mix stays, flights, and transport.
 */

export type TravelPackageType = 'umrah' | 'ziyarat' | 'holiday'
export type TravelPackageStatus = 'draft' | 'shared' | 'archived'

export interface PackageComponentOption {
  id: string
  title: string
  summary: string
  price: number
}

export interface PackageStayGroup {
  id: string
  label: string
  options: PackageComponentOption[]
}

export interface PackageQuotePayload {
  title: string
  packageType: TravelPackageType
  currency: string
  customerName: string
  customerPhone: string
  customerEmail: string
  adults: number
  childrenPaying: number
  childrenFree: number
  itineraryOrder: string[]
  departureDate: string
  returnDate: string
  stayGroups: PackageStayGroup[]
  flightOptions: PackageComponentOption[]
  transportOptions: PackageComponentOption[]
  notes: string
}

export interface PackageCombination {
  id: string
  staySelections: Array<{
    groupId: string
    groupLabel: string
    option: PackageComponentOption
  }>
  flightOption: PackageComponentOption | null
  transportOption: PackageComponentOption | null
  totalPrice: number
  perPersonPrice: number
  payingGuests: number
  currency: string
}

export interface PackageSelectionInput {
  stayOptionIds: Record<string, string>
  flightOptionId?: string | null
  transportOptionId?: string | null
  customerName?: string
  customerPhone?: string
  customerEmail?: string
  note?: string
}

export interface PackageResolvedSelection {
  selection: PackageSelectionInput
  combination: PackageCombination
}

export interface TravelPackageQuote {
  id: string
  title: string
  package_type: TravelPackageType
  status: TravelPackageStatus
  currency: string
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  payload: PackageQuotePayload
  share_token: string
  share_enabled: boolean
  shared_at: string | null
  expires_at: string
  selected_option: PackageResolvedSelection | null
  selected_at: string | null
  selection_note: string | null
  created_by: string | null
  created_at: string
  updated_at: string | null
}
