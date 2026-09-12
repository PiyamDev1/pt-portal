import { describe, expect, it } from 'vitest'

import {
  canStreamCustomerTripDocuments,
  effectiveCustomerTripScopes,
} from '@/lib/customerPortal/tripAuthorization'

describe('customer package content authorization', () => {
  it('reduces guest and legacy grants to basic read access', () => {
    expect(effectiveCustomerTripScopes(['read', 'documents', 'financials', 'lead'], null)).toEqual([
      'read',
    ])
    expect(canStreamCustomerTripDocuments(['read', 'documents'], null)).toBe(false)
  })

  it('retains document access for an account-bound verified grant', () => {
    const subject = '11111111-1111-4111-8111-111111111111'
    expect(effectiveCustomerTripScopes(['read', 'documents'], subject)).toEqual([
      'read',
      'documents',
    ])
    expect(canStreamCustomerTripDocuments(['read', 'documents'], subject)).toBe(true)
  })
})
