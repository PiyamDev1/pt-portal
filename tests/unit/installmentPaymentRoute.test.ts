import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const from = vi.fn()
  const supabase = { from }
  const createServerClient = vi.fn(() => supabase)
  const getAll = vi.fn(() => [])
  const cookies = vi.fn(async () => ({ getAll }))
  const ensureInstallmentsTableExists = vi.fn(async () => true)

  return {
    from,
    createServerClient,
    cookies,
    ensureInstallmentsTableExists,
  }
})

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerClient: mocks.createServerClient,
}))

vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
}))

vi.mock('@/lib/installmentsDb', () => ({
  ensureInstallmentsTableExists: mocks.ensureInstallmentsTableExists,
}))

import {
  DELETE as deleteInstallmentPayment,
  PATCH as patchInstallmentPayment,
  POST as postInstallmentPayment,
} from '@/app/api/lms/installment-payment/route'

describe('/api/lms/installment-payment route validations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('POST returns 400 when installmentId is missing', async () => {
    const request = new Request('http://localhost/api/lms/installment-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentAmount: 50 }),
    })

    const response = await postInstallmentPayment(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain('installmentId is required')
    expect(mocks.ensureInstallmentsTableExists).toHaveBeenCalledTimes(1)
  })

  it('DELETE returns 400 when transactionId/accountId query params are missing', async () => {
    const request = new Request('http://localhost/api/lms/installment-payment?transactionId=abc', {
      method: 'DELETE',
    })

    const response = await deleteInstallmentPayment(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain('transactionId and accountId are required')
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('PATCH returns 400 when transactionId is missing', async () => {
    const request = new Request('http://localhost/api/lms/installment-payment', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentAmount: 25 }),
    })

    const response = await patchInstallmentPayment(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain('transactionId is required')
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
