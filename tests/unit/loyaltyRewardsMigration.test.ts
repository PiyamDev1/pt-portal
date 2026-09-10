import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260910002224_loyalty_referrals_vouchers_automation.sql',
  ),
  'utf8',
)
const cryptoRepairSql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260910162157_repair_loyalty_reward_crypto_resolution.sql',
  ),
  'utf8',
)

describe('loyalty rewards migration', () => {
  it('installs atomic, idempotent voucher and referral operations', () => {
    expect(sql.match(/^begin;$/gim)).toHaveLength(1)
    expect(sql.match(/^commit;$/gim)).toHaveLength(1)
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain('unique(referred_mobile_user_id)')
    expect(sql).toContain('idempotency_key uuid not null unique')
    expect(sql).toContain('customer_loyalty_accept_referral_v1')
    expect(sql).toContain('customer_loyalty_issue_voucher_v1')
  })

  it('locks down every new customer reward table and private function', () => {
    for (const table of [
      'customer_loyalty_campaign_awards',
      'customer_loyalty_referral_codes',
      'customer_loyalty_referrals',
      'customer_loyalty_vouchers',
    ]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`)
      expect(sql).toContain(`alter table public.${table} force row level security`)
    }
    expect(sql).toContain(
      'revoke all on function public.customer_loyalty_issue_voucher_v1(uuid,integer,uuid)',
    )
    expect(sql).toContain(
      'grant execute on function public.customer_loyalty_run_scheduled_bonus_v1(timestamptz) to service_role',
    )
  })

  it('repairs pgcrypto resolution without widening the function search path', () => {
    expect(cryptoRepairSql.match(/^begin;$/gim)).toHaveLength(1)
    expect(cryptoRepairSql.match(/^commit;$/gim)).toHaveLength(1)
    expect(cryptoRepairSql).toContain("'extensions.gen_random_bytes(8)'")
    expect(cryptoRepairSql).toContain("'extensions.gen_random_bytes(10)'")
    expect(cryptoRepairSql).toContain("notify pgrst, 'reload schema'")
    expect(cryptoRepairSql).toContain("procedure_row.proname = 'customer_loyalty_ensure_referral_code_v1'")
    expect(cryptoRepairSql).toContain("procedure_row.proname = 'customer_loyalty_issue_voucher_v1'")
    expect(cryptoRepairSql).not.toContain("::regprocedure")
    expect(cryptoRepairSql).not.toContain('set search_path = extensions')
  })
})
