import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BranchLedgerPrototype from '@/app/dashboard/accounting/ledger/BranchLedgerPrototype'

describe('Branch Ledger prototype', () => {
  it('keeps stable categories and provides a blank entry row below each one', () => {
    render(<BranchLedgerPrototype />)

    expect(screen.getByRole('heading', { name: 'Branch Ledger' })).toBeTruthy()
    expect(screen.queryByLabelText('Branch summary')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Opening & closing position' })).toBeTruthy()
    expect(screen.getByText('Net result from ledger above')).toBeTruthy()
    expect(screen.getByText('No supplier balances added for this branch.')).toBeTruthy()
    expect(screen.getByText('No bank balances added for this branch.')).toBeTruthy()
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

  it('autosaves direct item and category edits, then carries entries into the next month', () => {
    render(<BranchLedgerPrototype />)

    fireEvent.change(screen.getByLabelText('Expenses Bills & subscriptions new item'), {
      target: { value: 'So Energy' },
    })
    fireEvent.change(screen.getByLabelText('Expenses Bills & subscriptions new amount'), {
      target: { value: '162.06' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add item to Bills & subscriptions' }))

    fireEvent.change(screen.getByLabelText('Edit So Energy name'), {
      target: { value: 'So Energy Ltd' },
    })
    fireEvent.blur(screen.getByLabelText('Edit So Energy name'))
    fireEvent.change(screen.getByLabelText('Edit So Energy Ltd amount'), {
      target: { value: '200.00' },
    })
    fireEvent.blur(screen.getByLabelText('Edit So Energy Ltd amount'))
    expect(screen.getAllByText('£200.00').length).toBeGreaterThan(0)
    expect(screen.getByText('Total expenses')).toBeTruthy()
    expect(screen.getByText('Net result: -£200.00')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('New bank name'), {
      target: { value: 'Revolut' },
    })
    fireEvent.change(screen.getByLabelText('New bank closing balance'), {
      target: { value: '750' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add bank' }))

    fireEvent.change(screen.getByLabelText('Rename Bills & subscriptions category'), {
      target: { value: 'Utilities' },
    })
    fireEvent.blur(screen.getByLabelText('Rename Bills & subscriptions category'))
    expect(screen.getByLabelText('Expenses Utilities new item')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Add expenses category' }))
    fireEvent.change(screen.getByLabelText('Rename New expense category category'), {
      target: { value: 'Seasonal costs' },
    })
    fireEvent.blur(screen.getByLabelText('Rename New expense category category'))
    expect(screen.getByLabelText('Expenses Seasonal costs new item')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Finalise September 2026' }))
    expect(screen.getByRole('button', { name: 'Finalise October 2026' })).toBeTruthy()
    expect(screen.getAllByText('Carried forward · not yet edited').length).toBeGreaterThan(0)
    expect(
      (screen.getByLabelText('Start of month Revolut bank balance') as HTMLInputElement).value,
    ).toBe('750')
    expect((screen.getByLabelText('Start of month net result') as HTMLInputElement).value).toBe(
      '-200',
    )

    expect((screen.getByLabelText('Edit So Energy Ltd amount') as HTMLInputElement).value).toBe(
      '200',
    )
  })
})
