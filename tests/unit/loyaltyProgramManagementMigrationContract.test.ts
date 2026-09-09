import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260909210312_loyalty_program_management_and_repairs.sql',
  ),
  'utf8',
)

describe('loyalty program management migration contract', () => {
  it('repairs staff adjustments without deleting award history', () => {
    expect(sql).toContain(
      'drop constraint if exists customer_loyalty_awards_activation_milestone_check',
    )
    expect(sql).toContain("'issued_and_paid','completed_and_paid','fully_paid','staff_adjustment'")
    expect(sql).not.toMatch(/delete\s+from\s+public\.customer_loyalty_awards/i)
  })

  it('reconciles the earning-rule table and installs configurable rewards', () => {
    expect(sql).toContain(
      'create table if not exists public.customer_loyalty_program_earning_rules',
    )
    expect(sql).toContain('create table public.customer_loyalty_voucher_rewards')
    expect(sql).toContain('create table public.customer_loyalty_bonus_campaigns')
    expect(sql).toContain(
      "event_type in ('double_points','fixed_bonus','welcome_bonus','referral_bonus','off_peak_bonus')",
    )
  })

  it('allows only active administrators to mutate the program and audits every change', () => {
    expect(sql).toContain('create or replace function public.customer_loyalty_manage_program_v1')
    expect(sql).toContain("lower(btrim(role.name)) in ('admin','master admin','super admin')")
    expect(sql).toContain('create table public.customer_loyalty_program_audit_events')
    expect(sql).toContain('before update or delete on public.customer_loyalty_program_audit_events')
    expect(sql).toContain(
      'grant execute on function public.customer_loyalty_manage_program_v1(uuid,text,jsonb) to service_role',
    )
  })

  it('keeps the configuration tables behind forced RLS in one transaction', () => {
    expect(sql.match(/^begin;$/gim)).toHaveLength(1)
    expect(sql.match(/^commit;$/gim)).toHaveLength(1)
    expect(sql).toContain(
      'alter table public.customer_loyalty_voucher_rewards force row level security',
    )
    expect(sql).toContain(
      'alter table public.customer_loyalty_bonus_campaigns force row level security',
    )
    expect(sql).toContain('from public, anon, authenticated, service_role')
  })
})
