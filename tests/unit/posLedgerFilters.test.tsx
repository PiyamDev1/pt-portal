import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import PosLedgerFilters, { type PosLedgerPaymentFilter } from '@/app/dashboard/pos/PosLedgerFilters'

describe('PosLedgerFilters', () => {
  it('renders live options and delegates all changes and clear action', () => {
    const onActiveFilterChange = vi.fn<(value: PosLedgerPaymentFilter) => void>()
    const onCategoryChange = vi.fn<(value: string) => void>()
    const onStatusChange = vi.fn<(value: string) => void>()
    const onOutgoingChange = vi.fn<(value: string) => void>()
    const onSupplierChange = vi.fn<(value: string) => void>()
    const onTillChange = vi.fn<(value: string) => void>()
    const onAgentChange = vi.fn<(value: string) => void>()
    const onSourceChange = vi.fn<(value: string) => void>()
    const onLoyaltyChange = vi.fn<(value: string) => void>()
    const onMinimumAmountChange = vi.fn<(value: string) => void>()
    const onMaximumAmountChange = vi.fn<(value: string) => void>()
    const onClear = vi.fn()

    render(
      <PosLedgerFilters
        options={{
          catalogue: [{ id: 'doc', key: 'document', label: 'Document', optionLabel: 'Standard' }],
          suppliers: [{ id: 'supplier-1', name: 'Airline One' }],
          tills: [{ id: 'till-1', name: 'Front desk' }],
          employees: [{ id: 'employee-1', name: 'A. Agent' }],
        }}
        activeFilter="All"
        categoryFilter=""
        statusFilter=""
        outgoingFilter=""
        supplierFilter=""
        tillFilter=""
        agentFilter=""
        sourceFilter=""
        loyaltyFilter=""
        minAmountFilter=""
        maxAmountFilter=""
        onActiveFilterChange={onActiveFilterChange}
        onCategoryChange={onCategoryChange}
        onStatusChange={onStatusChange}
        onOutgoingChange={onOutgoingChange}
        onSupplierChange={onSupplierChange}
        onTillChange={onTillChange}
        onAgentChange={onAgentChange}
        onSourceChange={onSourceChange}
        onLoyaltyChange={onLoyaltyChange}
        onMinimumAmountChange={onMinimumAmountChange}
        onMaximumAmountChange={onMaximumAmountChange}
        onClear={onClear}
      />,
    )

    expect(screen.getByRole('option', { name: 'Document · Standard' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'Airline One' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'Front desk' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'A. Agent' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Card' }))
    fireEvent.change(screen.getByLabelText('Category filter'), { target: { value: 'document' } })
    fireEvent.change(screen.getByLabelText('Status filter'), { target: { value: 'POSTED' } })
    fireEvent.change(screen.getByLabelText('Outgoing type filter'), {
      target: { value: 'REFUND' },
    })
    fireEvent.change(screen.getByLabelText('Supplier filter'), { target: { value: 'supplier-1' } })
    fireEvent.change(screen.getByLabelText('Till filter'), { target: { value: 'till-1' } })
    fireEvent.change(screen.getByLabelText('Agent filter'), { target: { value: 'employee-1' } })
    fireEvent.change(screen.getByLabelText('Source filter'), { target: { value: 'LMS' } })
    fireEvent.change(screen.getByLabelText('Loyalty filter'), { target: { value: 'ATTACHED' } })
    fireEvent.change(screen.getByLabelText('Minimum amount filter'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('Maximum amount filter'), {
      target: { value: '100' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(onActiveFilterChange).toHaveBeenCalledWith('Card')
    expect(onCategoryChange).toHaveBeenCalledWith('document')
    expect(onStatusChange).toHaveBeenCalledWith('POSTED')
    expect(onOutgoingChange).toHaveBeenCalledWith('REFUND')
    expect(onSupplierChange).toHaveBeenCalledWith('supplier-1')
    expect(onTillChange).toHaveBeenCalledWith('till-1')
    expect(onAgentChange).toHaveBeenCalledWith('employee-1')
    expect(onSourceChange).toHaveBeenCalledWith('LMS')
    expect(onLoyaltyChange).toHaveBeenCalledWith('ATTACHED')
    expect(onMinimumAmountChange).toHaveBeenCalledWith('10')
    expect(onMaximumAmountChange).toHaveBeenCalledWith('100')
    expect(onClear).toHaveBeenCalledOnce()
  })
})
