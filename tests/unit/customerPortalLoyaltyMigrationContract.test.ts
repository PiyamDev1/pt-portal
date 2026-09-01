import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const MIGRATION_NAME = '20260831_customer_portal_loyalty_lifecycle.sql'
const FOUNDATION_NAME = '20260831_customer_portal_integration_foundation.sql'
const migrationPath = resolve(process.cwd(), 'scripts/migrations', MIGRATION_NAME)
const foundationPath = resolve(process.cwd(), 'scripts/migrations', FOUNDATION_NAME)
const sql = readFileSync(migrationPath, 'utf8')
const foundationSql = readFileSync(foundationPath, 'utf8')

function functionDefinition(name: string) {
  const match = sql.match(
    new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, 'i'),
  )
  expect(match, `${name} must be present`).not.toBeNull()
  return match?.[0] || ''
}

describe('customer loyalty migration contract', () => {
  it('loads after every staff-schema dependency it references', () => {
    expect(FOUNDATION_NAME.localeCompare(MIGRATION_NAME)).toBeLessThan(0)
    expect(foundationSql).toContain('create table if not exists public.customer_loyalty_awards')
    expect(foundationSql).toContain('add column if not exists customer_code text')
    expect(foundationSql).toContain('add column if not exists customer_lifecycle_status text')
    expect(
      existsSync(
        resolve(
          process.cwd(),
          'scripts/migrations/20260829_ticketing_refund_voucher_lifecycle.sql',
        ),
      ),
    ).toBe(true)
  })

  it('has one complete transaction and balanced function bodies', () => {
    expect(sql.match(/^begin;$/gim)).toHaveLength(1)
    expect(sql.match(/^commit;$/gim)).toHaveLength(1)
    expect(sql.match(/^create or replace function /gim)).toHaveLength(13)
    expect(sql.match(/^\$\$;$/gm)).toHaveLength(13)
    expect(sql.match(/\$\$/g)).toHaveLength(26)
    expect(sql.match(/security definer/g)).toHaveLength(12)
    expect(sql.match(/set row_security = off/g)).toHaveLength(12)
  })

  it('makes pending creation retry-safe and keeps source references immutable', () => {
    const pending = functionDefinition('customer_loyalty_award_pending')
    const register = functionDefinition('customer_loyalty_register_source_v1')
    expect(pending).toContain('on conflict (source_reference) do nothing')
    expect(pending).toContain('for update')
    expect(pending).toContain('source reference reused with different data')
    expect(register).toContain('on conflict (source_reference) do nothing')
    expect(register).toContain("booking_scope <> 'ticket'")
    expect(register).toContain('package-linked tickets must earn through the package source')
  })

  it('derives every activation and reversal from authoritative facts', () => {
    const reconcile = functionDefinition('customer_loyalty_reconcile_source_v1')
    expect(reconcile).toContain("transaction_operational_status = 'issued'")
    expect(reconcile).toContain("transaction_payment_status = 'paid'")
    expect(reconcile).toContain("refund.status <> 'voided'")
    expect(reconcile).toContain("booking_scope = 'ticket'")
    expect(reconcile).toContain("package_row.payment_status = 'paid'")
    expect(reconcile).toContain("package_row.payment_status = 'refunded'")
    expect(reconcile).toContain('state_row.completed_at is not null')
    expect(reconcile).toContain('state_row.paid_at is not null')
    expect(reconcile).toContain('state_row.cancelled_at is not null')
    expect(reconcile).toContain('state_row.refunded_at is not null')
    expect(reconcile).toContain("award_row.state = 'available' and not is_eligible")
  })

  it('records service facts as immutable idempotent evidence', () => {
    const serviceEvent = functionDefinition('customer_loyalty_record_service_event_v1')
    expect(serviceEvent).toContain('on conflict (event_reference) do nothing')
    expect(serviceEvent).toContain('service event reference reused with different data')
    expect(serviceEvent).toContain('completed_at = coalesce(')
    expect(serviceEvent).toContain('paid_at = coalesce(')
    expect(serviceEvent).toContain('cancelled_at = coalesce(')
    expect(serviceEvent).toContain('refunded_at = coalesce(')
  })

  it('installs all source-boundary triggers', () => {
    const triggerNames = Array.from(
      sql.matchAll(/^create trigger (customer_loyalty_[a-z0-9_]+)/gim),
      (match) => match[1],
    ).sort()
    expect(triggerNames).toEqual(
      [
        'customer_loyalty_package_source_changed_v1',
        'customer_loyalty_service_source_changed_v1',
        'customer_loyalty_ticket_refund_changed_v1',
        'customer_loyalty_ticket_scope_changed_v1',
        'customer_loyalty_ticket_source_changed_v1',
      ].sort(),
    )
    expect(sql).toContain('after update of commission_scope on public.ticket_bookings')
    expect(sql).toContain('after insert or update of status on public.ticket_refunds')
    expect(sql).toContain(
      'after insert or update of operational_status, payment_status on public.ticket_transactions',
    )
    expect(sql).toContain(
      'after insert or update of status, payment_status on public.travel_packages',
    )
  })

  it('allows only source-aware service-role mutations', () => {
    expect(sql).toMatch(
      /customer_loyalty_lifecycle_events from public, anon, authenticated, service_role;/,
    )
    expect(sql).toContain('revoke all on public.customer_loyalty_awards from service_role;')
    expect(sql).toContain('grant select on public.customer_loyalty_awards to service_role;')

    const grantedFunctions = Array.from(
      sql.matchAll(/grant execute on function public\.(customer_loyalty_[a-z0-9_]+)/gi),
      (match) => match[1],
    ).sort()
    expect(grantedFunctions).toEqual(
      [
        'customer_loyalty_reconcile_source_v1',
        'customer_loyalty_record_service_event_v1',
        'customer_loyalty_register_code_source_v1',
      ].sort(),
    )
    expect(sql).toContain('revoke all on function public.customer_loyalty_award_activate(text)')
    expect(sql).toContain(
      'revoke all on function public.customer_loyalty_register_source_v1(uuid, text, text, uuid, text, integer)',
    )
  })

  it('contains no redemption or expiry mutation path', () => {
    expect(sql).not.toMatch(/\bRedeemed\b/)
    expect(sql).not.toMatch(/\bexpires?_at\b/)
  })
})
