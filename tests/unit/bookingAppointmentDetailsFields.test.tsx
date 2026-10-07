import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BookingDraftPayload } from '@/app/types/bookings'
import type { BookingServiceOption } from '@/app/dashboard/bookings/bookingClientModel'
import BookingAppointmentDetailsFields from '@/app/dashboard/bookings/BookingAppointmentDetailsFields'

const appointmentForm: BookingDraftPayload = {
  customer_name: '',
  customer_email: '',
  phone_country_code: '+44',
  phone_local: '',
  service_id: 'service-1',
  notes: '',
  tags: '',
  date: '2026-10-08',
  start_time: '',
  end_time: '',
  manual_override: false,
  person_count: 1,
}

const serviceOptions = [
  {
    id: 'service-1',
    name: 'Consultation',
    is_active: true,
    duration_minutes: 30,
    buffer_minutes: 0,
    duration_per_additional_person_minutes: 0,
  },
] satisfies BookingServiceOption[]

function renderFields() {
  const callbacks = {
    onFieldChange: vi.fn(),
    onServiceChange: vi.fn(),
    onDateChange: vi.fn(),
    onManualOverrideChange: vi.fn(),
    onToggleNotes: vi.fn(),
  }

  render(
    <BookingAppointmentDetailsFields
      appointmentForm={appointmentForm}
      showRescheduleOnly={false}
      isEditing={false}
      todayDateKey="2026-10-07"
      serviceOptions={serviceOptions}
      invalidLocalPhone={false}
      manualOverrideWarning={null}
      showNotesEditor={false}
      notesAutosaveState="idle"
      {...callbacks}
    />,
  )

  return callbacks
}

describe('BookingAppointmentDetailsFields', () => {
  it('delegates customer-field edits and service changes to the workspace', () => {
    const callbacks = renderFields()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada Lovelace' } })
    fireEvent.change(screen.getByLabelText('Service'), { target: { value: 'service-1' } })

    expect(callbacks.onFieldChange).toHaveBeenCalledWith({ customer_name: 'Ada Lovelace' })
    expect(callbacks.onServiceChange).toHaveBeenCalledWith('service-1')
  })

  it('delegates date and manual-override controls without owning form state', () => {
    const callbacks = renderFields()

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-09' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Manual override/ }))

    expect(callbacks.onDateChange).toHaveBeenCalledWith('2026-10-09')
    expect(callbacks.onManualOverrideChange).toHaveBeenCalledWith(true)
  })
})
