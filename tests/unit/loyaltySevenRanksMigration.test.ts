import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260911151622_loyalty_seven_ranks_achievements_walkins.sql'), 'utf8')
const campaignHooksSql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260911020000_connect_loyalty_campaign_hooks.sql'), 'utf8')

describe('seven-rank loyalty migration', () => {
  it('builds campaign performance from the projected award identifier', () => {
    expect(campaignHooksSql).toContain('count(award.award_id)::integer as award_count')
    expect(campaignHooksSql).not.toContain('count(award.id)::integer as award_count')
  })
  it('fails early with the exact missing prerequisite migration', () => {
    expect(sql).toContain('to_regprocedure(')
    expect(sql).toContain('20260911020000_connect_loyalty_campaign_hooks.sql')
  })

  it('installs the approved rank, achievement and voucher policy', () => {
    for (const rank of ['Bronze','Silver','Gold','Platinum','Ruby','Diamond','Elite']) expect(sql).toContain(`'${rank}'`)
    for (const achievement of ['First Ten','Piyam Regular','Loyalty Champion','Century Member']) expect(sql).toContain(`'${achievement}'`)
    for (const reward of ['(500,250,3','(1000,500,3','(24000,12000,3']) expect(sql).toContain(reward)
  })

  it('replaces the legacy voucher-rate constraint before activating the new catalogue', () => {
    expect(sql.indexOf('points_cost >= value_pence * 2')).toBeLessThan(
      sql.indexOf('(500,250,3,10,true)'),
    )
  })

  it('keeps walk-in consumption atomic and rejects oversized remittance vouchers before posting', () => {
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('loyalty:walkin:'")
    expect(sql).toContain("hint = 'POS_REMITTANCE_VOUCHER_LIMIT'")
    expect(sql.indexOf("hint = 'POS_REMITTANCE_VOUCHER_LIMIT'")).toBeLessThan(sql.indexOf('return public.pos_post_transaction_v6'))
    expect(sql).toContain('idempotency_key uuid not null unique')
    expect(sql).toContain('customer_loyalty_walkin_windows walkin_window')
    expect(sql).not.toContain('customer_loyalty_walkin_windows window')
  })

  it('uses rank points for campaign targeting and excludes voucher deductions', () => {
    expect(sql).toContain('customer_loyalty_rank_for_points_v1(balance.rank_points::integer)')
    expect(sql).toContain("activation_milestone is distinct from ''voucher_redemption''")
  })
})
