import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

import { validateCustomerLoyaltyReferralCode } from '@/lib/customerPortal/loyalty'

function client(options: { active?: boolean; referralCount?: number } = {}) {
  const active = options.active ?? true
  const referralCount = options.referralCount ?? 0
  return {
    from(table: string) {
      if (table === 'customer_loyalty_referral_codes') {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: () =>
            Promise.resolve({
              data: active ? { mobile_user_id: 'member-1' } : null,
              error: null,
            }),
        }
        return query
      }
      if (table === 'mobile_users') {
        const query = {
          select: () => query,
          eq: () => query,
          maybeSingle: () =>
            Promise.resolve({ data: { id: 'member-1' }, error: null }),
        }
        return query
      }
      if (table === 'customer_loyalty_referrals') {
        const query = {
          select: () => query,
          eq: () => query,
          in: () => Promise.resolve({ count: referralCount, error: null }),
        }
        return query
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

describe('customer referral verification', () => {
  beforeEach(() => vi.clearAllMocks())

  it('accepts an active referral code with capacity remaining', async () => {
    mocks.getServiceSupabaseClient.mockReturnValue(client({ referralCount: 9 }))
    await expect(
      validateCustomerLoyaltyReferralCode('pref-1234567890abcdef'),
    ).resolves.toEqual({ valid: true })
  })

  it('rejects inactive and exhausted referral codes', async () => {
    mocks.getServiceSupabaseClient.mockReturnValueOnce(client({ active: false }))
    await expect(
      validateCustomerLoyaltyReferralCode('PREF-1234567890ABCDEF'),
    ).resolves.toEqual({ valid: false })

    mocks.getServiceSupabaseClient.mockReturnValueOnce(client({ referralCount: 10 }))
    await expect(
      validateCustomerLoyaltyReferralCode('PREF-1234567890ABCDEF'),
    ).resolves.toEqual({ valid: false })
  })
})
