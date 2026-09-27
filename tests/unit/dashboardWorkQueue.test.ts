import { describe, expect, it } from 'vitest'
import { buildDashboardWorkQueue } from '@/lib/dashboard/workQueue'

const generatedAt = '2026-09-28T10:00:00.000Z'

describe('dashboard work queue', () => {
  it('builds and prioritises read-only items from visible source modules', () => {
    const queue = buildDashboardWorkQueue({
      generatedAt,
      visibleModuleIds: ['bookings', 'ticketing', 'lms'],
      bookings: {
        available: true,
        pendingCount: 2,
        earliestStartAt: '2026-09-28T12:00:00.000Z',
        locationName: 'Bradford',
      },
      ticketing: {
        available: true,
        dueTimeLimitCount: 3,
        earliestTimeLimitAt: '2026-09-29T06:00:00.000Z',
        openScheduleChangeCount: 1,
        earliestAffectedDepartureAt: '2026-09-30T09:00:00.000Z',
      },
      lms: {
        available: true,
        overdueAccountCount: 4,
        dueSoonAccountCount: 5,
        loadedAt: generatedAt,
      },
    })

    expect(queue.unavailableProviders).toEqual([])
    expect(queue.items.map((item) => item.id)).toEqual([
      'bookings-pending',
      'lms-overdue',
      'ticketing-time-limits',
      'ticketing-schedule-changes',
      'lms-due-soon',
    ])
    expect(queue.items[0]).toMatchObject({
      severity: 'critical',
      reference: 'Bookings · Bradford',
      href: '/dashboard/bookings?status=pending',
    })
    expect(queue.items.find((item) => item.id === 'lms-overdue')).toMatchObject({
      count: 4,
      href: '/dashboard/lms?filter=overdue',
    })
    expect(queue.items.find((item) => item.id === 'ticketing-schedule-changes')).toMatchObject({
      href: '/dashboard/ticketing#flight-monitoring',
    })
    expect(queue.items.find((item) => item.id === 'ticketing-time-limits')).toMatchObject({
      href: '/dashboard/ticketing/ledger?status=held',
    })
  })

  it('does not expose hidden modules or report them as unavailable', () => {
    const queue = buildDashboardWorkQueue({
      generatedAt,
      visibleModuleIds: ['bookings'],
      bookings: {
        available: true,
        pendingCount: 0,
        earliestStartAt: null,
        locationName: 'Leeds',
      },
      ticketing: {
        available: true,
        dueTimeLimitCount: 10,
        earliestTimeLimitAt: generatedAt,
        openScheduleChangeCount: 10,
        earliestAffectedDepartureAt: generatedAt,
      },
      lms: {
        available: false,
        overdueAccountCount: 0,
        dueSoonAccountCount: 0,
        loadedAt: generatedAt,
      },
    })

    expect(queue.items).toEqual([])
    expect(queue.unavailableProviders).toEqual([])
  })

  it('distinguishes provider failures from a genuinely clear queue', () => {
    const queue = buildDashboardWorkQueue({
      generatedAt,
      visibleModuleIds: ['bookings', 'ticketing', 'lms'],
      bookings: {
        available: false,
        pendingCount: 0,
        earliestStartAt: null,
        locationName: 'Assigned branch',
      },
      ticketing: {
        available: false,
        dueTimeLimitCount: 0,
        earliestTimeLimitAt: null,
        openScheduleChangeCount: 0,
        earliestAffectedDepartureAt: null,
      },
      lms: {
        available: false,
        overdueAccountCount: 0,
        dueSoonAccountCount: 0,
        loadedAt: generatedAt,
      },
    })

    expect(queue.items).toEqual([])
    expect(queue.unavailableProviders).toEqual(['Bookings', 'Ticketing', 'LMS'])
  })

  it('ignores invalid or negative source counts', () => {
    const queue = buildDashboardWorkQueue({
      generatedAt,
      visibleModuleIds: ['bookings', 'lms'],
      bookings: {
        available: true,
        pendingCount: -3,
        earliestStartAt: generatedAt,
        locationName: 'Bradford',
      },
      lms: {
        available: true,
        overdueAccountCount: Number.NaN,
        dueSoonAccountCount: 1.5,
        loadedAt: generatedAt,
      },
    })

    expect(queue.items).toEqual([])
  })
})
