import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import BookingPeriodNavigation from '@/app/dashboard/bookings/BookingPeriodNavigation'

describe('BookingPeriodNavigation', () => {
  it.each([
    ['today', 'Previous day', 'Next day'],
    ['week', 'Previous week', 'Next week'],
    ['list', 'Previous week', 'Next week'],
    ['multi', 'Previous month', 'Next month'],
  ] as const)('labels %s navigation correctly on mobile and desktop', (view, previous, next) => {
    const onPrevious = vi.fn()
    const onToday = vi.fn()
    const onNext = vi.fn()

    const { rerender } = render(
      <BookingPeriodNavigation
        view={view}
        isCurrentPeriod={false}
        variant="mobile"
        onPrevious={onPrevious}
        onToday={onToday}
        onNext={onNext}
      />,
    )

    const previousButton = screen.getByRole('button', { name: previous })
    const todayButton = screen.getByRole('button', { name: 'Today' })
    const nextButton = screen.getByRole('button', { name: next })

    fireEvent.click(previousButton)
    fireEvent.click(todayButton)
    fireEvent.click(nextButton)

    expect(onPrevious).toHaveBeenCalledOnce()
    expect(onToday).toHaveBeenCalledOnce()
    expect(onNext).toHaveBeenCalledOnce()

    rerender(
      <BookingPeriodNavigation
        view={view}
        isCurrentPeriod
        variant="desktop"
        onPrevious={onPrevious}
        onToday={onToday}
        onNext={onNext}
      />,
    )

    screen.getByRole('button', { name: previous })
    screen.getByRole('button', { name: next })
    screen.getByRole('button', { name: 'Today' })
  })
})
