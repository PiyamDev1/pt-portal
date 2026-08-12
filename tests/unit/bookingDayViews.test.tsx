import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BookingSource, BookingStatus } from '@/app/types/bookings'
import { BookingRow, SelectedDayPanel } from '@/app/dashboard/bookings/BookingDayViews'
import type { BookingWithService } from '@/app/dashboard/bookings/bookingClientModel'

const booking: BookingWithService = {
  id: 'booking-1',
  customer_name: 'Amina Khan',
  customer_phone: '07700900123',
  customer_email: 'amina@example.com',
  service_id: 'service-1',
  person_count: 2,
  tags: ['priority'],
  start_time: '2026-08-12T09:30:00.000Z',
  end_time: '2026-08-12T10:00:00.000Z',
  status: BookingStatus.PENDING,
  source: BookingSource.PORTAL,
  notes: 'Bring supporting documents',
  created_at: '2026-08-01T10:00:00.000Z',
  booking_services: { name: 'Passport appointment', duration_minutes: 30 },
}

describe('booking day views', () => {
  it('opens the selected-day agenda from the empty-state panel', () => {
    const onOpenDayAgenda = vi.fn()

    render(
      <SelectedDayPanel
        selectedDate={new Date('2026-08-12T00:00:00.000Z')}
        today={new Date('2026-08-12T00:00:00.000Z')}
        selectedBookings={[]}
        loading={false}
        updatingId={null}
        onStatusChange={vi.fn()}
        onEditBooking={vi.fn()}
        onOpenHistory={vi.fn()}
        onResendEmail={vi.fn()}
        resendingBookingId={null}
        selectedDateCount={0}
        onOpenDayAgenda={onOpenDayAgenda}
        enableQuickAvailability={false}
        serviceOptions={[]}
        quickServiceId=""
        quickPersonCount={1}
        quickSlots={[]}
        quickSlotsLoading={false}
        quickSlotsError={null}
        onQuickServiceChange={vi.fn()}
        onQuickPersonCountChange={vi.fn()}
        onQuickSelectSlot={vi.fn()}
      />,
    )

    expect(screen.getByText('No appointments on this day')).toBeTruthy()
    fireEvent.click(screen.getByRole('button'))
    expect(onOpenDayAgenda).toHaveBeenCalledOnce()
  })

  it('keeps booking-row actions wired to the booking identity', () => {
    const onStatusChange = vi.fn()
    const onEditBooking = vi.fn()
    const onOpenHistory = vi.fn()
    const onResendEmail = vi.fn()

    render(
      <BookingRow
        booking={booking}
        onStatusChange={onStatusChange}
        onEditBooking={onEditBooking}
        onOpenHistory={onOpenHistory}
        onResendEmail={onResendEmail}
        resendingBookingId={null}
        updatingId={null}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'History' }))
    fireEvent.click(screen.getByRole('button', { name: 'Re-send' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(onEditBooking).toHaveBeenCalledWith(booking)
    expect(onOpenHistory).toHaveBeenCalledWith(booking.id)
    expect(onResendEmail).toHaveBeenCalledWith(booking)
    expect(onStatusChange).toHaveBeenCalledWith(booking.id, BookingStatus.CONFIRMED)
  })
})
