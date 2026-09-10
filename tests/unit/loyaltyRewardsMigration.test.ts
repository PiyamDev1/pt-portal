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
})
