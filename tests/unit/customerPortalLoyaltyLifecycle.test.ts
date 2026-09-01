import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  customerLoyaltyActivationMilestone,
  customerLoyaltySourceReference,
  customerLoyaltyTransition,
  normalizeCustomerLoyaltyCode,
} from '@/lib/customerPortal/loyaltyLifecycle'

describe('customer loyalty lifecycle', () => {
  it('builds stable, versioned source references', () => {
    const id = '01A04AF2-5437-74C2-8D42-2F815C7204D5'
    expect(customerLoyaltySourceReference({ type: 'ticket', recordId: id })).toBe(
      'ticket.v1:01a04af2-5437-74c2-8d42-2f815c7204d5',
    )
    expect(
      customerLoyaltySourceReference({ type: 'service', namespace: 'Visa', recordId: id }),
    ).toBe('service.v1:visa:01a04af2-5437-74c2-8d42-2f815c7204d5')
    expect(customerLoyaltyActivationMilestone('package')).toBe('fully_paid')
    expect(normalizeCustomerLoyaltyCode(' pym-7k4m-9q2d-h ')).toBe('PYM-7K4M-9Q2D-H')
    expect(() => normalizeCustomerLoyaltyCode('PYM-0000-0000-0')).toThrow()
  })

  it('activates only when the source-specific paid milestone is satisfied', () => {
    expect(
      customerLoyaltyTransition('pending', {
        type: 'ticket',
        operationalStatus: 'issued',
        paymentStatus: 'unpaid',
      }),
    ).toBe('none')
    expect(
      customerLoyaltyTransition('pending', {
        type: 'ticket',
        operationalStatus: 'issued',
        paymentStatus: 'paid',
      }),
    ).toBe('activate')
    expect(
      customerLoyaltyTransition('pending', {
        type: 'service',
        completed: true,
        paid: false,
        cancelled: false,
        refunded: false,
      }),
    ).toBe('none')
    expect(
      customerLoyaltyTransition('pending', {
        type: 'service',
        completed: true,
        paid: true,
        cancelled: false,
        refunded: false,
      }),
    ).toBe('activate')
    expect(
      customerLoyaltyTransition('pending', {
        type: 'package',
        status: 'fully_reserved',
        paymentStatus: 'partial',
      }),
    ).toBe('none')
    expect(
      customerLoyaltyTransition('pending', {
        type: 'package',
        status: 'fully_reserved',
        paymentStatus: 'paid',
      }),
    ).toBe('activate')
  })

  it('reverses cancellations, refunds, and a withdrawn paid milestone', () => {
    expect(
      customerLoyaltyTransition('available', {
        type: 'ticket',
        operationalStatus: 'part_refunded',
        paymentStatus: 'paid',
      }),
    ).toBe('reverse')
    expect(
      customerLoyaltyTransition('available', {
        type: 'service',
        completed: true,
        paid: true,
        cancelled: false,
        refunded: true,
      }),
    ).toBe('reverse')
    expect(
      customerLoyaltyTransition('available', {
        type: 'package',
        status: 'fully_reserved',
        paymentStatus: 'partial',
      }),
    ).toBe('reverse')
    expect(
      customerLoyaltyTransition('reversed', {
        type: 'package',
        status: 'fully_reserved',
        paymentStatus: 'paid',
      }),
    ).toBe('none')
  })

  it('installs source triggers and service evidence RPCs in the isolated migration', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'scripts/migrations/20260831_customer_portal_loyalty_lifecycle.sql'),
      'utf8',
    )
    expect(sql).toContain('customer_loyalty_register_source_v1')
    expect(sql).toContain('customer_loyalty_register_code_source_v1')
    expect(sql).toContain('customer_loyalty_record_service_event_v1')
    expect(sql).toContain('customer_loyalty_ticket_source_changed_v1')
    expect(sql).toContain('customer_loyalty_ticket_refund_changed_v1')
    expect(sql).toContain('customer_loyalty_ticket_scope_changed_v1')
    expect(sql).toContain('customer_loyalty_package_source_changed_v1')
    expect(sql).toContain('revoke all on function public.customer_loyalty_award_activate(text)')
    expect(sql).toContain("transaction_operational_status = 'issued'")
    expect(sql).toContain("transaction_payment_status = 'paid'")
    expect(sql).toContain("refund.status <> 'voided'")
    expect(sql).toContain("booking_scope = 'ticket'")
    expect(sql).toContain("package_row.payment_status = 'paid'")
    expect(sql).toContain('state_row.completed_at is not null')
    expect(sql).toContain('state_row.paid_at is not null')
  })
})
