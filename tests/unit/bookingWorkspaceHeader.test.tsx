import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BookingWorkspaceHeader, {
  type BookingWorkspaceFilterBadge,
} from '@/app/dashboard/bookings/BookingWorkspaceHeader'

describe('Booking workspace header', () => {
  it('shows the selected view and active filters, and delegates view changes', () => {
    const onViewChange = vi.fn()
    const filterBadges: BookingWorkspaceFilterBadge[] = [
      { key: 'source', label: 'WhatsApp', icon: 'filter' },
      { key: 'location', label: 'Location active', icon: 'location' },
    ]

    render(
      <BookingWorkspaceHeader
        view="multi"
        periodLabel="October 2026"
        filterBadges={filterBadges}
        onViewChange={onViewChange}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Appointments' })).toBeTruthy()
    expect(screen.getByText('October 2026')).toBeTruthy()
    expect(screen.getByText('Calendar overview')).toBeTruthy()
    expect(screen.getByText('WhatsApp')).toBeTruthy()
    expect(screen.getByText('Location active')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Calendar' }).getAttribute('aria-pressed')).toBe(
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Week' }))
    expect(onViewChange).toHaveBeenCalledWith('week')
  })
})
