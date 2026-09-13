import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BranchLedgerPrototype from '@/app/dashboard/accounting/ledger/BranchLedgerPrototype'

describe('Branch Ledger prototype', () => {
  it('keeps the concept clearly marked as sample-only and shows two separate sheets', () => {
    render(<BranchLedgerPrototype />)

    expect(screen.getByText('Branch Ledger UI preview')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Branch Ledger' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Income' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Expenses' })).toBeTruthy()
  })

  it('locks the manager preview to their own branch and lets HQ select a branch', () => {
    render(<BranchLedgerPrototype />)

    expect(screen.getByLabelText('Select branch')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Branch manager' }))
    expect(screen.queryByLabelText('Select branch')).toBeNull()
    expect(screen.getByText('This view is locked to the manager’s assigned branch.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'HQ staff' }))
    fireEvent.change(screen.getByLabelText('Select branch'), { target: { value: 'Bradford' } })
    expect(screen.getAllByText('Premises rent')).not.toHaveLength(0)
  })

  it('opens an editable row on the matching income or expense sheet', () => {
    render(<BranchLedgerPrototype />)

    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))
    expect(screen.getByLabelText('Expenses draft description')).toBeTruthy()
    expect(screen.queryByLabelText('Income draft description')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove expenses draft' }))
    expect(screen.queryByLabelText('Expenses draft description')).toBeNull()
  })
})
