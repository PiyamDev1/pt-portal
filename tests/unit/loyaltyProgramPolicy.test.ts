import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { LOYALTY_PROGRAM_POLICY } from '@/lib/loyalty/program'

const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260909195054_loyalty_program_fixed_earning_policy.sql',
  ),
  'utf8',
)

describe('loyalty program policy', () => {
  it('publishes the approved earning values and additional document service', () => {
    expect(
      Object.fromEntries(
        LOYALTY_PROGRAM_POLICY.earningRules.map((rule) => [rule.key, rule.points]),
      ),
    ).toEqual({
      remittance: 25,
      ticket: 60,
      package: 120,
      cargo: 25,
      application: 25,
      document_assistance: 10,
    })
  })

  it('keeps the rebalanced voucher values, validity periods and rank thresholds', () => {
    expect(LOYALTY_PROGRAM_POLICY.pointValidityMonths).toBe(12)
    expect(LOYALTY_PROGRAM_POLICY.voucherValidityMonths).toBe(3)
    expect(LOYALTY_PROGRAM_POLICY.voucherRewards).toEqual([
      { points: 500, valuePence: 250 },
      { points: 1_000, valuePence: 500 },
      { points: 2_000, valuePence: 1_000 },
      { points: 5_000, valuePence: 2_500 },
      { points: 8_000, valuePence: 4_000 },
      { points: 12_000, valuePence: 6_000 },
      { points: 18_000, valuePence: 9_000 },
      { points: 24_000, valuePence: 12_000 },
    ])
    expect(
      LOYALTY_PROGRAM_POLICY.ranks.map(({ name, minimumPoints, maintenancePoints }) => ({
        name,
        minimumPoints,
        maintenancePoints,
      })),
    ).toEqual([
      { name: 'Bronze', minimumPoints: 0, maintenancePoints: 0 },
      { name: 'Silver', minimumPoints: 1_500, maintenancePoints: 500 },
      { name: 'Gold', minimumPoints: 4_000, maintenancePoints: 1_334 },
      { name: 'Platinum', minimumPoints: 8_000, maintenancePoints: 2_667 },
      { name: 'Ruby', minimumPoints: 15_000, maintenancePoints: 5_000 },
      { name: 'Diamond', minimumPoints: 25_000, maintenancePoints: 8_334 },
      { name: 'Elite', minimumPoints: 40_000, maintenancePoints: 13_334 },
    ])
  })

  it('offers bounded bonus events and enables customer voucher redemption', () => {
    expect(LOYALTY_PROGRAM_POLICY.bonusEventOptions.map((option) => option.key)).toEqual([
      'double_points',
      'fixed_bonus',
      'welcome_bonus',
      'referral_bonus',
      'off_peak_bonus',
      'birthday_gift',
      'eid_gift',
    ])
    expect(LOYALTY_PROGRAM_POLICY.operationalNotes.join(' ')).toContain('a non-stacking rule')
    expect(LOYALTY_PROGRAM_POLICY.rollout).toMatchObject({
      earningActive: true,
      expiryActive: false,
      voucherIssuanceActive: true,
      voucherRedemptionActive: true,
      rankReviewActive: false,
    })
  })

  it('installs fixed POS earning rules through one private atomic migration', () => {
    expect(migrationSql.match(/^begin;$/gim)).toHaveLength(1)
    expect(migrationSql.match(/^commit;$/gim)).toHaveLength(1)
    expect(migrationSql).toContain('create table public.customer_loyalty_program_earning_rules')
    expect(migrationSql).toContain("activation_mode in ('POS_FLAT', 'SOURCE_RECORD')")
    expect(migrationSql).toContain("('remittance', 'Remittance transaction', 25")
    expect(migrationSql).toContain("('document_assistance', 'Document assistance', 10")
    expect(migrationSql).toContain('create or replace function public.pos_post_transaction_v4')
    expect(migrationSql).toContain('pg_advisory_xact_lock')
    expect(migrationSql).toContain('POS_LOYALTY_SOURCE_REQUIRED')
    expect(migrationSql).toContain(
      'alter table public.customer_loyalty_program_earning_rules force row level security',
    )
    expect(migrationSql).toContain(
      'revoke all on function public.pos_post_transaction_v3(uuid,text,jsonb) from service_role',
    )
    expect(migrationSql).toContain("values ('pos', 2026090904, clock_timestamp())")
  })
})
