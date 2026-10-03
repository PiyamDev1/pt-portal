export type SupplierDraft = {
  name: string
  default_currency: string
  notes: string
}

export type VehicleDraft = {
  label: string
  passenger_capacity: string
  sort_order: number
}

export type PlanDraft = {
  plan_name: string
  preferred_supplier_id: string
  notes: string
}

export type RateDrafts = Record<string, string>
export type GuideDrafts = Record<string, string>
export type SupplierVehicleLabelDrafts = Record<string, string>

export const GUIDE_SERVICES = [
  { key: 'umrah', label: 'Umrah' },
  { key: 'madinah', label: 'Madinah' },
  { key: 'makkah', label: 'Makkah' },
] as const

export function rateKey(routeId: string, supplierId: string, vehicleTypeId: string) {
  return `${routeId}:${supplierId}:${vehicleTypeId}`
}

export function guideKey(supplierId: string, guideService: string) {
  return `${supplierId}:${guideService}`
}

export function supplierVehicleLabelKey(supplierId: string, vehicleTypeId: string) {
  return `${supplierId}:${vehicleTypeId}`
}

export function parseAmount(value: string | number | null | undefined) {
  return parseDecimal(value, 2)
}

export function parseDecimal(value: string | number | null | undefined, precision: number) {
  const normalized = String(value ?? '').replace(/[^0-9.]/g, '')
  const parsed = Number(normalized || 0)
  if (!Number.isFinite(parsed)) return 0
  const multiplier = 10 ** precision
  return Math.max(0, Math.round(parsed * multiplier) / multiplier)
}

export function formatAmount(amount: number, currency: string) {
  if (!amount) return '-'
  return `${currency || 'SAR'} ${amount.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function normaliseLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
