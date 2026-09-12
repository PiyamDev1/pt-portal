import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260912121804_loyalty_referral_limits_and_lifetime_welcome.sql',
  ),
  'utf8',
)

describe('loyalty referral limits and lifetime Welcome migration', () => {
  it('allows one incoming referral and ten outgoing referrals', () => {
    expect(sql).not.toContain(
      'drop constraint if exists customer_loyalty_referrals_referred_mobile_user_id_key',
    )
    expect(sql).toContain('customer_loyalty_campaign_awards_referral_kind_uidx')
    expect(sql).toContain('outgoing_referrals >= 10')
    expect(sql).toContain("status in ('authenticated','rewarded')")
    expect(sql).toContain("'referralLimit', 10")
  })

  it('enforces the 1050 point lifetime referral ceiling', () => {
    expect(sql).toContain('referrer_lifetime_points + campaign_row.bonus_points > 1050')
    expect(sql).toContain('referred_lifetime_points + campaign_row.referred_customer_points > 1050')
    expect(sql).toContain("'lifetimePointsLimit', 1050")
    expect(sql).toContain('per_customer_cap = 1050')
  })

  it('awards Welcome once and backfills eligible existing customers', () => {
    expect(sql).toContain('customer_loyalty_award_welcome_v1')
    expect(sql).toContain("activation_milestone = 'welcome_bonus'")
    expect(sql).toContain("'campaign.welcome.lifetime.v1:'")
    expect(sql).toContain("customer_lifecycle_status = 'active'")
    expect(sql).toContain('external_customer_subject is not null')
  })

  it('keeps privileged award functions private and the migration atomic', () => {
    expect(sql.match(/^begin;$/gim)).toHaveLength(1)
    expect(sql.match(/^commit;$/gim)).toHaveLength(1)
    expect(sql).toContain('from public, anon, authenticated, service_role;')
    expect(sql).toContain('to service_role;')
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })
})
