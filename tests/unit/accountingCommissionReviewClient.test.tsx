import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AccountingPage from '@/app/dashboard/accounting/page'
import CommissionReviewBatchesClient from '@/app/dashboard/accounting/commissions/CommissionReviewBatchesClient'
import CommissionReviewBatchClient from '@/app/dashboard/accounting/commissions/[batchId]/CommissionReviewBatchClient'

const BATCH_ID = '20000000-0000-4000-8000-000000000001'

const batch = {
  id: BATCH_ID,
  revision: 4,
  state: 'submitted_to_accounting',
  contentHash: 'a'.repeat(64),
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  preparedAt: '2026-09-01T09:00:00Z',
  preparedByName: 'Commission Admin',
  submittedAt: '2026-09-01T10:00:00Z',
  submittedByName: 'Commission Admin',
  returnedAt: null,
  returnReason: null,
  approvedAt: null,
  approvedByName: null,
  employeeCount: 1,
  entryCount: 5,
  totalGbp: 750,
  totalsByCurrency: [
    { currency: 'GBP', amount: 500 },
    { currency: 'PKR', amount: 87500 },
  ],
  canApprove: true,
  canReturn: true,
}

const detail = {
  batch,
  staff: [
    {
      employeeId: '30000000-0000-4000-8000-000000000001',
      employeeName: 'Agent One',
      currency: 'GBP',
      salary: 0,
      ticketing: 500,
      applications: 100,
      packages: 100,
      bonus: 100,
      penalties: -25,
      refunds: -25,
      netAmount: 750,
      totalGbp: 750,
    },
  ],
  entries: [
    {
      id: '40000000-0000-4000-8000-000000000001',
      employeeId: '30000000-0000-4000-8000-000000000001',
      employeeName: 'Agent One',
      sourceModule: 'adjustments',
      serviceCode: 'adm',
      entryKind: 'manual_adjustment',
      earningOn: '2026-08-31',
      currency: 'GBP',
      amount: -25,
      amountGbp: -25,
      detail: 'Airline debit memo ADM-42',
      reference: 'ADM-42',
    },
  ],
  events: [],
  warnings: [],
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

describe('Accounting Commission review UI', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('links the Accounting home to the Commission review report', () => {
    render(<AccountingPage />)

    expect(screen.getByRole('link', { name: /Commission review/i }).getAttribute('href')).toBe(
      '/dashboard/accounting/commissions',
    )
  })

  it('shows submitted and locked batches with native currencies kept separate', async () => {
    vi.mocked(fetch).mockImplementation(() =>
      jsonResponse({ items: [batch], total: 1, limit: 25, offset: 0 }),
    )

    render(<CommissionReviewBatchesClient />)

    expect(await screen.findByText('Awaiting Accounting')).toBeTruthy()
    expect(screen.getByText('1 staff')).toBeTruthy()
    expect(screen.getByText('£750.00')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Review/i }).getAttribute('href')).toBe(
      `/dashboard/accounting/commissions/${BATCH_ID}`,
    )
    expect(fetch).toHaveBeenCalledWith(
      '/api/accounting/commissions/review-batches?limit=25&offset=0',
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it('requires explicit double-check confirmation before final approval', async () => {
    vi.mocked(fetch).mockImplementation((input, init) => {
      if (init?.method === 'POST') return jsonResponse({ updated: true })
      return jsonResponse(detail)
    })

    render(<CommissionReviewBatchClient batchId={BATCH_ID} />)

    expect(await screen.findAllByText('Agent One')).not.toHaveLength(0)
    expect(screen.getAllByText('£500.00')).toHaveLength(2)
    expect(screen.getByText(/87,500\.00/)).toBeTruthy()
    expect(screen.getByText('Airline debit memo ADM-42')).toBeTruthy()
    expect(screen.getByText('ADM-42')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Review final approval' }))
    const dialog = screen.getByRole('dialog', { name: 'Approve and lock Commission batch?' })
    const approve = within(dialog).getByRole('button', { name: 'Approve and lock' })
    expect((approve as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(
      within(dialog).getByRole('checkbox', {
        name: /I have double-checked the staff breakdown/i,
      }),
    )
    fireEvent.click(approve)

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/api/accounting/commissions/review-batches/${BATCH_ID}/approve`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ expectedRevision: 4 }),
        }),
      ),
    )
    expect(await screen.findByText('The batch was approved and permanently locked.')).toBeTruthy()
  })

  it('requires and submits an Accounting return reason', async () => {
    vi.mocked(fetch).mockImplementation((input, init) => {
      if (init?.method === 'POST') return jsonResponse({ updated: true })
      return jsonResponse(detail)
    })

    render(<CommissionReviewBatchClient batchId={BATCH_ID} />)
    await screen.findAllByText('Agent One')
    fireEvent.click(screen.getByRole('button', { name: 'Return for correction' }))

    const dialog = screen.getByRole('dialog', { name: 'Return batch for correction' })
    const submit = within(dialog).getByRole('button', { name: 'Return batch' })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText('Return reason'), {
      target: { value: 'Please verify the ADM penalty.' },
    })
    fireEvent.click(submit)

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/api/accounting/commissions/review-batches/${BATCH_ID}/return`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            expectedRevision: 4,
            reason: 'Please verify the ADM penalty.',
          }),
        }),
      ),
    )
  })

  it('blocks final approval and directs Accounting to return a stale batch', async () => {
    vi.mocked(fetch).mockImplementation(() =>
      jsonResponse({
        ...detail,
        batch: { ...batch, isStale: true, canApprove: false },
      }),
    )

    render(<CommissionReviewBatchClient batchId={BATCH_ID} />)

    expect(await screen.findByText('Commission results changed after submission')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Review final approval' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Return for correction' })).toBeTruthy()
    expect(screen.getByText(/Final approval is blocked because/)).toBeTruthy()
  })
})
