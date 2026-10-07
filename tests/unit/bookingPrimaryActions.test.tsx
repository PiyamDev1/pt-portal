import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BookingPrimaryActions from '@/app/dashboard/bookings/BookingPrimaryActions'

describe('Booking primary actions', () => {
  it('shares mobile actions and respects refresh and location availability', () => {
    const actions = {
      onToggleSettings: vi.fn(),
      onAddAppointment: vi.fn(),
      onRefresh: vi.fn(),
      onMemberService: vi.fn(),
    }

    render(
      <BookingPrimaryActions
        variant="mobile"
        isAdmin
        showSettings={false}
        refreshing
        hasSelectedLocation={false}
        {...actions}
      />,
    )

    expect(screen.getByRole('button', { name: 'Booking Settings' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('button', { name: 'Refresh' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Member Service' }).hasAttribute('disabled')).toBe(
      true,
    )
    expect(actions.onAddAppointment).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Booking Settings' }))
    expect(actions.onToggleSettings).toHaveBeenCalledOnce()
  })

  it('renders desktop controls with the same location guard and hides admin settings for staff', () => {
    const onMemberService = vi.fn()

    render(
      <BookingPrimaryActions
        variant="desktop"
        isAdmin={false}
        showSettings={false}
        refreshing={false}
        hasSelectedLocation
        onToggleSettings={() => {}}
        onAddAppointment={() => {}}
        onRefresh={() => {}}
        onMemberService={onMemberService}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Booking Settings' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add Appointment' }))
    fireEvent.click(screen.getByRole('button', { name: 'Member Service' }))
    expect(onMemberService).toHaveBeenCalledOnce()
  })
})
