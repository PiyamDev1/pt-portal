import { describe, expect, it } from 'vitest'
import {
  cleanPackagePaymentText,
  isTravelPackagePaymentMethod,
  isTravelPackagePaymentStatus,
  isTravelPackagePaymentType,
  TRAVEL_PACKAGE_PAYMENT_METHODS,
  TRAVEL_PACKAGE_PAYMENT_STATUSES,
  TRAVEL_PACKAGE_PAYMENT_TYPES,
} from '@/lib/packages/paymentRouteContract'

describe('package payment route contract', () => {
  it('accepts every shared payment type, method, and status', () => {
    for (const value of TRAVEL_PACKAGE_PAYMENT_TYPES) {
      expect(isTravelPackagePaymentType(value)).toBe(true)
    }
    for (const value of TRAVEL_PACKAGE_PAYMENT_METHODS) {
      expect(isTravelPackagePaymentMethod(value)).toBe(true)
    }
    for (const value of TRAVEL_PACKAGE_PAYMENT_STATUSES) {
      expect(isTravelPackagePaymentStatus(value)).toBe(true)
    }
  })

  it('rejects unknown values and normalizes optional text consistently', () => {
    expect(isTravelPackagePaymentType('cash')).toBe(false)
    expect(isTravelPackagePaymentMethod('cheque')).toBe(false)
    expect(isTravelPackagePaymentStatus('settled')).toBe(false)
    expect(cleanPackagePaymentText('  reference  ')).toBe('reference')
    expect(cleanPackagePaymentText(null)).toBe('')
  })
})
