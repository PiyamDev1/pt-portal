import type {
  TravelPackagePaymentMethod,
  TravelPackagePaymentStatus,
  TravelPackagePaymentType,
} from '@/app/types/packages'

export const TRAVEL_PACKAGE_PAYMENT_TYPES = [
  'deposit',
  'payment',
  'account_credit',
  'refund',
  'chargeback',
  'commission',
] as const satisfies readonly TravelPackagePaymentType[]

export const TRAVEL_PACKAGE_PAYMENT_METHODS = [
  'cash',
  'bank_transfer',
  'card',
  'other',
] as const satisfies readonly TravelPackagePaymentMethod[]

export const TRAVEL_PACKAGE_PAYMENT_STATUSES = [
  'pending',
  'completed',
  'failed',
  'cancelled',
  'refunded',
] as const satisfies readonly TravelPackagePaymentStatus[]

const paymentTypes = new Set<string>(TRAVEL_PACKAGE_PAYMENT_TYPES)
const paymentMethods = new Set<string>(TRAVEL_PACKAGE_PAYMENT_METHODS)
const paymentStatuses = new Set<string>(TRAVEL_PACKAGE_PAYMENT_STATUSES)

export function cleanPackagePaymentText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function isTravelPackagePaymentType(value: unknown): value is TravelPackagePaymentType {
  return typeof value === 'string' && paymentTypes.has(value)
}

export function isTravelPackagePaymentMethod(value: unknown): value is TravelPackagePaymentMethod {
  return typeof value === 'string' && paymentMethods.has(value)
}

export function isTravelPackagePaymentStatus(value: unknown): value is TravelPackagePaymentStatus {
  return typeof value === 'string' && paymentStatuses.has(value)
}
