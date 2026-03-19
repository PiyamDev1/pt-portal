import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const from = vi.fn()
  const createServerClient = vi.fn(() => ({ from }))
  const cookies = vi.fn(async () => ({ getAll: () => [] }))
  return { from, createServerClient, cookies }
})

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerClient: mocks.createServerClient,
}))

vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
}))

import { POST } from '@/app/api/lms/skip-installment/route'

describe('/api/lms/skip-installment route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when installmentId is missing', async () => {
    const request = new Request('http://localhost/api/lms/skip-installment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'installmentId is required' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('returns 404 when installment lookup fails', async () => {
    const single = vi.fn(async () => ({ data: null, error: { message: 'missing' } }))
    const eq = vi.fn(() => ({ single }))
    const select = vi.fn(() => ({ eq }))

    mocks.from.mockImplementation((table: string) => {
      if (table !== 'loan_installments') {
        throw new Error(`Unexpected table: ${table}`)
      }
      return { select }
    })

    const request = new Request('http://localhost/api/lms/skip-installment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installmentId: 'inst-404' }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload).toEqual({ error: 'Installment not found' })
  })

  it('skips installment and recalculates remaining amounts', async () => {
    const installmentUpdateEq = vi.fn(async () => ({ error: null }))
    const installmentUpdate = vi.fn(() => ({ eq: installmentUpdateEq }))

    const installmentSingle = vi.fn(async () => ({
      data: {
        loan_transaction_id: 'tx-1',
        loan_transactions: { loan_id: 'loan-1', amount: '1000' },
      },
      error: null,
    }))

    const installmentsOrder = vi.fn(async () => ({
      data: [
        { id: 'inst-1', status: 'skipped' },
        { id: 'inst-2', status: 'due' },
      ],
      error: null,
    }))

    let installmentSelectCalls = 0
    const installmentEq = vi.fn(() => {
      installmentSelectCalls += 1
      if (installmentSelectCalls === 1) return { single: installmentSingle }
      return { order: installmentsOrder }
    })
    const installmentSelect = vi.fn(() => ({ eq: installmentEq }))

    const paymentEq2 = vi.fn(async () => ({ data: [{ amount: '200' }], error: null }))
    const paymentEq1 = vi.fn(() => ({ eq: paymentEq2 }))
    const paymentSelect = vi.fn(() => ({ eq: paymentEq1 }))

    mocks.from.mockImplementation((table: string) => {
      if (table === 'loan_installments') {
        return {
          select: installmentSelect,
          update: installmentUpdate,
        }
      }
      if (table === 'loan_transactions') {
        return {
          select: paymentSelect,
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    const request = new Request('http://localhost/api/lms/skip-installment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installmentId: 'inst-1' }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.skippedInstallmentId).toBe('inst-1')
    expect(payload.remainingBalance).toBe(800)
    expect(payload.remainingInstallments).toBe(1)
    expect(payload.newAmountPerInstallment).toBe(800)

    expect(installmentUpdate).toHaveBeenNthCalledWith(1, {
      status: 'skipped',
      amount_paid: 0,
    })
    expect(installmentUpdate).toHaveBeenNthCalledWith(2, {
      amount: 800,
    })
    expect(installmentUpdateEq).toHaveBeenNthCalledWith(1, 'id', 'inst-1')
    expect(installmentUpdateEq).toHaveBeenNthCalledWith(2, 'id', 'inst-2')
  })
})
