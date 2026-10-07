import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import BookingWorkspaceTools from '@/app/dashboard/bookings/BookingWorkspaceTools'
import { BookingSource, BookingStatus } from '@/app/types/bookings'
import type { BookingServiceOption } from '@/app/dashboard/bookings/bookingClientModel'

const serviceOptions: BookingServiceOption[] = [
  {
    id: 'visa-review',
    name: 'Visa review',
    is_active: true,
    duration_minutes: 30,
    buffer_minutes: 0,
    duration_per_additional_person_minutes: 0,
  },
]

describe('BookingWorkspaceTools', () => {
  it('delegates filter changes, reset, refresh, save, and export actions', () => {
    const onResetFilters = vi.fn()
    const onSourceChange = vi.fn()
    const onStatusChange = vi.fn()
    const onServiceChange = vi.fn()
    const onShowCancelledChange = vi.fn()
    const onRefresh = vi.fn()
    const onSaveView = vi.fn()
    const onExport = vi.fn()

    render(
      <BookingWorkspaceTools
        sourceFilter="all"
        statusFilter="all"
        serviceFilter="all"
        serviceOptions={serviceOptions}
        showCancelled
        refreshing={false}
        onResetFilters={onResetFilters}
        onSourceChange={onSourceChange}
        onStatusChange={onStatusChange}
        onServiceChange={onServiceChange}
        onShowCancelledChange={onShowCancelledChange}
        onRefresh={onRefresh}
        onSaveView={onSaveView}
        onExport={onExport}
      />,
    )

    fireEvent.change(screen.getByLabelText('Booking source'), {
      target: { value: BookingSource.WHATSAPP },
    })
    fireEvent.change(screen.getByLabelText('Appointment status'), {
      target: { value: BookingStatus.CONFIRMED },
    })
    fireEvent.change(screen.getByLabelText('Booking service'), {
      target: { value: 'visa-review' },
    })
    fireEvent.click(screen.getByLabelText('Include cancelled'))
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save view' }))
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))

    expect(onSourceChange).toHaveBeenCalledWith(BookingSource.WHATSAPP)
    expect(onStatusChange).toHaveBeenCalledWith(BookingStatus.CONFIRMED)
    expect(onServiceChange).toHaveBeenCalledWith('visa-review')
    expect(onShowCancelledChange).toHaveBeenCalledWith(false)
    expect(onResetFilters).toHaveBeenCalledOnce()
    expect(onRefresh).toHaveBeenCalledOnce()
    expect(onSaveView).toHaveBeenCalledOnce()
    expect(onExport).toHaveBeenCalledOnce()
  })

  it('disables refresh while the parent is already refreshing', () => {
    render(
      <BookingWorkspaceTools
        sourceFilter="all"
        statusFilter="all"
        serviceFilter="all"
        serviceOptions={[]}
        showCancelled
        refreshing
        onResetFilters={vi.fn()}
        onSourceChange={vi.fn()}
        onStatusChange={vi.fn()}
        onServiceChange={vi.fn()}
        onShowCancelledChange={vi.fn()}
        onRefresh={vi.fn()}
        onSaveView={vi.fn()}
        onExport={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Refreshing' }).hasAttribute('disabled')).toBe(true)
  })
})
