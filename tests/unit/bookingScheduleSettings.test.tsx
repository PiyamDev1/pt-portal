import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BookingScheduleOverridesEditor,
  BookingWeeklyScheduleEditor,
  buildDefaultBookingWeek,
  buildDefaultScheduleOverride,
  useBookingScheduleSettings,
  type BookingScheduleSettingsModel,
} from '@/app/dashboard/settings/components/BookingScheduleSettings'

function model(
  overrides: Partial<BookingScheduleSettingsModel> = {},
): BookingScheduleSettingsModel {
  return {
    weeklySettings: buildDefaultBookingWeek('location-1').slice(1, 2),
    overrides: [],
    newOverrideDate: '',
    newOverride: buildDefaultScheduleOverride(),
    loading: false,
    updateDay: vi.fn(),
    setNewOverrideDate: vi.fn(),
    updateOverride: vi.fn(),
    saveWeekly: vi.fn().mockResolvedValue(undefined),
    saveOverride: vi.fn().mockResolvedValue(undefined),
    deleteOverride: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function ScheduleHarness() {
  const schedule = useBookingScheduleSettings('location-1')
  const [showOverrides, setShowOverrides] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setShowOverrides(true)}>
        Show special dates
      </button>
      <BookingWeeklyScheduleEditor model={schedule} />
      {showOverrides ? <BookingScheduleOverridesEditor model={schedule} /> : null}
    </>
  )
}

describe('shared booking schedule settings', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps weekly schedule controls wired to one shared model', () => {
    const schedule = model()
    render(<BookingWeeklyScheduleEditor model={schedule} />)

    fireEvent.change(screen.getByLabelText('Open'), { target: { value: '10:00' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Accept bookings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save weekly hours' }))

    expect(schedule.updateDay).toHaveBeenCalledWith(1, 'open_time', '10:00')
    expect(schedule.updateDay).toHaveBeenCalledWith(1, 'is_closed', true)
    expect(schedule.saveWeekly).toHaveBeenCalledOnce()
  })

  it('uses the same special-date editor for notes, closure, save, and delete', () => {
    const schedule = model({
      newOverrideDate: '2026-12-25',
      overrides: [
        {
          id: 'override-1',
          location_id: 'location-1',
          date: '2026-12-25',
          ...buildDefaultScheduleOverride(),
          is_closed: true,
          notes: 'Christmas Day',
        },
      ],
    })
    render(<BookingScheduleOverridesEditor model={schedule} />)

    fireEvent.change(screen.getByLabelText('Notes (optional)'), {
      target: { value: 'Bank Holiday' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Closed all day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save one-off schedule' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(schedule.updateOverride).toHaveBeenCalledWith('notes', 'Bank Holiday')
    expect(schedule.updateOverride).toHaveBeenCalledWith('is_closed', true)
    expect(schedule.saveOverride).toHaveBeenCalledOnce()
    expect(schedule.deleteOverride).toHaveBeenCalledWith('override-1')
  })

  it('loads schedule data once and preserves it while callers switch panels', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ settings: buildDefaultBookingWeek('location-1') }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ overrides: [] }),
      })
    vi.stubGlobal('fetch', fetchMock)

    render(<ScheduleHarness />)

    await waitFor(() => expect(screen.getByText('Monday')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Show special dates' }))

    expect(screen.getByText('Upcoming one-off schedules')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
