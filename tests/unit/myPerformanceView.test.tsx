import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/dashboard/my-commissions/MyCommissionsView', () => ({
  default: () => <div>Commission detail panel</div>,
}))

import MyPerformanceView from '@/app/dashboard/my-performance/MyPerformanceView'
import type { MyPerformanceData } from '@/lib/performance/server'
import {
  resolvePerformancePeriod,
  resolvePerformanceView,
  type PerformanceView,
} from '@/lib/performance/view'

const metrics = {
  ticketsIssued: 1,
  ticketServices: 1,
  ticketPassengers: 2,
  ticketAssists: 0,
  applications: 1,
  packages: 1,
  packagePassengers: 3,
}

const attendance = {
  key: '2026-08',
  label: 'Aug',
  workedMinutes: 480,
  daysPresent: 1,
  completedShifts: 1,
}

const data: MyPerformanceData = {
  activityReady: true,
  attendanceReady: true,
  analytics: {
    reportingDate: '2026-08-31',
    currentMonthKey: '2026-08',
    currentMonthLabel: 'August 2026',
    current: metrics,
    previous: { ...metrics, ticketsIssued: 0 },
    monthly: [{ key: '2026-08', label: 'Aug', ...metrics }],
    applicationBreakdown: [],
    recent: [],
    attendance: {
      current: attendance,
      previous: { ...attendance, key: '2026-07', label: 'Jul' },
      monthly: [attendance],
      hasOpenShift: false,
      incompletePunchCount: 0,
    },
    lastRecordedAt: '2026-08-20T12:00:00Z',
  },
  commission: {} as MyPerformanceData['commission'],
}

function renderView(selectedView: PerformanceView) {
  return render(
    <MyPerformanceView
      data={data}
      employeeName="Amina Khan"
      selectedView={selectedView}
      selectedPeriod="2026-08"
      currentPeriod="2026-09"
    />,
  )
}

describe('MyPerformanceView tabs', () => {
  it('uses Activity for missing, invalid and repeated unsupported view values', () => {
    expect(resolvePerformanceView(undefined)).toBe('activity')
    expect(resolvePerformanceView('unknown')).toBe('activity')
    expect(resolvePerformanceView(['unknown', 'earnings'])).toBe('activity')
    expect(resolvePerformanceView(['earnings', 'activity'])).toBe('earnings')
  })

  it('shows only Activity when the Activity tab is selected', () => {
    renderView('activity')

    expect(screen.getByText('Work completed in August 2026')).toBeTruthy()
    expect(screen.queryByText('Your recorded time')).toBeNull()
    expect(screen.queryByText('Salary and commission')).toBeNull()
    expect(screen.getByRole('link', { name: 'Activity' }).getAttribute('aria-current')).toBe('page')
  })

  it('shows only Attendance when the Attendance tab is selected', () => {
    renderView('attendance')

    expect(screen.queryByText('Work completed in August 2026')).toBeNull()
    expect(screen.getByText('Your recorded time')).toBeTruthy()
    expect(screen.queryByText('Salary and commission')).toBeNull()
    expect(screen.getByRole('link', { name: 'Attendance' }).getAttribute('aria-current')).toBe(
      'page',
    )
  })

  it('shows only Earnings when the Earnings tab is selected', () => {
    renderView('earnings')

    expect(screen.queryByText('Work completed in August 2026')).toBeNull()
    expect(screen.queryByText('Your recorded time')).toBeNull()
    expect(screen.getByText('Salary and commission')).toBeTruthy()
    expect(screen.getByText('Commission detail panel')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Earnings & commission' }).getAttribute('aria-current'),
    ).toBe('page')
  })

  it('gives every tab its own bookmarkable URL', () => {
    renderView('activity')

    expect(screen.getByRole('link', { name: 'Activity' }).getAttribute('href')).toBe(
      '/dashboard/my-performance?view=activity&period=2026-08',
    )
    expect(screen.getByRole('link', { name: 'Attendance' }).getAttribute('href')).toBe(
      '/dashboard/my-performance?view=attendance&period=2026-08',
    )
    expect(screen.getByRole('link', { name: 'Earnings & commission' }).getAttribute('href')).toBe(
      '/dashboard/my-performance?view=earnings&period=2026-08',
    )
  })

  it('offers a server-submitted month selector that cannot choose a future period', () => {
    renderView('attendance')

    const selector = screen.getByLabelText('Reporting period') as HTMLInputElement
    expect(selector.value).toBe('2026-08')
    expect(selector.max).toBe('2026-09')
    expect(document.querySelector('input[name="view"]')?.getAttribute('value')).toBe('attendance')
  })

  it('rejects invalid and future reporting periods on the server boundary', () => {
    const now = new Date('2026-09-02T12:00:00Z')

    expect(resolvePerformancePeriod('2026-08', now)).toBe('2026-08')
    expect(resolvePerformancePeriod('2026-10', now)).toBe('2026-09')
    expect(resolvePerformancePeriod('2026-13', now)).toBe('2026-09')
    expect(resolvePerformancePeriod(['2026-07', '2026-08'], now)).toBe('2026-07')
  })

  it('keeps activity and attendance evidence collapsed by default', () => {
    const activity = renderView('activity')
    expect(screen.getByText('Recent completed work · 0 items').closest('details')?.open).toBe(false)
    activity.unmount()

    renderView('attendance')
    expect(screen.getByText('Recorded attendance · 1 day present').closest('details')?.open).toBe(
      false,
    )
  })
})
