import { describe, expect, it } from 'vitest'
import type { StaffSession } from '@/lib/auth/staffSession'
import { posPermissions } from '@/lib/pos/access'
import {
  posConfigurationMutationSchema,
  posPostTransactionSchema,
  posRefundSchema,
  posReconciliationSchema,
} from '@/lib/pos/inputContracts'
import { posLogoUrl } from '@/lib/pos/logos'

function session(role: string): StaffSession {
  return {
    user: { id: 'user-1', email: 'staff@example.com' },
    employee: {
      id: 'user-1',
      email: 'staff@example.com',
      fullName: 'Staff member',
      role,
      departments: [],
    },
  }
}

describe('POS mutation contracts', () => {
  it('resolves approved provider logos for services and supplier profiles', () => {
    expect(posLogoUrl('ria', 'service')).toBe('/pos/providers/ria.svg')
    expect(posLogoUrl('ria', 'supplier')).toBe('/pos/providers/ria.svg')
    expect(posLogoUrl('polani-travel', 'supplier')).toBe('/pos/suppliers/polani-travel.svg')
  })

  it('accepts bounded split tenders and a typed tracked-service source', () => {
    const result = posPostTransactionSchema.safeParse({
      shiftId: '10000000-0000-4000-8000-000000000001',
      categoryKey: 'ticketing-packages',
      catalogueKey: 'ticketing',
      entryMode: 'CUSTOMER_PAYMENT',
      direction: 'IN',
      totalAmount: 100,
      customerName: 'Customer',
      tenders: [
        { method: 'CASH', amount: 40 },
        { method: 'CARD', amount: 60, externalReference: 'CARD-1' },
      ],
      source: { type: 'TICKETING', recordId: 'ticket-123' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects unknown request fields and malformed money precision', () => {
    expect(
      posPostTransactionSchema.safeParse({
        shiftId: '10000000-0000-4000-8000-000000000001',
        catalogueKey: 'document-help',
        direction: 'IN',
        totalAmount: 1.001,
        customerName: 'Walk-in',
        tenders: [{ method: 'CASH', amount: 1.001 }],
        actorEmployeeId: 'caller-controlled',
      }).success,
    ).toBe(false)
  })

  it('accepts only a validated voucher code field and keeps OTHER tenders server-reserved', () => {
    const base = {
      shiftId: '10000000-0000-4000-8000-000000000001',
      catalogueKey: 'document-assistance',
      direction: 'IN' as const,
      totalAmount: 25,
      customerName: 'Customer',
      tenders: [{ method: 'CASH' as const, amount: 15 }],
    }
    expect(
      posPostTransactionSchema.safeParse({
        ...base,
        voucherCode: 'PYV-0123456789ABCDEF0123',
      }).success,
    ).toBe(true)
    expect(
      posPostTransactionSchema.safeParse({
        ...base,
        tenders: [{ method: 'OTHER', amount: 10 }],
      }).success,
    ).toBe(false)
  })

  it('accepts noted negative supplier corrections and remittance tender destinations', () => {
    expect(
      posPostTransactionSchema.safeParse({
        shiftId: '10000000-0000-4000-8000-000000000001',
        categoryKey: 'ticketing-packages',
        catalogueKey: 'ticketing',
        entryMode: 'SUPPLIER_PAYMENT',
        direction: 'IN',
        totalAmount: -40,
        customerName: 'Polani Travel',
        supplierId: '20000000-0000-4000-8000-000000000001',
        note: 'Supplier returned part of the deposit',
        tenders: [{ method: 'BANK', amount: 40, destination: 'OUR_ACCOUNT' }],
      }).success,
    ).toBe(true)
    expect(
      posPostTransactionSchema.safeParse({
        shiftId: '10000000-0000-4000-8000-000000000001',
        categoryKey: 'ticketing-packages',
        catalogueKey: 'ticketing',
        entryMode: 'SUPPLIER_PAYMENT',
        direction: 'IN',
        totalAmount: -40,
        customerName: 'Polani Travel',
        supplierId: '20000000-0000-4000-8000-000000000001',
        tenders: [{ method: 'BANK', amount: 40 }],
      }).success,
    ).toBe(false)
  })

  it('keeps Other out of configurable quick-entry payment methods', () => {
    const service = {
      action: 'UPSERT_SERVICE',
      key: 'document-assistance',
      categoryKey: 'document-assistance',
      label: 'Document Assistance',
      direction: 'IN',
      displayOrder: 10,
      allowedPaymentMethods: ['CASH', 'OTHER'],
    }
    expect(posConfigurationMutationSchema.safeParse(service).success).toBe(false)
    expect(
      posConfigurationMutationSchema.safeParse({
        ...service,
        allowedPaymentMethods: ['CASH', 'CARD', 'BANK'],
      }).success,
    ).toBe(true)
  })

  it('accepts optimized custom logo keys without requiring POS-owned loyalty settings', () => {
    const result = posConfigurationMutationSchema.safeParse({
      action: 'UPSERT_SERVICE',
      key: 'ria',
      categoryKey: 'remittance',
      label: 'Ria',
      direction: 'IN',
      displayOrder: 10,
      logoKey: 'custom-10000000-0000-4000-8000-000000000001',
      allowedPaymentMethods: ['CASH', 'CARD', 'BANK'],
    })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data).not.toHaveProperty('loyaltyEligible')
  })

  it('requires an original for linked refunds and evidence for general refunds', () => {
    const base = {
      shiftId: '10000000-0000-4000-8000-000000000001',
      amount: 10,
      tenders: [{ method: 'CASH' as const, amount: 10 }],
      reasonCode: 'CUSTOMER_REQUEST',
      note: 'Customer requested refund',
    }
    expect(posRefundSchema.safeParse({ ...base, refundKind: 'LINKED' }).success).toBe(false)
    expect(posRefundSchema.safeParse({ ...base, refundKind: 'GENERAL' }).success).toBe(false)
  })

  it('accepts exactly one reconciliation target', () => {
    expect(
      posReconciliationSchema.safeParse({
        transactionTenderId: '10000000-0000-4000-8000-000000000001',
        status: 'COMPLETED',
      }).success,
    ).toBe(true)
    expect(
      posReconciliationSchema.safeParse({
        transactionTenderId: '10000000-0000-4000-8000-000000000001',
        refundTenderId: '20000000-0000-4000-8000-000000000001',
        status: 'COMPLETED',
      }).success,
    ).toBe(false)
  })

  it('keeps branch posting broad but manager controls explicit', () => {
    expect(posPermissions(session('Agent'))).toMatchObject({ canPost: true, canManage: false })
    expect(posPermissions(session('Manager'))).toMatchObject({ canPost: true, canManage: true })
    expect(posPermissions(session('Master Admin'))).toMatchObject({
      canManage: true,
      canViewCrossBranch: true,
    })
  })
})
