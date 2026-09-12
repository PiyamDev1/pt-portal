import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260912102957_repair_loyalty_bonus_activation_and_birthday_lock.sql',
  ),
  'utf8',
)

describe('loyalty bonus activation and birthday lock migration', () => {
  it('awards the welcome campaign when the first qualifying source activates', () => {
    expect(sql).toContain('customer_loyalty_award_welcome_on_activation_v1')
    expect(sql).toContain("new.source_type not in ('ticket', 'service', 'package')")
    expect(sql).toContain("campaign.event_type = 'welcome_bonus'")
    expect(sql).toContain('member_awards >= campaign_row.max_awards_per_customer')
    expect(sql).toContain('on conflict do nothing')
  })

  it('locks birthday reward data after customer onboarding', () => {
    expect(sql).toContain('birthday_reward_locked_at')
    expect(sql).toContain('customer_loyalty_lock_birthday_reward_v1')
    expect(sql).toContain('CUSTOMER_BIRTHDAY_REWARD_IMMUTABLE')
  })

  it('repairs deferred referrals and processes today birthday awards', () => {
    expect(sql).toContain("where referral.status = 'authenticated'")
    expect(sql).toContain('customer_loyalty_accept_referral_v1')
    expect(sql).toContain('customer_loyalty_run_scheduled_bonus_v1')
  })

  it('is atomic and keeps new functions private', () => {
    expect(sql.match(/^begin;$/gim)).toHaveLength(1)
    expect(sql.match(/^commit;$/gim)).toHaveLength(1)
    expect(sql).toContain('from public, anon, authenticated, service_role;')
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })
})
