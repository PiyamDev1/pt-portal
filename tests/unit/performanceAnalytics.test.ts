import { describe, expect, it } from 'vitest'
import {
  buildPerformanceAnalytics,
  type PerformanceSourceFact,
  type PerformanceTimeclockEvent,
} from '@/lib/performance/analytics'
import { collectPagedRows } from '@/lib/performance/pagination'

const RIDA = 'a5562c45-efc9-4496-9401-4c45258adc0e'
const SYED = '37614b1d-b4a1-4ec9-832d-ca430f162b78'

function fact(
  overrides: Partial<PerformanceSourceFact> &
    Pick<
      PerformanceSourceFact,
      'id' | 'sourceModule' | 'sourceFactKey' | 'sourceRecordId' | 'eventType'
    >,
): PerformanceSourceFact {
  return {
    eventVersion: 1,
    employeeId: RIDA,
    ownerEmployeeId: RIDA,
    effectiveOn: '2026-08-10',
    sourcePath: '/dashboard',
    variables: {},
    createdAt: '2026-08-10T12:00:00Z',
    ...overrides,
  }
}

function punch(id: string, punchType: 'IN' | 'OUT', scannedAt: string): PerformanceTimeclockEvent {
  return {
    id,
    eventType: punchType,
    punchType,
    scannedAt,
    adjustedScannedAt: null,
    deviceTimestamp: scannedAt,
    adjustedDeviceTimestamp: null,
  }
}

