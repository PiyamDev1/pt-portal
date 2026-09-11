import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loyaltyProgramMutationSchema } from '@/lib/loyalty/contracts'

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260910234155_rebalance_loyalty_rewards.sql'),
  'utf8',
)

describe('loyalty reward economics', () => {
  it('installs the rebalanced voucher ladder without changing issued vouchers', () => {
    expect(sql.match(/^begin;$/gim)).toHaveLength(1)
    expect(sql.match(/^commit;$/gim)).toHaveLength(1)
    expect(sql).toContain('(1000, 250, 6, 10, true)')
    expect(sql).toContain('(40000, 12000, 6, 60, true)')
    expect(sql).toContain('points_cost < value_pence * 3')
    expect(sql).not.toMatch(/delete\s+from\s+public\.customer_loyalty_vouchers/i)
  })

  it('prevents an active reward from exceeding the programme value ceiling', () => {
    const common = {
      action: 'UPSERT_VOUCHER_REWARD' as const,
      pointsCost: 1_000,
      validityMonths: 6,
      displayOrder: 10,
      isActive: true,
    }
    expect(loyaltyProgramMutationSchema.safeParse({ ...common, valuePence: 250 }).success).toBe(
      true,
    )
    expect(loyaltyProgramMutationSchema.safeParse({ ...common, valuePence: 1_000 }).success).toBe(
      false,
    )
    expect(sql).toContain('points_cost >= value_pence * 3')
    expect(sql).toContain(
      'validate constraint customer_loyalty_voucher_rewards_minimum_exchange_rate',
    )
  })
})
