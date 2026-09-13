import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BranchLedgerPrototype from '@/app/dashboard/accounting/ledger/BranchLedgerPrototype'

describe('Branch Ledger prototype', () => {
  it('uses fixed recurring monthly categories instead of dated transactions', () => {
    render(<BranchLedgerPrototype />)

    expect(screen.getByRole('heading', { name: 'Branch Ledger' })).toBeTruthy()
    expect(screen.getAllByText('Fixed monthly categories · no daily dates')).toHaveLength(2)
    expect(screen.getAllByText('Wages & payees')).toHaveLength(2)
    expect(screen.getAllByText('Staff commissions')).toHaveLength(2)
    expect(screen.getAllByText('So Energy')).toHaveLength(2)
  })

  it('locks a manager to their assigned branch and allows HQ to select a branch', () => {
    render(<BranchLedgerPrototype />)

    fireEvent.click(screen.getByRole('button', { name: 'Branch manager' }))
    expect(screen.queryByLabelText('Select branch')).toBeNull()
    expect(screen.getByText('This view is locked to the manager’s assigned branch.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'HQ staff' }))
    expect(screen.getByLabelText('Select branch')).toBeTruthy()
  })

  it('supports quick edit and a separate quick entry for exceptional items', () => {
    render(<BranchLedgerPrototype />)

    fireEvent.click(screen.getByRole('button', { name: 'Quick edit So Energy' }))
    fireEvent.change(screen.getByLabelText('Edit So Energy amount'), {
      target: { value: '200.00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save So Energy amount' }))
    expect(screen.getByText('£200.00')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Quick entry amount'), { target: { value: '55' } })
    fireEvent.change(screen.getByLabelText('Quick entry note'), {
      target: { value: 'One-off office item' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getAllByText('One-off office item')).toHaveLength(2)
  })
})
