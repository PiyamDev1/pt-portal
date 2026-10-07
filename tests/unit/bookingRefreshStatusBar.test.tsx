import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BookingRefreshStatusBar from '@/app/dashboard/bookings/BookingRefreshStatusBar'

describe('Booking refresh status bar', () => {
  it('shows refresh state and visible counts, and delegates retries', () => {
    const onRetry = vi.fn()

    render(
      <BookingRefreshStatusBar
        refreshLabel="10:32"
        refreshing={false}
        autoRefresh
        refreshCountdown={12}
        loadError="Could not load appointments"
        totalVisible={8}
        pendingVisible={3}
        confirmedVisible={4}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByText('Last updated: 10:32')).toBeTruthy()
    expect(screen.getByText('Next refresh in 12s')).toBeTruthy()
    expect(screen.getByText('Visible 8')).toBeTruthy()
    expect(screen.getByText('Pending 3')).toBeTruthy()
    expect(screen.getByText('Confirmed 4')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('shows paused state and disables retry during refresh', () => {
    render(
      <BookingRefreshStatusBar
        refreshLabel="Never"
        refreshing
        autoRefresh={false}
        refreshCountdown={0}
        loadError="Still loading"
        totalVisible={0}
        pendingVisible={0}
        confirmedVisible={0}
        onRetry={() => {}}
      />,
    )

    expect(screen.getByText('Checking for changes...')).toBeTruthy()
    expect(screen.getByText('Auto-refresh paused')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' }).hasAttribute('disabled')).toBe(true)
  })
})