describe('my performance analytics', () => {
  it('keeps redirected application work with its performer, not the commission recipient', () => {
    const data = buildPerformanceAnalytics(
      [
        fact({
          id: 'application-1',
          sourceModule: 'applications',
          sourceFactKey: 'application:nadra:1',
          sourceRecordId: 'nadra-1',
          eventType: 'application_completed',
          variables: {
            application_kind: 'nadra',
            application_count: 1,
            eligible: true,
            responsible_employee_id: RIDA,
            commission_recipient_employee_id: SYED,
          },
        }),
      ],
      [],
      RIDA,
      '2026-08-31',
    )

    expect(data.current.applications).toBe(1)
    expect(data.applicationBreakdown).toEqual([{ kind: 'nadra', label: 'NADRA', count: 1 }])

    const recipientView = buildPerformanceAnalytics(
      [
        fact({
          id: 'application-1',
          sourceModule: 'applications',
          sourceFactKey: 'application:nadra:1',
          sourceRecordId: 'nadra-1',
          eventType: 'application_completed',
          variables: {
            application_kind: 'nadra',
            eligible: true,
            responsible_employee_id: RIDA,
            commission_recipient_employee_id: SYED,
          },
        }),
      ],
      [],
      SYED,
      '2026-08-31',
    )
    expect(recipientView.current.applications).toBe(0)
  })

  it('removes reversed and archived tails and deduplicates ticket lifecycle facts', () => {
    const facts = [
      fact({
        id: 'app-v1',
        sourceModule: 'applications',
        sourceFactKey: 'application:visa:1',
        sourceRecordId: 'visa-1',
        eventType: 'application_completed',
        variables: { application_kind: 'visa', eligible: true },
      }),
      fact({
        id: 'app-v2',
        sourceModule: 'applications',
        sourceFactKey: 'application:visa:1',
        sourceRecordId: 'visa-1',
        eventType: 'application_reversed',
        eventVersion: 2,
        variables: { application_kind: 'visa', eligible: false, deleted: true },
        createdAt: '2026-08-11T12:00:00Z',
      }),
      fact({
        id: 'ticket-issued',
        sourceModule: 'ticketing',
        sourceFactKey: 'transaction:1:issued',
        sourceRecordId: 'ticket-1',
        eventType: 'ticket_issued',
        variables: { service_type: 'TK', passenger_ticket_count: 2 },
      }),
      fact({
        id: 'ticket-archived',
        sourceModule: 'ticketing',
        sourceFactKey: 'transaction:1:issued',
        sourceRecordId: 'ticket-1',
        eventType: 'ticket_entry_archived',
        eventVersion: 2,
        variables: { service_type: 'TK', passenger_ticket_count: 2, archived: true },
        createdAt: '2026-08-12T12:00:00Z',
      }),
      fact({
        id: 'ticket-2-issued',
        sourceModule: 'ticketing',
        sourceFactKey: 'transaction:2:issued',
        sourceRecordId: 'ticket-2',
        eventType: 'ticket_issued',
        variables: { service_type: 'TK', passenger_ticket_count: 3 },
      }),
      fact({
        id: 'ticket-2-sale',
        sourceModule: 'ticketing',
        sourceFactKey: 'transaction:2:sale-completed',
        sourceRecordId: 'ticket-2',
        eventType: 'ticket_sale_completed',
        variables: { service_type: 'TK', passenger_ticket_count: 3 },
      }),
    ]

    const data = buildPerformanceAnalytics(facts, [], RIDA, '2026-08-31')
    expect(data.current.applications).toBe(0)
    expect(data.current.ticketsIssued).toBe(1)
    expect(data.current.ticketPassengers).toBe(3)
  })

  it('separates primary ticket work and assistance and counts linked packages once', () => {
    const facts = [
      fact({
        id: 'ticket-other',
        sourceModule: 'ticketing',
        sourceFactKey: 'transaction:3:issued',
        sourceRecordId: 'ticket-3',
        eventType: 'ticket_issued',
        employeeId: SYED,
        ownerEmployeeId: SYED,
        variables: {
          service_type: 'TK',
          primary_responsible_employee_id: SYED,
          assistant_employee_ids: [RIDA],
          passenger_ticket_count: 2,
        },
      }),
      fact({
        id: 'ticket-other-financial-snapshot',
        sourceModule: 'ticketing',
        sourceFactKey: 'transaction:3:sale-completed',
        sourceRecordId: 'ticket-3',
        eventType: 'ticket_sale_completed',
        employeeId: RIDA,
        ownerEmployeeId: RIDA,
        createdAt: '2026-08-11T12:00:00Z',
        variables: {
          service_type: 'TK',
          primary_responsible_employee_id: RIDA,
          assistant_employee_ids: [],
          passenger_ticket_count: 2,
        },
      }),
      fact({
        id: 'date-change',
        sourceModule: 'ticketing',
        sourceFactKey: 'transaction:4:date-changed',
        sourceRecordId: 'ticket-service-4',
        eventType: 'ticket_date_changed',
        variables: { service_type: 'DC', acting_employee_id: RIDA },
      }),
      fact({
        id: 'package-1',
        sourceModule: 'packages',
        sourceFactKey: 'package-sale:1',
        sourceRecordId: 'package-1',
        eventType: 'package_closed',
        sourcePath: '/dashboard/packages/package-1',
        variables: {
          authoritative: true,
          group_id: 'group-1',
          sales_employee_id: RIDA,
          passenger_count: 2,
        },
      }),
      fact({
        id: 'package-2',
        sourceModule: 'packages',
        sourceFactKey: 'package-sale:2',
        sourceRecordId: 'package-2',
        eventType: 'package_closed',
        sourcePath: '/dashboard/packages/package-2',
        effectiveOn: '2026-08-12',
        variables: {
          authoritative: true,
          group_id: 'group-1',
          sales_employee_id: RIDA,
          passenger_count: 3,
        },
      }),
    ]

    const data = buildPerformanceAnalytics(facts, [], RIDA, '2026-08-31')
    expect(data.current).toMatchObject({
      ticketsIssued: 0,
      ticketServices: 1,
      ticketAssists: 1,
      packages: 1,
      packagePassengers: 5,
    })
    expect(data.recent.filter((item) => item.kind === 'package')).toHaveLength(1)
    expect(data.recent.find((item) => item.kind === 'package')?.title).toBe(
      'Linked package group closed',
    )
  })

  it('pairs separate timeclock sessions without subtracting the break twice', () => {
    const data = buildPerformanceAnalytics(
      [],
      [
        punch('in-1', 'IN', '2026-08-10T08:00:00Z'),
        punch('out-1', 'OUT', '2026-08-10T11:00:00Z'),
        punch('in-2', 'IN', '2026-08-10T12:00:00Z'),
        punch('out-2', 'OUT', '2026-08-10T16:00:00Z'),
        punch('open-in', 'IN', '2026-08-11T08:00:00Z'),
      ],
      RIDA,
      '2026-08-31',
    )

    expect(data.attendance.current).toMatchObject({
      workedMinutes: 420,
      daysPresent: 2,
      completedShifts: 2,
    })
    expect(data.attendance.hasOpenShift).toBe(false)
    expect(data.attendance.incompletePunchCount).toBe(1)
  })

  it('splits overnight hours at the London month boundary', () => {
    const data = buildPerformanceAnalytics(
      [],
      [
        punch('overnight-in', 'IN', '2026-08-31T22:00:00Z'),
        punch('overnight-out', 'OUT', '2026-09-01T00:00:00Z'),
      ],
      RIDA,
      '2026-09-30',
      new Date('2026-09-30T12:00:00Z'),
    )

    expect(data.attendance.monthly.find((item) => item.key === '2026-08')).toMatchObject({
      workedMinutes: 60,
      completedShifts: 1,
    })
    expect(data.attendance.current.workedMinutes).toBe(60)
  })

  it('treats only a recent past clock-in as an active open shift', () => {
    const data = buildPerformanceAnalytics(
      [],
      [punch('recent-open-in', 'IN', '2026-08-31T08:00:00Z')],
      RIDA,
      '2026-08-31',
      new Date('2026-08-31T09:00:00Z'),
    )

    expect(data.attendance.hasOpenShift).toBe(true)
    expect(data.attendance.incompletePunchCount).toBe(0)
  })

  it('keeps an overnight shift open after the London month changes', () => {
    const data = buildPerformanceAnalytics(
      [],
      [punch('overnight-open-in', 'IN', '2026-08-31T22:30:00Z')],
      RIDA,
      '2026-09-01',
      new Date('2026-09-01T00:30:00Z'),
    )

    expect(data.attendance.hasOpenShift).toBe(true)
    expect(data.attendance.incompletePunchCount).toBe(0)
  })

  it('uses adjusted punch times and ignores unmatched buffer punches', () => {
    const adjustedIn = punch('adjusted-in', 'IN', '2026-01-05T08:00:00Z')
    adjustedIn.adjustedScannedAt = '2026-09-05T08:00:00Z'
    const adjustedOut = punch('adjusted-out', 'OUT', '2026-01-05T09:00:00Z')
    adjustedOut.adjustedScannedAt = '2026-09-05T09:00:00Z'

    const data = buildPerformanceAnalytics(
      [],
      [punch('buffer-out', 'OUT', '2026-03-31T12:00:00Z'), adjustedIn, adjustedOut],
      RIDA,
      '2026-09-30',
      new Date('2026-09-30T12:00:00Z'),
    )

    expect(data.attendance.current).toMatchObject({
      workedMinutes: 60,
      daysPresent: 1,
      completedShifts: 1,
    })
    expect(data.attendance.incompletePunchCount).toBe(0)
  })

  it('collects every page beyond the default database response cap', async () => {
    const source = Array.from({ length: 1005 }, (_, index) => index)
    const requestedOffsets: number[] = []
    const rows = await collectPagedRows(async (offset, pageSize) => {
      requestedOffsets.push(offset)
      return source.slice(offset, offset + pageSize)
    })

    expect(rows).toHaveLength(1005)
    expect(rows.at(-1)).toBe(1004)
    expect(requestedOffsets).toEqual([0, 1000])
  })
})
