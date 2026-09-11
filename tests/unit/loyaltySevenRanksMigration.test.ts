import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260911151622_loyalty_seven_ranks_achievements_walkins.sql'), 'utf8')

describe('seven-rank loyalty migration', () => {
  it('installs the approved rank, achievement and voucher policy', () => {
    for (const rank of ['Bronze','Silver','Gold','Platinum','Ruby','Diamond','Elite']) expect(sql).toContain(`'${rank}'`)
    for (const achievement of ['First Ten','Piyam Regular','Loyalty Champion','Century Member']) expect(sql).toContain(`'${achievement}'`)
    for (const reward of ['(500,250,3','(1000,500,3','(24000,12000,3']) expect(sql).toContain(reward)
  })

  it('keeps walk-in consumption atomic and rejects oversized remittance vouchers before posting', () => {
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('loyalty:walkin:'")
    expect(sql).toContain("hint = 'POS_REMITTANCE_VOUCHER_LIMIT'")
    expect(sql.indexOf("hint = 'POS_REMITTANCE_VOUCHER_LIMIT'")).toBeLessThan(sql.indexOf('return public.pos_post_transaction_v6'))
    expect(sql).toContain('idempotency_key uuid not null unique')
  })

  it('uses rank points for campaign targeting and excludes voucher deductions', () => {
    expect(sql).toContain('customer_loyalty_rank_for_points_v1(balance.rank_points::integer)')
    expect(sql).toContain("activation_milestone is distinct from ''voucher_redemption''")
  })
})
