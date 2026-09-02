import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CommissionStaffReport from '@/app/dashboard/commissions/CommissionStaffReport'

const EMPLOYEE_ID = '20000000-0000-4000-8000-000000000001'
const BATCH_ID = '30000000-0000-4000-8000-000000000001'

const report = {
  periodStart: '2020-08-01',
  periodEnd: '2020-08-31',
  companyTotalGbp: 1400,
  employees: [{ employeeId: EMPLOYEE_ID, employeeName: 'Agent One', totalGbp: 1400 }],
  currencyTotals: [
    {
      employeeId: EMPLOYEE_ID,
      employeeName: 'Agent One',
      payCurrency: 'PKR',
      amountPayCurrency: 490000,
      amountGbp: 1400,
    },
  ],
  items: [
    {
      employeeId: EMPLOYEE_ID,
      employeeName: 'Agent One',
      sourceModule: 'compensation',
      serviceCode: 'salary',
      entryKind: 'salary',
      payCurrency: 'PKR',
      entryCount: 1,
      amountPayCurrency: 350000,
      amountGbp: 1000,
    },
    {
      employeeId: EMPLOYEE_ID,
      employeeName: 'Agent One',
      sourceModule: 'ticketing',
      serviceCode: 'tk_primary',
      entryKind: 'ordinary',
      payCurrency: 'PKR',
      entryCount: 10,
      amountPayCurrency: 105000,
      amountGbp: 300,
    },
    {
      employeeId: EMPLOYEE_ID,
      employeeName: 'Agent One',
      sourceModule: 'applications',
      serviceCode: 'application_visa',
      entryKind: 'ordinary',
      payCurrency: 'PKR',
      entryCount: 2,
      amountPayCurrency: 35000,
      amountGbp: 100,
    },
    {
      employeeId: EMPLOYEE_ID,
      employeeName: 'Agent One',
      sourceModule: 'packages',
      serviceCode: 'package_sale',
      entryKind: 'ordinary',
      payCurrency: 'PKR',
      entryCount: 1,
      amountPayCurrency: 17500,
      amountGbp: 50,
    },
    {
      employeeId: EMPLOYEE_ID,
      employeeName: 'Agent One',
      sourceModule: 'adjustments',
      serviceCode: 'adm',
      entryKind: 'manual_adjustment',
      payCurrency: 'PKR',
      entryCount: 1,
      amountPayCurrency: -14000,
      amountGbp: -40,
    },
    {
      employeeId: EMPLOYEE_ID,
      employeeName: 'Agent One',
      sourceModule: 'ticketing',
      serviceCode: 'tk_primary',
      entryKind: 'refund_reversal',
      payCurrency: 'PKR',
      entryCount: 1,
      amountPayCurrency: -3500,
      amountGbp: -10,
    },
  ],
  readiness: { pendingEvents: 0, openExceptions: 0, incompleteBonusPeriods: 0 },
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

describe('Commission Shadow staff report', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse(report)),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows mixed-currency staff totals and distinct Applications and Packages sources', async () => {
    render(<CommissionStaffReport employees={[{ id: EMPLOYEE_ID, name: 'Agent One' }]} />)

    expect(await screen.findAllByText('Agent One')).not.toHaveLength(0)
    expect(screen.getAllByText('Applications').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Packages').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Refunds').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/490,000\.00/)).toBeTruthy()
    expect(
      screen.getByText(
        'No pending events, open exceptions or incomplete bonus periods were found.',
      ),
    ).toBeTruthy()
  })

  it('posts an append-only penalty with an idempotency key and refreshes the report', async () => {
    vi.mocked(fetch).mockImplementation((input, init) => {
      if (init?.method === 'POST') {
        return jsonResponse({ id: '40000000-0000-4000-8000-000000000001' }, 201)
      }
      return jsonResponse(report)
    })
    render(<CommissionStaffReport employees={[{ id: EMPLOYEE_ID, name: 'Agent One' }]} />)
    await screen.findAllByText('Agent One')

    fireEvent.change(screen.getByLabelText('Penalty type'), { target: { value: 'loss' } })
    fireEvent.change(screen.getByLabelText('Penalty amount'), { target: { value: '25.50' } })
    fireEvent.change(screen.getByLabelText('Penalty currency'), { target: { value: 'pkr' } })
    fireEvent.change(screen.getByLabelText('Penalty reason'), {
      target: { value: 'Supplier cancellation loss' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add audited penalty' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/commissions/admin/adjustments',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Idempotency-Key': expect.any(String),
          }),
          body: expect.stringContaining('Supplier cancellation loss'),
        }),
      ),
    )
    const penaltyCall = vi
      .mocked(fetch)
      .mock.calls.find(
        ([input, init]) =>
          String(input).includes('/api/commissions/admin/adjustments') && init?.method === 'POST',
      )
    expect(JSON.parse(String(penaltyCall?.[1]?.body))).toMatchObject({
      employeeId: EMPLOYEE_ID,
      category: 'loss',
      amount: 25.5,
      currency: 'PKR',
      reason: 'Supplier cancellation loss',
    })
    expect(
      await screen.findByText('The penalty was appended to this reporting period.'),
    ).toBeTruthy()
  })

  it('prepares a reviewed completed month and submits its expected revision to Accounting', async () => {
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = String(input)
      if (url.endsWith('/review-batches/prepare') && init?.method === 'POST') {
        return jsonResponse({
          id: BATCH_ID,
          revision: 3,
          status: 'draft',
          entryCount: 14,
          contentHash: 'a'.repeat(64),
        })
      }
      if (url.endsWith(`/${BATCH_ID}/submit`) && init?.method === 'POST') {
        return jsonResponse({ id: BATCH_ID, revision: 4, status: 'submitted_to_accounting' })
      }
      return jsonResponse(report)
    })
    render(<CommissionStaffReport employees={[{ id: EMPLOYEE_ID, name: 'Agent One' }]} />)
    await screen.findAllByText('Agent One')

    fireEvent.change(screen.getByLabelText('Reporting month'), { target: { value: '2020-08' } })
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/commissions/admin/staff-report?period=2020-08',
        expect.objectContaining({ cache: 'no-store' }),
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Prepare August 2020' }))

    const confirm = await screen.findByLabelText('Confirm Commission review')
    const submit = screen.getByRole('button', { name: 'Submit to Accounting' })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(confirm)
    fireEvent.click(submit)

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/api/commissions/admin/review-batches/${BATCH_ID}/submit`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
          body: JSON.stringify({ expectedRevision: 3 }),
        }),
      ),
    )
    expect(
      await screen.findByText(
        /Sent to Accounting\. Batch revision 4 is awaiting independent review/,
      ),
    ).toBeTruthy()
  })

  it('restores a prepared draft after reload and submits its persisted revision', async () => {
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = String(input)
      if (url.endsWith(`/${BATCH_ID}/submit`) && init?.method === 'POST') {
        return jsonResponse({ id: BATCH_ID, revision: 8, status: 'submitted_to_accounting' })
      }
      return jsonResponse({
        ...report,
        reviewBatch: {
          id: BATCH_ID,
          revision: 7,
          state: 'draft',
          contentHash: 'b'.repeat(64),
          entryCount: 22,
          isStale: false,
        },
      })
    })

    render(<CommissionStaffReport employees={[{ id: EMPLOYEE_ID, name: 'Agent One' }]} />)

    const confirm = await screen.findByLabelText('Confirm Commission review')
    expect(screen.getByText(/22 entries · revision 7/)).toBeTruthy()
    fireEvent.click(confirm)
    fireEvent.click(screen.getByRole('button', { name: 'Submit to Accounting' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/api/commissions/admin/review-batches/${BATCH_ID}/submit`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ expectedRevision: 7 }),
        }),
      ),
    )
  })

  it('offers to replace a stale draft instead of allowing it to be submitted', async () => {
    vi.mocked(fetch).mockImplementation(() =>
      jsonResponse({
        ...report,
        reviewBatch: {
          id: BATCH_ID,
          revision: 2,
          state: 'draft',
          contentHash: 'c'.repeat(64),
          entryCount: 18,
          isStale: true,
        },
      }),
    )

    render(<CommissionStaffReport employees={[{ id: EMPLOYEE_ID, name: 'Agent One' }]} />)

    expect(await screen.findByRole('button', { name: 'Replace stale draft' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Submit to Accounting' })).toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Add audited penalty' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})
