import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AccountingLedgerPrototype from '@/app/dashboard/accounting/ledger/AccountingLedgerPrototype'

describe('Accounting ledger prototype', () => {
  it('clearly identifies the screen as sample-only and exposes the planned ledger controls', () => {
    render(<AccountingLedgerPrototype />)

    expect(screen.getByText('Interactive ledger preview')).toBeTruthy()
    expect(screen.getByText(/Nothing on this screen is connected to the database/i)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'General ledger' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New journal' })).toBeTruthy()
    expect(screen.getByText('Books are on track')).toBeTruthy()
  })

  it('filters sample entries and opens a removable spreadsheet-style draft row', () => {
    render(<AccountingLedgerPrototype />)

    fireEvent.click(screen.getByRole('button', { name: /Needs attention 1/i }))
    expect(screen.getAllByText('APP-22918')).toHaveLength(2)
    expect(screen.queryByText('TK-84391')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'New journal' }))
    expect(screen.getByLabelText('Draft account')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove draft row' }))
    expect(screen.queryByLabelText('Draft account')).toBeNull()
  })
})
