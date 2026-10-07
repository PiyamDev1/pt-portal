import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import BookingStatusBadge from '@/app/dashboard/bookings/BookingStatusBadge'

describe('BookingStatusBadge', () => {
  it('renders the shared full label and accessible short marker', () => {
    render(<BookingStatusBadge status="confirmed" />)

    expect(screen.getByText('Confirmed')).toBeTruthy()
    expect(screen.getByText('C')).toBeTruthy()
    expect(screen.getByText('Confirmed').closest('span')?.className).toContain('bg-green-100')
  })

  it('falls back to the pending label for an unknown status in label-only mode', () => {
    render(<BookingStatusBadge status="unrecognised" variant="label" />)

    expect(screen.getByText('Pending')).toBeTruthy()
    expect(screen.queryByText('P')).toBeNull()
  })
})
