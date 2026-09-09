import { describe, expect, it } from 'vitest'
import type { StaffSession } from '@/lib/auth/staffSession'
import { posPermissions } from '@/lib/pos/access'
import {
  posPostTransactionSchema,
  posRefundSchema,
  posReconciliationSchema,
} from '@/lib/pos/inputContracts'

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
