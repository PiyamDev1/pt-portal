import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260911190202_expand_loyalty_achievement_badges.sql',
  ),
  'utf8',
)

describe('expanded loyalty achievement badges migration', () => {
  it('installs exactly thirty named milestone rules through one batch upsert', () => {
    const rows = sql.match(/^  \('[a-z0-9_]+', '[^']+',/gm) ?? []
    expect(rows).toHaveLength(30)
    expect(sql).toContain("('first_step', 'First Step'")
    expect(sql).toContain("('lifetime_legend', 'Lifetime Legend'")
    expect(sql).toContain('on conflict (achievement_key) do update')
  })

  it('preserves the four approved achievement rewards', () => {
    expect(sql).toContain(
      "('first_ten', 'First Ten', 'Complete 10 paid and valid loyalty transactions.', 10, 50",
    )
    expect(sql).toContain(
      "('piyam_regular', 'Piyam Regular', 'Complete 25 paid and valid loyalty transactions.', 25, 100",
    )
    expect(sql).toContain(
      "('loyalty_champion', 'Loyalty Champion', 'Complete 50 paid and valid loyalty transactions.', 50, 200",
    )
    expect(sql).toContain(
      "('century_member', 'Century Member', 'Complete 100 paid and valid loyalty transactions.', 100, 400",
    )
  })

  it('fails closed when the achievement foundation is absent', () => {
    expect(sql).toContain("to_regclass('public.customer_loyalty_achievement_rules') is null")
    expect(sql).toContain(
      "'public.customer_loyalty_reconcile_member_progress_v1(uuid,timestamptz)'",
    )
    expect(sql).toContain('20260911151622_loyalty_seven_ranks_achievements_walkins.sql')
  })

  it('idempotently reconciles completed badges for existing members', () => {
    expect(sql).toContain('select distinct award.mobile_user_id')
    expect(sql).toContain('customer_loyalty_reconcile_member_progress_v1(')
  })
})
