import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const EMPLOYEE_ID = '20000000-0000-4000-8000-000000000001'
const BATCH_ID = '30000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => ({
  requireCommissionManager: vi.fn(),
  hasCommissionCapability: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/commissions/server', () => ({
  requireCommissionManager: mocks.requireCommissionManager,
}))
vi.mock('@/lib/commissions/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/commissions/api')>()),
  hasCommissionCapability: mocks.hasCommissionCapability,
}))

import { POST as appendPenalty } from '@/app/api/commissions/admin/adjustments/route'
import { POST as submitBatch } from '@/app/api/commissions/admin/review-batches/[batchId]/submit/route'
import { POST as prepareBatch } from '@/app/api/commissions/admin/review-batches/prepare/route'
import { GET as staffReport } from '@/app/api/commissions/admin/staff-report/route'

function post(path: string, body: unknown, key: string | null = 'workflow-request-0001') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) headers['Idempotency-Key'] = key
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

describe('Commission staff report and Accounting handoff routes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z'))
    vi.clearAllMocks()
    mocks.hasCommissionCapability.mockResolvedValue(true)
    mocks.requireCommissionManager.mockResolvedValue({
      authorized: true,
      employee: { id: ACTOR_ID, role: 'Admin' },
      user: { id: ACTOR_ID },
      supabase: { rpc: mocks.rpc, from: mocks.from },
    })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'commission_adjustments') {
        return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
      }
      if (table === 'ticket_bookings') {
        const chain = {
          eq: vi.fn(),
          is: vi.fn(),
          limit: vi.fn().mockResolvedValue({
            data: [
              {
                id: '50000000-0000-4000-8000-000000000001',
                pnr: 'ABC123',
                owner_employee_id: EMPLOYEE_ID,
              },
            ],
            error: null,
          }),
        }
        chain.eq.mockReturnValue(chain)
        chain.is.mockReturnValue(chain)
        return { select: () => chain }
      }
      throw new Error(`Unexpected table ${table}`)
    })
  })

  afterEach(() => vi.useRealTimers())

  it('loads a strict calendar-month report through the current-only staff RPC', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        periodStart: '2024-02-01',
        periodEnd: '2024-02-29',
        items: [],
        currencyTotals: [],
        readiness: {},
      },
      error: null,
    })

    const response = await staffReport(
      new NextRequest('http://localhost/api/commissions/admin/staff-report?period=2024-02'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.hasCommissionCapability).toHaveBeenCalledWith(2026090201)
    expect(mocks.rpc).toHaveBeenCalledWith('commission_shadow_staff_report_2026090201', {
      p_actor_employee_id: ACTOR_ID,
      p_period_start: '2024-02-01',
      p_period_end: '2024-02-29',
    })
  })

  it('authenticates first and rejects unknown or invalid report filters', async () => {
    mocks.requireCommissionManager.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    })
    expect(
      (
        await staffReport(
          new NextRequest('http://localhost/api/commissions/admin/staff-report?period=2026-08'),
        )
      ).status,
    ).toBe(403)
    expect(mocks.hasCommissionCapability).not.toHaveBeenCalled()

    expect(
      (
        await staffReport(
          new NextRequest(
            'http://localhost/api/commissions/admin/staff-report?period=2026-08&employeeId=unsafe',
          ),
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await staffReport(
          new NextRequest('http://localhost/api/commissions/admin/staff-report?period=2026-13'),
        )
      ).status,
    ).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('appends a strict debit penalty with server-derived actor and idempotency', async () => {
    mocks.rpc.mockResolvedValue({
      data: { id: '40000000-0000-4000-8000-000000000001', direction: 'debit' },
      error: null,
    })
    const response = await appendPenalty(
      post('/api/commissions/admin/adjustments', {
        employeeId: EMPLOYEE_ID,
        category: 'adm',
        amount: 125.5,
        currency: ' pkr ',
        periodStart: '2026-09-01',
        reason: '  Airline debit memo  ',
        evidence: { reference: 'ADM-42' },
        pnr: 'ABC123',
        admReference: 'ADM-42',
        companyShare: 24.5,
      }),
    )

    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.rpc).toHaveBeenCalledWith('commission_append_adjustment_2026090201', {
      p_actor_employee_id: ACTOR_ID,
      p_employee_id: EMPLOYEE_ID,
      p_category: 'adm',
      p_direction: 'debit',
      p_amount_pay_currency: 125.5,
      p_pay_currency: 'PKR',
      p_period_start: '2026-09-01',
      p_reason: 'Airline debit memo',
      p_evidence: expect.objectContaining({
        reference: 'ADM-42',
        pnr: 'ABC123',
        admReference: 'ADM-42',
        employeeSharePayCurrency: 125.5,
        companySharePayCurrency: 24.5,
        totalAdmPayCurrency: 150,
      }),
      p_reverses_adjustment_id: null,
      p_request_key: 'workflow-request-0001',
    })
  })

  it('rejects missing keys, invalid periods and caller-supplied penalty authority', async () => {
    expect(
      (
        await appendPenalty(
          post(
            '/api/commissions/admin/adjustments',
            {
              employeeId: EMPLOYEE_ID,
              category: 'loss',
              amount: 10,
              currency: 'GBP',
              periodStart: '2026-08-01',
              reason: 'Supplier loss',
            },
            null,
          ),
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await appendPenalty(
          post('/api/commissions/admin/adjustments', {
            employeeId: EMPLOYEE_ID,
            actorEmployeeId: ACTOR_ID,
            category: 'loss',
            amount: 10,
            currency: 'GBP',
            periodStart: '2026-08-01',
            reason: 'Supplier loss',
          }),
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await appendPenalty(
          post('/api/commissions/admin/adjustments', {
            employeeId: EMPLOYEE_ID,
            category: 'loss',
            amount: 10,
            currency: 'GBP',
            periodStart: '2026-08-14',
            reason: 'Supplier loss',
          }),
        )
      ).status,
    ).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('reports an Accounting review lock as an optimistic workflow conflict', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '55000', hint: 'COMMISSION_REVIEW_PERIOD_LOCKED' },
    })

    const response = await appendPenalty(
      post('/api/commissions/admin/adjustments', {
        employeeId: EMPLOYEE_ID,
        category: 'adm',
        amount: 25,
        currency: 'GBP',
        periodStart: '2026-09-01',
        reason: 'Airline debit memo',
        pnr: 'ABC123',
        admReference: 'ADM-42',
      }),
    )

    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('locked for Commission review')
  })

  it('prepares a completed month with an audited request key', async () => {
    mocks.rpc.mockResolvedValue({
      data: { id: BATCH_ID, revision: 1, status: 'draft' },
      error: null,
    })
    const response = await prepareBatch(
      post('/api/commissions/admin/review-batches/prepare', {
        periodStart: '2026-08-01',
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('commission_prepare_review_batch_2026090201', {
      p_actor_employee_id: ACTOR_ID,
      p_period_start: '2026-08-01',
      p_request_key: 'workflow-request-0001',
    })

    const unsafe = await prepareBatch(
      post('/api/commissions/admin/review-batches/prepare', {
        periodStart: '2026-08-01',
        actorEmployeeId: ACTOR_ID,
      }),
    )
    expect(unsafe.status).toBe(400)
  })

  it('submits using the expected revision and maps optimistic conflicts', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { id: BATCH_ID, revision: 2, status: 'submitted_to_accounting' },
      error: null,
    })
    const response = await submitBatch(
      post(`/api/commissions/admin/review-batches/${BATCH_ID}/submit`, {
        expectedRevision: 1,
      }),
      { params: Promise.resolve({ batchId: BATCH_ID }) },
    )

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('commission_submit_review_batch_2026090201', {
      p_actor_employee_id: ACTOR_ID,
      p_batch_id: BATCH_ID,
      p_expected_revision: 1,
      p_request_key: 'workflow-request-0001',
    })

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '40001' } })
    const stale = await submitBatch(
      post(`/api/commissions/admin/review-batches/${BATCH_ID}/submit`, {
        expectedRevision: 1,
      }),
      { params: Promise.resolve({ batchId: BATCH_ID }) },
    )
    expect(stale.status).toBe(409)
    expect(await stale.json()).toEqual({
      error: 'The Commission review changed. Reload it and try again.',
    })
  })

  it('fails closed when the Accounting workflow capability is unavailable', async () => {
    mocks.hasCommissionCapability.mockResolvedValue(false)
    const response = await prepareBatch(
      post('/api/commissions/admin/review-batches/prepare', {
        periodStart: '2026-08-01',
      }),
    )
    expect(response.status).toBe(503)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
