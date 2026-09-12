import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260912150000_customer_portal_unlink_loyalty_source.sql',
  ),
  'utf8',
)

describe('customer loyalty unlink migration', () => {
  it('locks the source and preserves only FIFO-attributed redeemed points', () => {
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain('spent_points - prior_earned_points')
    expect(sql).toContain("award.activation_milestone = 'voucher_redemption'")
    expect(sql).toContain("'unlink-retention.v1:'")
    expect(sql).toContain("'voucher_redemption'")
  })

  it('exhausts the original award and restricts the function to service role', () => {
    expect(sql).toContain('customer_loyalty_unlinked_sources')
    expect(sql).toContain('return null;')
    expect(sql).toContain('customer_loyalty_award_reverse')
    expect(sql).toMatch(/revoke all on function[\s\S]+from public, anon, authenticated/i)
    expect(sql).toMatch(/grant execute on function[\s\S]+to service_role/i)
  })
})
