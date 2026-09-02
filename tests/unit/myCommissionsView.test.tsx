import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MyCommissionsView from '@/app/dashboard/my-commissions/MyCommissionsView'
import type { MyCommissionData } from '@/lib/commissions/server'

const data: MyCommissionData = {
  schemaReady: true,
  profile: {
    id: 'profile-1',
    label: 'Standard agreement',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    configuration: null,
    applicationRoutingRecipientName: null,
  },
  scheduledProfile: null,
  analytics: {
    mode: 'shadow',
    currentMonth: {
      creditsGbp: 5,
      debitsGbp: 0,
      netGbp: 5,
      entryCount: 1,
    },
    yearToDateGbp: 25,
    monthly: [
      {
        key: '2026-08',
        label: 'Aug',
        creditsGbp: 5,
        debitsGbp: 0,
        netGbp: 5,
      },
    ],
    breakdown: [],
    recent: [
      {
        id: 'entry-1',
        entryMode: 'shadow',
        entryKind: 'ordinary',
        amountGbp: 5,
        earningOn: '2026-08-12',
        createdAt: '2026-08-12T12:00:00Z',
        supersedesEntryId: null,
        serviceCode: 'tk_primary',
        sourcePath: '/dashboard/ticketing/ledger',
        description: 'Ticket sale',
      },
    ],
  },
  compensation: {
    currency: 'GBP',
    monthlySalary: 1_000,
    currentMonthCommission: 5,
    currentMonthGrossPay: 1_005,
    currentMonthBookGbp: 1_005,
    unitsPerGbp: 1,
    ratePending: false,
  },
  openExceptionCount: 0,
  lastCalculatedAt: '2026-08-31T12:00:00Z',
}

describe('MyCommissionsView evidence', () => {
  it('shows the selected reporting period and keeps calculation evidence collapsed', () => {
    render(
      <MyCommissionsView
        data={data}
        employeeName="Amina Khan"
        embedded
        reportingPeriodLabel="August 2026"
      />,
    )

    expect(screen.getByText('August 2026')).toBeTruthy()
    expect(screen.getByText('Recent calculations · 1 item').closest('details')?.open).toBe(false)
  })
})
