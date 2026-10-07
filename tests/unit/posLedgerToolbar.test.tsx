import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import PosLedgerToolbar, { type PosLedgerSort } from '@/app/dashboard/pos/PosLedgerToolbar'
import type { PosLedgerPeriod } from '@/lib/pos/contracts'

describe('PosLedgerToolbar', () => {
  it('delegates ledger navigation, search, sort, and filter actions', () => {
    const searchInputRef = createRef<HTMLInputElement>()
    const onPeriodChange = vi.fn<(period: PosLedgerPeriod) => void>()
    const onPrevious = vi.fn()
    const onDateChange = vi.fn<(date: string) => void>()
    const onNext = vi.fn()
    const onToday = vi.fn()
    const onSearchChange = vi.fn<(search: string) => void>()
    const onSortChange = vi.fn<(sort: PosLedgerSort) => void>()
    const onToggleFilters = vi.fn()

    const { rerender } = render(
      <PosLedgerToolbar
        period="day"
        date="2026-10-07"
        todayDate="2026-10-07"
        search=""
        sortBy="Supplier"
        filtersOpen={false}
        searchInputRef={searchInputRef}
        onPeriodChange={onPeriodChange}
        onPrevious={onPrevious}
        onDateChange={onDateChange}
        onNext={onNext}
        onToday={onToday}
        onSearchChange={onSearchChange}
        onSortChange={onSortChange}
        onToggleFilters={onToggleFilters}
      />,
    )

    expect(searchInputRef.current).toBe(screen.getByLabelText('Search transactions'))
    fireEvent.click(screen.getByRole('button', { name: 'month' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    fireEvent.change(screen.getByLabelText('Ledger date'), { target: { value: '2026-10-08' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    fireEvent.change(screen.getByLabelText('Search transactions'), {
      target: { value: 'PT-1001' },
    })
    fireEvent.change(screen.getByLabelText('Sort ledger'), { target: { value: 'Newest' } })
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))

    expect(onPeriodChange).toHaveBeenCalledWith('month')
    expect(onPrevious).toHaveBeenCalledOnce()
    expect(onDateChange).toHaveBeenCalledWith('2026-10-08')
    expect(onNext).toHaveBeenCalledOnce()
    expect(onToday).toHaveBeenCalledOnce()
    expect(onSearchChange).toHaveBeenCalledWith('PT-1001')
    expect(onSortChange).toHaveBeenCalledWith('Newest')
    expect(onToggleFilters).toHaveBeenCalledOnce()

    rerender(
      <PosLedgerToolbar
        period="month"
        date="2026-10-01"
        todayDate="2026-10-07"
        search=""
        sortBy="Supplier"
        filtersOpen
        searchInputRef={searchInputRef}
        onPeriodChange={onPeriodChange}
        onPrevious={onPrevious}
        onDateChange={onDateChange}
        onNext={onNext}
        onToday={onToday}
        onSearchChange={onSearchChange}
        onSortChange={onSortChange}
        onToggleFilters={onToggleFilters}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    fireEvent.change(screen.getByLabelText('Ledger month'), { target: { value: '2026-11' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))

    expect(onPrevious).toHaveBeenCalledTimes(2)
    expect(onDateChange).toHaveBeenCalledWith('2026-11')
    expect(onNext).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Filters' }).getAttribute('aria-expanded')).toBe(
      'true',
    )
  })
})
