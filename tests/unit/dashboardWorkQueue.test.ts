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

  it('adds one de-duplicated Applications item linked to the shared attention view', () => {
    const queue = buildDashboardWorkQueue({
      generatedAt,
      visibleModuleIds: ['applications'],
      applications: {
        available: true,
        partial: false,
        attentionCount: 4,
        statusFollowUpCount: 3,
        missingDocumentsCount: 2,
        stalledCount: 1,
        oldestAttentionAt: '2026-09-10T09:00:00.000Z',
      },
    })

    expect(queue.unavailableProviders).toEqual([])
    expect(queue.items).toEqual([
      expect.objectContaining({
        id: 'applications-attention',
        moduleId: 'applications',
        severity: 'critical',
        count: 4,
        detail: '3 status follow-ups, 2 records with no linked documents, 1 record over 7 days.',
        href: '/dashboard/applications#attention',
      }),
    ])
  })

  it('shows partial Applications data without presenting it as all clear', () => {
    const queue = buildDashboardWorkQueue({
      generatedAt,
      visibleModuleIds: ['applications'],
      applications: {
        available: true,
        partial: true,
        attentionCount: 0,
        statusFollowUpCount: 0,
        missingDocumentsCount: 0,
        stalledCount: 0,
        oldestAttentionAt: null,
      },
    })

    expect(queue.items).toEqual([])
    expect(queue.unavailableProviders).toEqual(['Applications (partial)'])
  })

  it('adds one branch POS item using the source reconciliation summary', () => {
    const queue = buildDashboardWorkQueue({
      generatedAt,
      visibleModuleIds: ['pos'],
      pos: {
        available: true,
        unresolvedCount: 3,
        failedCount: 1,
        oldestUnresolvedAt: '2026-09-20T09:00:00.000Z',
        month: '2026-09',
        branchName: 'Bradford',
      },
    })

    expect(queue.unavailableProviders).toEqual([])
    expect(queue.items).toEqual([
      expect.objectContaining({
        id: 'pos-reconciliation',
        moduleId: 'pos',
        severity: 'critical',
        count: 3,
        detail:
          '1 tender failed reconciliation. Current-month cash and supplier-direct remittances are excluded.',
        reference: 'POS Â· Bradford Â· 2026-09',
        href: '/dashboard/pos?period=month&status=UNRECONCILED',
      }),
    ])
  })

  it('shows Frappe integration failures only to staff with Settings visibility', () => {
    const frappe = {
      available: true,
      outboxDeadLetterCount: 2,
      failedInboxCount: 1,
      openConflictCount: 3,
      failedDomainCount: 1,
      degradedDomainCount: 1,
      oldestProblemAt: '2026-09-20T09:00:00.000Z',
    }
    const visibleQueue = buildDashboardWorkQueue({
      generatedAt,
      visibleModuleIds: ['hrms-transfer', 'settings'],
      frappe,
    })
    const staffQueue = buildDashboardWorkQueue({
      generatedAt,
      visibleModuleIds: ['hrms-transfer'],
      frappe,
    })

    expect(visibleQueue.items).toEqual([
      expect.objectContaining({
        id: 'frappe-integration-health',
        moduleId: 'settings',
        moduleLabel: 'Frappe HRMS',
        severity: 'critical',
        count: 8,
        detail:
          '2 dead-letter items, 1 failed inbound item, 3 open conflicts, 1 failed sync domain, 1 degraded sync domain.',
        href: '/dashboard/settings?tab=maintenance',
      }),
    ])
    expect(staffQueue.items).toEqual([])
    expect(staffQueue.unavailableProviders).toEqual([])
  })
})
