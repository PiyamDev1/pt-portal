import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import PosLedgerEntries from '@/app/dashboard/pos/PosLedgerEntries'
import type { PosLedgerTransaction } from '@/lib/pos/contracts'

function transaction(overrides: Partial<PosLedgerTransaction> = {}): PosLedgerTransaction {
  return {
    id: 'transaction-1',
    reference: 'POS-1042',
    date: '2026-10-07',
    time: '11:30',
    name: 'Ayesha Khan',
    category: 'Visa service',
    method: 'Cash',
    amount: 15,
    points: 5,
    status: 'Posted',
    note: '',
    entryAgent: 'staff-1',
    sourceLinkId: null,
    tenders: [],
    ...overrides,
  }
}

describe('POS ledger entries', () => {
  it('shares monthly date grouping and delegates desktop row selection', () => {
    const onSelect = vi.fn()

    render(
      <PosLedgerEntries
        transactions={[
          transaction(),
          transaction({ id: 'transaction-2', reference: 'POS-1043', amount: 10 }),
          transaction({ id: 'transaction-3', date: '2026-10-08', amount: -5 }),
        ]}
        period="month"
        selectedTransactionId="transaction-2"
        height={280}
        onSelect={onSelect}
      />,
    )

    expect(screen.getByText(/2 entries · net \+£25\.00/)).toBeTruthy()
    expect(screen.getByText(/1 entries · net −£5\.00/)).toBeTruthy()

    const selectedRow = screen.getAllByText('Ayesha Khan')[1].closest('tr')
    expect(selectedRow?.className).toContain('bg-red-50/50')
    fireEvent.click(selectedRow!)
    expect(onSelect).toHaveBeenCalledWith('transaction-2')
  })

  it('keeps the mobile transaction card selectable without adding month summaries', () => {
    const onSelect = vi.fn()

    render(
      <PosLedgerEntries
        transactions={[transaction({ amount: -15 })]}
        period="day"
        selectedTransactionId=""
        height={200}
        onSelect={onSelect}
      />,
    )

    expect(screen.queryByText(/entries · net/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Ayesha Khan/ }))
    expect(onSelect).toHaveBeenCalledWith('transaction-1')
  })
})
