import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { loyaltyProgramMutationSchema } from '@/lib/loyalty/contracts'

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260911010000_loyalty_campaign_workspace.sql'),
  'utf8',
)

const campaign = {
  action: 'UPSERT_BONUS_CAMPAIGN' as const,
  name: 'Gold Eid reward',
  eventType: 'eid_gift' as const,
  multiplier: null,
  bonusPoints: 100,
  referredCustomerPoints: null,
  startsAt: '2026-09-12T00:00:00.000Z',
  endsAt: '2026-09-20T00:00:00.000Z',
  eligibleServiceKeys: [],
  eligibleBranchIds: [],
  audienceTiers: ['Gold'] as const,
  maxAwardsPerCustomer: 1,
  minimumSpendPence: 0,
  priority: 200,
  linkedCampaignId: null,
  perCustomerCap: 100,
  totalPointsBudget: 10_000,
  allowStacking: false,
  status: 'scheduled' as const,
  terms: 'Available to Gold members during the campaign window.',
}

describe('loyalty campaign workspace', () => {
  it('accepts explicit audience, frequency, spend, priority and linking controls', () => {
    expect(loyaltyProgramMutationSchema.safeParse(campaign).success).toBe(true)
  })

  it('requires the customer points cap to cover repeated fixed awards', () => {
    const result = loyaltyProgramMutationSchema.safeParse({
      ...campaign,
      maxAwardsPerCustomer: 3,
      perCustomerCap: 200,
    })
    expect(result.success).toBe(false)
  })

  it('allows an active sale-based campaign now that its award hook exists', () => {
    const result = loyaltyProgramMutationSchema.safeParse({
      ...campaign,
      eventType: 'fixed_bonus',
      status: 'active',
    })
    expect(result.success).toBe(true)
  })

  it('keeps the two-sided referral reward available to all ranks', () => {
    const result = loyaltyProgramMutationSchema.safeParse({
      ...campaign,
      eventType: 'referral_bonus',
      referredCustomerPoints: 100,
      audienceTiers: ['Gold'],
    })
    expect(result.success).toBe(false)
  })

  it('installs indexed, audited and service-only campaign controls', () => {
    expect(sql).toContain('customer_loyalty_bonus_campaigns_active_priority_idx')
    expect(sql).toContain('with (security_invoker = true)')
    expect(sql).toContain('campaign limits cannot be reduced below points or awards already issued')
    expect(sql).toContain('campaign links cannot form a cycle')
    expect(sql).toContain('= any(campaign_row.audience_tiers)')
    expect(sql).toContain('member_awards >= campaign_row.max_awards_per_customer')
    expect(sql).toContain('customer_loyalty_manage_program_v2')
    expect(sql).toContain('grant execute on function public.customer_loyalty_manage_program_v2')
    expect(sql).toContain('from public, anon, authenticated, service_role')
  })
})
