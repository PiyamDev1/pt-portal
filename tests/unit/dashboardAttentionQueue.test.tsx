import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DashboardAttentionQueue } from '@/app/dashboard/DashboardAttentionQueue'
import type { DashboardWorkQueue } from '@/lib/dashboard/workQueue'

const generatedAt = '2026-09-28T10:00:00.000Z'

describe('DashboardAttentionQueue', () => {
  it('shows source, urgency, date, reference, and a source-owned action link', () => {
    const queue: DashboardWorkQueue = {
      generatedAt,
      unavailableProviders: ['LMS'],
      items: [
        {
          id: 'bookings-pending',
          moduleId: 'bookings',
          moduleLabel: 'Bookings',
          severity: 'critical',
          title: '2 unconfirmed appointments',
          detail: 'Pending appointments starting within the next seven days.',
          count: 2,
          date: '2026-09-28T12:00:00.000Z',
          dateLabel: 'Next appointment',
          reference: 'Bookings · Bradford',
          href: '/dashboard/bookings?status=pending',
        },
      ],
    }

    render(<DashboardAttentionQueue queue={queue} />)

    expect(screen.getByRole('heading', { name: 'Attention centre' })).toBeTruthy()
    expect(screen.getByText('Urgent')).toBeTruthy()
    expect(screen.getByText('Bookings · Bradford')).toBeTruthy()
    expect(screen.getByText('Next appointment')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /2 unconfirmed appointments/ }).getAttribute('href'),
    ).toBe('/dashboard/bookings?status=pending')
    expect(screen.getByText(/Not checked: LMS/)).toBeTruthy()
  })

  it('shows a genuine all-clear only when every visible provider was checked', () => {
    render(<DashboardAttentionQueue queue={{ generatedAt, items: [], unavailableProviders: [] }} />)

    expect(screen.getByText('No linked items need attention right now.')).toBeTruthy()
    expect(screen.queryByText(/not an all-clear result/i)).toBeNull()
  })

  it('does not show an all-clear when a provider could not be checked', () => {
    render(
      <DashboardAttentionQueue
        queue={{ generatedAt, items: [], unavailableProviders: ['Ticketing'] }}
      />,
    )

    expect(screen.getByText(/this is not an all-clear result/i)).toBeTruthy()
    expect(screen.queryByText('No linked items need attention right now.')).toBeNull()
  })

  it('uses a stacked item layout in the compact notice-board rail', () => {
    const queue: DashboardWorkQueue = {
      generatedAt,
      unavailableProviders: [],
      items: [
        {
          id: 'ticketing-deadline',
          moduleId: 'ticketing',
          moduleLabel: 'Ticketing',
          severity: 'warning',
          title: 'Ticket deadline approaching',
          detail: 'One booking needs review.',
          count: 1,
          date: '2026-09-28T12:00:00.000Z',
          dateLabel: 'Deadline',
          reference: 'ABC123',
          href: '/dashboard/ticketing',
        },
      ],
    }

    render(<DashboardAttentionQueue queue={queue} compact />)

    const link = screen.getByRole('link', { name: /Ticket deadline approaching/ })
    expect(link.className).not.toContain('sm:flex-row')
    expect(
      screen.getByRole('heading', { name: 'Attention centre' }).parentElement?.parentElement
        ?.className,
    ).not.toContain('sm:flex-row')
  })
})
