import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import BookingTodaySidebar from '@/app/dashboard/bookings/BookingTodaySidebar'

describe('BookingTodaySidebar', () => {
  it('shows the queue and delegates next-booking and desk actions', () => {
    const onOpenNextBooking = vi.fn()
    const onFindAvailableTime = vi.fn()
    const onAddAppointmentDetails = vi.fn()
    const onAddToWaitlist = vi.fn()

    render(
      <BookingTodaySidebar
        appointmentCount={5}
        pendingCount={2}
        confirmedCount={3}
        nextBooking={{
          timeLabel: '10:15',
          customerName: 'Sana Iqbal',
          serviceName: 'Passport appointment',
        }}
        canCreateAppointment
        activeWaitlistCount={2}
        onOpenNextBooking={onOpenNextBooking}
        onFindAvailableTime={onFindAvailableTime}
        onAddAppointmentDetails={onAddAppointmentDetails}
        onAddToWaitlist={onAddToWaitlist}
      />,
    )

    expect(screen.getByText('Daily queue')).toBeTruthy()
    expect(screen.getByText('To confirm').nextElementSibling?.textContent).toBe('2')
    expect(screen.getByText('Confirmed').nextElementSibling?.textContent).toBe('3')
    expect(screen.getByRole('button', { name: /10:15 · Sana Iqbal/ })).toBeTruthy()
    expect(screen.getByText('2 customers still need a slot.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /10:15 · Sana Iqbal/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Find an available time' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add appointment details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to waiting list' }))

    expect(onOpenNextBooking).toHaveBeenCalledOnce()
    expect(onFindAvailableTime).toHaveBeenCalledOnce()
    expect(onAddAppointmentDetails).toHaveBeenCalledOnce()
    expect(onAddToWaitlist).toHaveBeenCalledOnce()
  })

  it('preserves empty states and blocks new appointments for past dates', () => {
    render(
      <BookingTodaySidebar
        appointmentCount={0}
        pendingCount={0}
        confirmedCount={0}
        nextBooking={null}
        canCreateAppointment={false}
        activeWaitlistCount={0}
        onOpenNextBooking={vi.fn()}
        onFindAvailableTime={vi.fn()}
        onAddAppointmentDetails={vi.fn()}
        onAddToWaitlist={vi.fn()}
      />,
    )

    expect(screen.getByText('No remaining appointments on this day.')).toBeTruthy()
    expect(screen.getByText('Past dates cannot accept new appointments.')).toBeTruthy()
    expect(screen.getByText('No customer is currently waiting for a slot.')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Find an available time' }).hasAttribute('disabled'),
    ).toBe(true)
    expect(
      screen.getByRole('button', { name: 'Add appointment details' }).hasAttribute('disabled'),
    ).toBe(true)
  })
})
