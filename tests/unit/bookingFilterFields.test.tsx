import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BookingFilterFields, {
  BookingLocationSelect,
} from '@/app/dashboard/bookings/BookingFilterFields'
import { BookingSource, BookingStatus } from '@/app/types/bookings'
import type { BranchLocationOption } from '@/app/dashboard/settings/components/BookingSettingsTab'
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
const locations: BranchLocationOption[] = [
  { id: 'central', name: 'London Central', branch_code: 'LON' },
  { id: 'north', name: 'Manchester North', branch_code: 'MAN' },
]

describe('BookingFilterFields', () => {
  it('uses mobile sizing and delegates changes through the shared filter contract', () => {
    const onSourceChange = vi.fn()
    const onStatusChange = vi.fn()
    const onServiceChange = vi.fn()
    const onShowCancelledChange = vi.fn()

    render(
      <BookingFilterFields
        variant="mobile"
        sourceFilter="all"
        statusFilter="all"
        serviceFilter="all"
        serviceOptions={serviceOptions}
        showCancelled
        onSourceChange={onSourceChange}
        onStatusChange={onStatusChange}
        onServiceChange={onServiceChange}
        onShowCancelledChange={onShowCancelledChange}
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
    fireEvent.click(screen.getByLabelText('Show cancelled'))

    expect(onSourceChange).toHaveBeenCalledWith(BookingSource.WHATSAPP)
    expect(onStatusChange).toHaveBeenCalledWith(BookingStatus.CONFIRMED)
    expect(onServiceChange).toHaveBeenCalledWith('visa-review')
    expect(onShowCancelledChange).toHaveBeenCalledWith(false)
    expect(screen.getByRole('option', { name: 'Visa review' })).toBeTruthy()
  })

  it('shares branch options and selection behavior across mobile and desktop layouts', () => {
    const onChange = vi.fn()
    const props = {
      locations,
      selectedLocationId: 'central',
      onChange,
    }
    const { rerender } = render(<BookingLocationSelect variant="mobile" {...props} />)

    expect(screen.getByRole('option', { name: 'London Central (LON)' })).toBeTruthy()
    expect(screen.getByLabelText('Branch location').className).toContain('min-h-11')
    fireEvent.change(screen.getByLabelText('Branch location'), { target: { value: 'north' } })
    expect(onChange).toHaveBeenCalledWith('north')

    rerender(<BookingLocationSelect variant="desktop" {...props} />)
    expect(screen.getByLabelText('Branch location').className).toContain('pl-9')
    fireEvent.change(screen.getByLabelText('Branch location'), { target: { value: 'north' } })
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})
