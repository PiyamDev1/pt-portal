import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BranchLedgerClient from '@/app/dashboard/accounting/ledger/BranchLedgerClient'
import type { AccountingLedgerResponse } from '@/lib/accounting/ledger'

const MANCHESTER_ID = '11111111-1111-4111-8111-111111111111'
const BRADFORD_ID = '22222222-2222-4222-8222-222222222222'

function ledgerResponse(): AccountingLedgerResponse {
  return {
    month: '2026-09',
    branches: [
      { id: BRADFORD_ID, name: 'Bradford', branchCode: 'BRD' },
      { id: MANCHESTER_ID, name: 'Manchester', branchCode: 'MAN' },
    ],
    selectedBranch: { id: BRADFORD_ID, name: 'Bradford', branchCode: 'BRD' },
    branchSheet: {
      id: 'sheet-1',
      revision: 1,
      status: 'open',
      updatedAt: '2026-09-27T10:00:00.000Z',
      carriedFrom: null,
      payload: {
        formatVersion: 1,
        incomeGroups: ['Services', 'Module profit'],
        expenseGroups: ['Bills', 'Module losses / costs'],
        items: [],
        cashStart: 100,
        cashEnd: 150,
        profitStart: 200,
        profitEnd: 240,
        sourceSnapshot: [],
        sourceSummarySnapshot: [],
      },
    },
    companySheet: {
      id: 'company-sheet-1',
      revision: 1,
      status: 'open',
      updatedAt: '2026-09-27T10:00:00.000Z',
      carriedFrom: null,
      payload: {
        formatVersion: 1,
        lmsStart: 250,
        lmsEnd: 300,
        suppliers: [],
        banks: [],
      },
    },
    sourceItems: [
      {
        id: 'source-2026-09-ticketing',
        label: 'Standalone gross margin',
        group: 'Module profit',
        amount: 40,
        kind: 'income',
        sourceKey: 'ticketing',
        sourceRecordCount: 1,
        sourcePath: '/dashboard/accounting/ticketing',
        metricType: 'commercial_margin',
        metricLabel: 'Standalone gross margin',
        dateBasis: 'booking_and_refund_confirmation_dates',
        dateBasisLabel: 'Booking date; confirmed refund date for adjustments',
        inclusionNote: 'Includes ticket-owned bookings only.',
        snapshotVersion: 1,
      },
    ],
    sourceSummaries: [
      {
        snapshotVersion: 1,
        key: 'ticketing',
        label: 'Ticketing',
        metricType: 'commercial_margin',
        metricLabel: 'Standalone gross margin',
        dateBasis: 'booking_and_refund_confirmation_dates',
        dateBasisLabel: 'Booking date; confirmed refund date for adjustments',
        count: 1,
        adjustmentCount: 0,
        excludedCount: 0,
        income: 140,
        expenses: 100,
        net: 40,
        includedInBranchResult: true,
        inclusionNote: 'Includes ticket-owned bookings only.',
        sourcePath: '/dashboard/accounting/ticketing',
        references: [
          {
            id: 'booking-1',
            label: 'ABC123',
            path: '/dashboard/ticketing/ledger?search=ABC123',
          },
        ],
        referencesTruncated: false,
        available: true,
      },
      {
        snapshotVersion: 1,
        key: 'pos',
        label: 'POS',
        metricType: 'cash_movement',
        metricLabel: 'Cash movement',
        dateBasis: 'business_date',
        dateBasisLabel: 'POS business date',
        count: 2,
        adjustmentCount: 0,
        excludedCount: 0,
        income: 500,
        expenses: 100,
        net: 400,
        includedInBranchResult: false,
        inclusionNote: 'Shown for reconciliation only.',
        sourcePath: '/dashboard/pos',
        references: [],
        referencesTruncated: false,
        available: true,
      },
    ],
    sourceWarnings: [],
    branchSummaries: [
      {
        branch: { id: BRADFORD_ID, name: 'Bradford', branchCode: 'BRD' },
        income: 40,
        expenses: 0,
        net: 40,
        profitStart: 200,
        profitEnd: 240,
        status: 'open',
      },
      {
        branch: { id: MANCHESTER_ID, name: 'Manchester', branchCode: 'MAN' },
        income: 75,
        expenses: 25,
        net: 50,
        profitStart: 900,
        profitEnd: 950,
        status: 'finalised',
      },
    ],
    companyLmsSummary: {
      available: true,
      totalOutstanding: 1450.5,
      activeAccounts: 9,
      overdueAccounts: 2,
      dueSoonAccounts: 3,
      totalAccounts: 12,
      loadedAt: '2026-09-27T10:00:00.000Z',
      sourcePath: '/dashboard/lms',
    },
  }
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('live Branch Ledger', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body))
          return jsonResponse({
            sheet: {
              id: body.scope === 'branch' ? 'sheet-1' : 'company-sheet-1',
              revision: body.revision + 1,
              status: body.finalize ? 'finalised' : 'open',
              payload: body.payload,
              updatedAt: '2026-09-27T10:01:00.000Z',
              carriedFrom: null,
            },
          })
        }
        return jsonResponse(ledgerResponse())
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads live branches and places module profit directly in the ledger', async () => {
    render(<BranchLedgerClient />)

    expect(await screen.findByRole('heading', { name: 'Branch Ledger' })).toBeTruthy()
    expect((screen.getByLabelText('Select branch') as HTMLSelectElement).value).toBe(BRADFORD_ID)
    expect(screen.getByRole('option', { name: 'Manchester · MAN' })).toBeTruthy()
    expect(screen.getAllByText('Standalone gross margin').length).toBeGreaterThan(0)
    expect(screen.getByText('Live from ticketing')).toBeTruthy()
    expect(screen.getByText('Cash movement')).toBeTruthy()
    expect(screen.getByText('Reconciliation only')).toBeTruthy()
    expect(screen.queryByText('Connected modules')).toBeNull()
    expect(screen.queryByText('Prototype')).toBeNull()
    expect(screen.queryByText('Opening cash')).toBeNull()
    expect(screen.queryByText('Closing cash')).toBeNull()
  })

  it('autosaves a fast manual entry to the live ledger', async () => {
    render(<BranchLedgerClient />)
    await screen.findByRole('heading', { name: 'Branch Ledger' })

    fireEvent.change(screen.getByLabelText('Income Services new item'), {
      target: { value: 'Passport service' },
    })
    fireEvent.change(screen.getByLabelText('Income Services new amount'), {
      target: { value: '45' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add item to Services' }))

    expect(screen.getByDisplayValue('Passport service')).toBeTruthy()
    await waitFor(
      () => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/accounting/ledger',
          expect.objectContaining({ method: 'POST' }),
        )
      },
      { timeout: 2500 },
    )
  })

  it('derives the all-branches company view and keeps company balances editable', async () => {
    render(<BranchLedgerClient />)
    await screen.findByRole('heading', { name: 'Branch Ledger' })

    fireEvent.click(screen.getByRole('button', { name: 'Company Ledger' }))

    expect(screen.getAllByRole('heading', { name: 'Company Ledger' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'All branches' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'LMS receivables now' })).toBeTruthy()
    expect(screen.getByText('£1,450.50')).toBeTruthy()
    expect(
      screen.getByText(
        'Calculated from each live branch sheet. There are no duplicate totals to re-enter.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Manchester')).toBeTruthy()
    expect(screen.queryByText('Cash across branches')).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Cash' })).toBeNull()
    expect(screen.getByLabelText('End of month LMS balance')).toBeTruthy()
    expect(screen.getByLabelText('New suppliers name')).toBeTruthy()
    expect(screen.getByLabelText('New banks name')).toBeTruthy()
  })

  it('shows the migration name when the live database update is missing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        {
          error: 'The live Branch Ledger database update has not been applied yet.',
          migration: '20260927181930_accounting_branch_ledger_live.sql',
        },
        503,
      ),
    )

    render(<BranchLedgerClient />)

    expect(
      await screen.findByRole('heading', { name: 'Branch Ledger could not load' }),
    ).toBeTruthy()
    expect(screen.getByText('Run 20260927181930_accounting_branch_ledger_live.sql')).toBeTruthy()
  })
})
