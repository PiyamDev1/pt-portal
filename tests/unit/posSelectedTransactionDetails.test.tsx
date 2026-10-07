import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import PosSelectedTransactionDetails from '@/app/dashboard/pos/PosSelectedTransactionDetails'
import type { PosLedgerTransaction } from '@/lib/pos/contracts'

const transaction: PosLedgerTransaction = {
  id: 'transaction-1',
  reference: 'POS-1042',
  date: '2026-10-07',
  time: '11:30',
  name: 'Ayesha Khan',
  category: 'Visa service',
  method: 'Card',
  amount: -25,
  points: 0,
  status: 'Posted',
  note: '',
  entryAgent: 'staff-1',
  sourceLinkId: null,
  outgoingType: 'EXPENSE',
  refundableRemaining: 15,
  tenders: [
    {
      id: 'tender-1',
      method: 'Card',
      amount: 25,
      direction: 'OUT',
      reconciliationStatus: 'COMPLETED',
      destination: 'SUPPLIER_DIRECT',
    },
  ],
  sourceLinks: [
    {
      id: 'source-1',
      sourceType: 'APPLICATIONS',
      namespace: 'visa',
      recordId: 'visa-1',
      displayReference: 'VISA-1042',
    },
  ],
  refunds: [
    {
      id: 'refund-1',
      reference: 'POS-R-1',
      amount: 10,
      status: 'COMPLETED',
      reasonCode: 'CUSTOMER_REQUEST',
      createdAt: '2026-10-07T11:45:00Z',
      pointsReversed: 0,
    },
  ],
  auditEvents: [
    {
      id: 1,
      eventType: 'REFUND_POSTED',
      summary: 'Partial refund posted',
      actor: 'Zain Ahmed',
      createdAt: '2026-10-07T11:45:00Z',
    },
  ],
}

describe('POS selected transaction details', () => {
  it('renders source and settlement context and delegates all actions', () => {
    const onCorrect = vi.fn()
    const onRefund = vi.fn()
    const onReceipt = vi.fn()
    const onClose = vi.fn()

    render(
      <PosSelectedTransactionDetails
        transaction={transaction}
        canManage
        onCorrect={onCorrect}
        onRefund={onRefund}
        onReceipt={onReceipt}
        onClose={onClose}
      />,
    )

    expect(screen.getByRole('heading', { name: 'POS-1042' })).toBeTruthy()
    expect(screen.getByText('APPLICATIONS · VISA-1042')).toBeTruthy()
    expect(screen.getByText('Card £25.00 · COMPLETED · Provider direct')).toBeTruthy()
    expect(screen.getByText('£15.00 refundable')).toBeTruthy()
    expect(screen.getByText('REFUND_POSTED · Zain Ahmed')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Correct' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refund' }))
    fireEvent.click(screen.getByRole('button', { name: 'Receipt' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close transaction details' }))

    expect(onCorrect).toHaveBeenCalledOnce()
    expect(onRefund).toHaveBeenCalledOnce()
    expect(onReceipt).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps correction controls hidden without management permission', () => {
    render(
      <PosSelectedTransactionDetails
        transaction={transaction}
        canManage={false}
        onCorrect={vi.fn()}
        onRefund={vi.fn()}
        onReceipt={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Correct' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Refund' })).toBeTruthy()
  })
})
