import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loyaltyProgramMutationSchema } from '@/lib/loyalty/contracts'

const sql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260911201609_loyalty_campaign_events_and_reward_controls.sql',
  ),
  'utf8',
)

describe('loyalty campaign events and reward controls', () => {
  it('installs named event groups, guarded deletion and the v5 management boundary', () => {
    expect(sql).toContain('create table public.customer_loyalty_campaign_events')
    expect(sql).toContain('customer_loyalty_campaign_events_active_name_uq')
    expect(sql).toContain("action_value = 'DELETE_CAMPAIGN_EVENT'")
    expect(sql).toContain("action_value = 'DELETE_BONUS_CAMPAIGN'")
    expect(sql).toContain('customer_loyalty_manage_program_v5')
    expect(sql).toContain('grant execute on function public.customer_loyalty_manage_program_v5')
    expect(sql).toContain('force row level security')
  })

  it('seeds the requested starter values and changes ticket earning to 60 points', () => {
    expect(sql).toContain('set points = 60')
    expect(sql).toContain("'Verified Referral', event_id_value, 'Referral reward'")
    expect(sql).toContain("'referral_bonus', null, 100")
    expect(sql).toContain("'Birthday Reward', event_id_value, 'Birthday gift'")
    expect(sql).toContain("'birthday_gift', null, 50")
    expect(sql).toContain("'Welcome Bonus', event_id_value, 'First purchase reward'")
    expect(sql).toContain("'welcome_bonus', null, 50")
  })

  it('accepts event, rule deletion and points-only voucher mutations', () => {
    expect(
      loyaltyProgramMutationSchema.safeParse({
        action: 'CREATE_CAMPAIGN_EVENT',
        name: 'Ramadan 2027',
        description: 'A grouped Ramadan campaign.',
      }).success,
    ).toBe(true)
    expect(
      loyaltyProgramMutationSchema.safeParse({
        action: 'DELETE_BONUS_CAMPAIGN',
        id: '10000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(true)
    expect(
      loyaltyProgramMutationSchema.safeParse({
        action: 'UPDATE_VOUCHER_POINTS',
        currentPointsCost: 500,
        pointsCost: 600,
      }).success,
    ).toBe(true)
  })
})
