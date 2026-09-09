import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260909184740_loyalty_staff_module.sql',
  ),
  'utf8',
)
const customerSummarySource = readFileSync(
  resolve(process.cwd(), 'lib/customerPortal/loyalty.ts'),
  'utf8',
)

function functionDefinition(name: string) {
  const match = sql.match(
    new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, 'i'),
  )
  expect(match, `${name} must be present`).not.toBeNull()
  return match?.[0] || ''
}

describe('loyalty staff module migration contract', () => {
  it('records immutable adjustments with indexed foreign keys and unique retries', () => {
    expect(sql).toContain('create table public.customer_loyalty_staff_adjustments')
    expect(sql).toContain('idempotency_key uuid not null unique')
    expect(sql).toContain('customer_loyalty_staff_adjustments_member_time_idx')
    expect(sql).toContain('customer_loyalty_staff_adjustments_actor_time_idx')
    expect(sql).toContain('before update or delete on public.customer_loyalty_staff_adjustments')
  })

  it('uses one atomic adjustment function for the award and legacy ledger', () => {
    const definition = functionDefinition('customer_loyalty_staff_adjust_v1')
    expect(definition).toContain('pg_advisory_xact_lock')
    expect(definition).toContain("'staff-adjustment.v1:'")
    expect(definition).toContain("'Adjusted'")
    expect(definition).toContain('customer_loyalty_staff_adjustments')
    expect(definition).toContain('cannot make the available balance negative')
    expect(definition).toContain("lower(btrim(role.name)) in ('admin', 'master admin', 'super admin')")
  })

  it('keeps staff projections private and allows only service-role function calls', () => {
    expect(sql).toContain('alter table public.customer_loyalty_staff_adjustments enable row level security')
    expect(sql).toContain(
      'revoke all on table public.customer_loyalty_staff_adjustments from public, anon, authenticated',
    )
    expect(sql).toContain(
      'revoke all on table public.customer_loyalty_staff_member_summary from public, anon, authenticated',
    )
    expect(sql).toContain(
      'revoke all on function public.customer_loyalty_staff_adjust_v1(uuid, uuid, integer, text, uuid)',
    )
    expect(sql).toContain(
      'grant execute on function public.customer_loyalty_staff_adjust_v1(uuid, uuid, integer, text, uuid)',
    )
  })

  it('does not enable redemption or expiry', () => {
    expect(sql).not.toMatch(/redeem/i)
    expect(sql).not.toMatch(/expir(?:e|y)/i)
  })

  it('uses the complete database projection for customer balances', () => {
    expect(customerSummarySource).toContain(".from('customer_loyalty_staff_member_summary')")
    expect(customerSummarySource).toContain('Number(balance.pending_points || 0)')
    expect(customerSummarySource).toContain('Number(balance.available_points || 0)')
  })
})
