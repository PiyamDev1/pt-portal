import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SlotOption } from '@/app/dashboard/bookings/bookingClientModel'
import BookingQuickReschedulePanel from '@/app/dashboard/bookings/BookingQuickReschedulePanel'

const firstSlot: SlotOption = {
  time: '10:00',
  isoString: '2026-10-08T10:00:00.000Z',
}

const selectedSuggestion: SlotOption = {
  time: '10:30',
  isoString: '2026-10-08T10:30:00.000Z',
}

describe('BookingQuickReschedulePanel', () => {
  it('renders parent-provided choices and delegates schedule actions', () => {
    const callbacks = {
      onToggleRescheduleOnly: vi.fn(),
      onKeepCurrentTime: vi.fn(),
      onSelectTime: vi.fn(),
    }

    render(
      <BookingQuickReschedulePanel
        currentTimeLabel="9:00 AM"
        selectedTimeLabel="10:30 AM"
        selectedStartTime={selectedSuggestion.isoString}
        selectedTimeChanged
        rescheduleOnly={false}
        quickOffsets={[{ minutes: 15, isoString: '2026-10-08T09:15:00.000Z' }]}
        firstAvailableSlot={firstSlot}
        nextAvailableStartTime={selectedSuggestion.isoString}
        suggestions={[firstSlot, selectedSuggestion]}
        {...callbacks}
      />,
    )

    expect(screen.getByText(/Current slot: 9:00 AM/)).toBeTruthy()
    expect(screen.getByText('New time selected: 10:30 AM.')).toBeTruthy()
    expect(screen.getByRole('button', { name: '10:30' }).className).toContain('bg-emerald-100')

    fireEvent.click(screen.getByRole('button', { name: 'Reschedule only' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep current time' }))
    fireEvent.click(screen.getByRole('button', { name: '+15 min' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next available' }))
    fireEvent.click(screen.getByRole('button', { name: 'First available' }))
    fireEvent.click(screen.getByRole('button', { name: '10:00' }))

    expect(callbacks.onToggleRescheduleOnly).toHaveBeenCalledOnce()
    expect(callbacks.onKeepCurrentTime).toHaveBeenCalledOnce()
    expect(callbacks.onSelectTime).toHaveBeenNthCalledWith(1, '2026-10-08T09:15:00.000Z')
    expect(callbacks.onSelectTime).toHaveBeenNthCalledWith(2, selectedSuggestion.isoString)
    expect(callbacks.onSelectTime).toHaveBeenNthCalledWith(3, firstSlot.isoString)
    expect(callbacks.onSelectTime).toHaveBeenNthCalledWith(4, firstSlot.isoString)
  })

  it('keeps First available disabled and hides Next available when no slots are supplied', () => {
    const onSelectTime = vi.fn()

    render(
      <BookingQuickReschedulePanel
        currentTimeLabel="9:00 AM"
        selectedTimeLabel=""
        selectedStartTime=""
        selectedTimeChanged={false}
        rescheduleOnly
        quickOffsets={[]}
        firstAvailableSlot={null}
        nextAvailableStartTime={null}
        suggestions={[]}
        onToggleRescheduleOnly={vi.fn()}
        onKeepCurrentTime={vi.fn()}
        onSelectTime={onSelectTime}
      />,
    )

    expect(
      (screen.getByRole('button', { name: 'First available' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.queryByRole('button', { name: 'Next available' })).toBeNull()
    expect(screen.queryByText(/New time selected/)).toBeNull()
    expect(onSelectTime).not.toHaveBeenCalled()
  })
})
