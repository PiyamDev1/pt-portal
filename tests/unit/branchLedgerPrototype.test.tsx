import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BranchLedgerPrototype from '@/app/dashboard/accounting/ledger/BranchLedgerPrototype'

describe('Branch Ledger prototype', () => {
  it('keeps stable categories and provides a blank entry row below each one', () => {
    render(<BranchLedgerPrototype />)

    expect(screen.getByRole('heading', { name: 'Branch Ledger' })).toBeTruthy()
    expect(screen.getAllByText('Category-led monthly sheet · no fixed items')).toHaveLength(2)
    expect(screen.getByLabelText('Income Commissions & transfers new item')).toBeTruthy()
    expect(screen.getByLabelText('Expenses Bills & subscriptions new amount')).toBeTruthy()
    expect(screen.getAllByText('Add first item').length).toBeGreaterThan(0)
  })

  it('locks a manager to their assigned branch and allows HQ to select a branch', () => {
    render(<BranchLedgerPrototype />)

    fireEvent.click(screen.getByRole('button', { name: 'Branch manager' }))
    expect(screen.queryByLabelText('Select branch')).toBeNull()
    expect(screen.getByText('This view is locked to the manager’s assigned branch.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'HQ staff' }))
    expect(screen.getByLabelText('Select branch')).toBeTruthy()
  })

  it('adds and quick-edits an item, then carries its name into the next month with a blank amount', () => {
    render(<BranchLedgerPrototype />)

    fireEvent.change(screen.getByLabelText('Expenses Bills & subscriptions new item'), {
      target: { value: 'So Energy' },
    })
    fireEvent.change(screen.getByLabelText('Expenses Bills & subscriptions new amount'), {
      target: { value: '162.06' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add item to Bills & subscriptions' }))

    fireEvent.click(screen.getByRole('button', { name: 'Quick edit So Energy' }))
    fireEvent.change(screen.getByLabelText('Edit So Energy amount'), {
      target: { value: '200.00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save So Energy amount' }))
    expect(screen.getAllByText('£200.00').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Finalise September 2026' }))
    expect(screen.getByRole('button', { name: 'Finalise October 2026' })).toBeTruthy()
    expect(screen.getByText('Carried from September 2026')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Quick edit So Energy' }))
    expect((screen.getByLabelText('Edit So Energy amount') as HTMLInputElement).value).toBe('0')
  })
})
