import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const BATCH_ID = '20000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => ({
  requireAccountingAccess: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/accounting/access', () => ({
  requireAccountingAccess: mocks.requireAccountingAccess,
}))

import { GET as listBatches } from '@/app/api/accounting/commissions/review-batches/route'
import { GET as batchDetail } from '@/app/api/accounting/commissions/review-batches/[batchId]/route'
import { POST as returnBatch } from '@/app/api/accounting/commissions/review-batches/[batchId]/return/route'
import { POST as approveBatch } from '@/app/api/accounting/commissions/review-batches/[batchId]/approve/route'

function post(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function context(batchId = BATCH_ID) {
  return { params: Promise.resolve({ batchId }) }
}

describe('Accounting Commission review routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAccountingAccess.mockResolvedValue({
      authorized: true,
      supabase: { rpc: mocks.rpc },
      user: { id: '10000000-0000-4000-8000-000000000001' },
      employee: { id: '10000000-0000-4000-8000-000000000001' },
    })
  })

  it('lists normalized batches with bounded offset pagination and private caching', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          batch_id: BATCH_ID,
          batch_revision: 3,
          status: 'submitted_to_accounting',
          period_start: '2026-08-01',
          period_end: '2026-08-31',
          employee_count: '4',
          entry_count: 19,
          total_gbp: '850.25',
          native_currency_totals: { GBP: 600.25, PKR: 87500 },
          total_count: 1,
        },
      ],
      error: null,
    })

    const response = await listBatches(
      new NextRequest(
        'http://localhost/api/accounting/commissions/review-batches?limit=20&offset=40',
      ),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0')
    expect(mocks.rpc).toHaveBeenCalledWith('commission_accounting_batches_2026090201', {
      p_limit: 20,
      p_offset: 40,
    })
    expect(body).toMatchObject({
      total: 1,
      limit: 20,
      offset: 40,
      items: [
        {
          id: BATCH_ID,
          revision: 3,
          state: 'submitted_to_accounting',
          employeeCount: 4,
          entryCount: 19,
          totalGbp: 850.25,
          canApprove: true,
          canReturn: true,
        },
      ],
    })
    expect(body.items[0].totalsByCurrency).toEqual([
      { currency: 'GBP', amount: 600.25 },
      { currency: 'PKR', amount: 87500 },
    ])
  })

  it('rejects unknown list filters after Accounting authorization', async () => {
    const response = await listBatches(
      new NextRequest(
        'http://localhost/api/accounting/commissions/review-batches?employeeId=someone',
      ),
    )

    expect(response.status).toBe(400)
    expect(mocks.requireAccountingAccess).toHaveBeenCalledOnce()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('loads a defensive batch and staff breakdown through the exact detail RPC', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        batch: {
          id: BATCH_ID,
          revision: 7,
          state: 'submitted_to_accounting',
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          isStale: true,
          canApprove: false,
        },
        statements: [
          {
            employeeId: '30000000-0000-4000-8000-000000000001',
            employeeName: 'Agent One',
            nativeCurrencyTotals: { PKR: 6500 },
            totalGbp: 22.75,
          },
        ],
        entries: [
          {
            id: '40000000-0000-4000-8000-000000000001',
            employeeId: '30000000-0000-4000-8000-000000000001',
            employeeName: 'Agent One',
            sourceModule: 'ticketing',
            serviceCode: 'tk_primary',
            entryKind: 'ordinary',
            amountPayCurrency: 5000,
            payCurrency: 'PKR',
            amountGbp: 17.5,
          },
          {
            id: '40000000-0000-4000-8000-000000000002',
            employeeId: '30000000-0000-4000-8000-000000000001',
            employeeName: 'Agent One',
            sourceModule: 'applications',
            serviceCode: 'application_visa',
            entryKind: 'ordinary',
            amountPayCurrency: 2000,
            payCurrency: 'PKR',
            amountGbp: 7,
          },
          {
            id: '40000000-0000-4000-8000-000000000003',
            employeeId: '30000000-0000-4000-8000-000000000001',
            employeeName: 'Agent One',
            sourceModule: 'adjustments',
            serviceCode: 'adm',
            entryKind: 'manual_adjustment',
            amountPayCurrency: -500,
            payCurrency: 'PKR',
            amountGbp: -1.75,
            adjustmentId: '60000000-0000-4000-8000-000000000001',
            snapshot: {
              reason: 'Airline debit memo ADM-42',
              evidence: { reference: 'ADM-42' },
            },
          },
        ],
        events: [
          {
            id: '50000000-0000-4000-8000-000000000001',
            action: 'submitted_to_accounting',
            actorName: 'Commission Admin',
            createdAt: '2026-09-01T12:00:00Z',
          },
        ],
        warnings: [{ message: 'Check one manual loss.' }],
      },
      error: null,
    })

    const response = await batchDetail(
      new Request(`http://localhost/api/accounting/commissions/review-batches/${BATCH_ID}`),
      context(),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('commission_review_batch_detail_2026090201', {
      p_batch_id: BATCH_ID,
    })
    expect(body.batch).toMatchObject({
      id: BATCH_ID,
      revision: 7,
      employeeCount: 1,
      entryCount: 3,
      totalGbp: 22.75,
      totalsByCurrency: [{ currency: 'PKR', amount: 6500 }],
      isStale: true,
      canApprove: false,
    })
    expect(body.staff[0]).toMatchObject({
      employeeName: 'Agent One',
      currency: 'PKR',
      ticketing: 5000,
      applications: 2000,
      penalties: -500,
      netAmount: 6500,
      totalGbp: 22.75,
    })
    expect(body.entries).toHaveLength(3)
    expect(body.entries[2]).toMatchObject({
      detail: 'Airline debit memo ADM-42',
      reference: 'ADM-42',
    })
    expect(body.events[0]).toMatchObject({
      action: 'submitted_to_accounting',
      actorName: 'Commission Admin',
    })
    expect(body.warnings).toEqual(['Check one manual loss.'])
  })

  it('requires a reason and calls the exact return RPC without caller-supplied identity', async () => {
    const missingReason = await returnBatch(
      post(`/api/accounting/commissions/review-batches/${BATCH_ID}/return`, {
        expectedRevision: 2,
      }),
      context(),
    )
    expect(missingReason.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()

    const unexpectedActor = await returnBatch(
      post(`/api/accounting/commissions/review-batches/${BATCH_ID}/return`, {
        expectedRevision: 2,
        reason: 'Ticketing deduction is unsupported.',
        actorEmployeeId: '10000000-0000-4000-8000-000000000001',
      }),
      context(),
    )
    expect(unexpectedActor.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()

    mocks.rpc.mockResolvedValue({ data: { id: BATCH_ID, state: 'returned' }, error: null })
    const response = await returnBatch(
      post(`/api/accounting/commissions/review-batches/${BATCH_ID}/return`, {
        expectedRevision: 2,
        reason: '  Ticketing deduction is unsupported.  ',
      }),
      context(),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0')
    expect(mocks.rpc).toHaveBeenCalledWith('commission_return_review_batch_2026090201', {
      p_batch_id: BATCH_ID,
      p_expected_revision: 2,
      p_reason: 'Ticketing deduction is unsupported.',
    })
  })

  it('approves against an expected revision and maps stale writes to conflict', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { id: BATCH_ID, state: 'approved_locked' },
      error: null,
    })
    const approved = await approveBatch(
      post(`/api/accounting/commissions/review-batches/${BATCH_ID}/approve`, {
        expectedRevision: 9,
      }),
      context(),
    )

    expect(approved.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('commission_approve_review_batch_2026090201', {
      p_batch_id: BATCH_ID,
      p_expected_revision: 9,
    })

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '40001' } })
    const stale = await approveBatch(
      post(`/api/accounting/commissions/review-batches/${BATCH_ID}/approve`, {
        expectedRevision: 9,
      }),
      context(),
    )

    expect(stale.status).toBe(409)
    expect((await stale.json()).error).toContain('Refresh')

    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', hint: 'COMMISSION_REVIEW_SEPARATION_REQUIRED' },
    })
    const sameReviewer = await approveBatch(
      post(`/api/accounting/commissions/review-batches/${BATCH_ID}/approve`, {
        expectedRevision: 9,
      }),
      context(),
    )

    expect(sameReviewer.status).toBe(403)
    expect((await sameReviewer.json()).error).toContain('different Accounting reviewer')
  })

  it('authenticates before validating identifiers or calling database RPCs', async () => {
    mocks.requireAccountingAccess.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await batchDetail(
      new Request('http://localhost/api/accounting/commissions/review-batches/not-an-id'),
      context('not-an-id'),
    )

    expect(response.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
