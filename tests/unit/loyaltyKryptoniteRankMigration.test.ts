import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260911224009_rename_elite_rank_to_kryptonite.sql'),
  'utf8',
)

describe('Kryptonite loyalty rank migration', () => {
  it('renames the public rank while retaining the stable internal key', () => {
    expect(sql).toContain("where rank_key = 'elite'")
    expect(sql).toContain("name = 'Kryptonite'")
    expect(sql).toContain("'Kryptonite rank badge'")
  })

  it('migrates campaign audiences before enforcing the new seven-rank set', () => {
    const oldConstraintDrop = sql.indexOf(
      'drop constraint if exists customer_loyalty_bonus_campaigns_audience_tiers_check',
    )
    const audienceUpdate = sql.indexOf("array_replace(audience_tiers, 'Elite', 'Kryptonite')")
    const constraint = sql.indexOf('customer_loyalty_bonus_campaigns_audience_tiers_check check')
    expect(oldConstraintDrop).toBeGreaterThan(-1)
    expect(audienceUpdate).toBeGreaterThan(oldConstraintDrop)
    expect(constraint).toBeGreaterThan(audienceUpdate)
    expect(sql).toContain("'Bronze','Silver','Gold','Platinum','Ruby','Diamond','Kryptonite'")
  })

  it('is atomic and reloads the API schema', () => {
    expect(sql.match(/^begin;$/gim)).toHaveLength(1)
    expect(sql.match(/^commit;$/gim)).toHaveLength(1)
    expect(sql).toContain("notify pgrst, 'reload schema'")
  })
})
