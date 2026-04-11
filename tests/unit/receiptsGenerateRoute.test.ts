import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const generateReceipt = vi.fn()
  return { generateReceipt }
})

vi.mock('@/lib/services/receiptGenerator', () => ({
  generateReceipt: mocks.generateReceipt,
}))

import { POST } from '@/app/api/receipts/generate/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/receipts/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/receipts/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makeRequest({ serviceType: 'nadra' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/missing/i)
  })

  it('returns receipt payload when generation succeeds', async () => {
    mocks.generateReceipt.mockResolvedValue({
      id: 'r-1',
      serviceType: 'nadra',
      receiptType: 'submission',
      receiptPin: '123456',
    })

    const res = await POST(
      makeRequest({
        serviceType: 'nadra',
        serviceRecordId: 'n-1',
        receiptType: 'submission',
        generatedBy: 'u-1',
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      receipt: {
        id: 'r-1',
        serviceType: 'nadra',
        receiptType: 'submission',
        receiptPin: '123456',
      },
    })
    expect(mocks.generateReceipt).toHaveBeenCalledWith({
      serviceType: 'nadra',
      serviceRecordId: 'n-1',
      receiptType: 'submission',
      generatedBy: 'u-1',
    })
  })

  it('returns 500 when generation throws', async () => {
    mocks.generateReceipt.mockRejectedValue(new Error('boom'))

    const res = await POST(
      makeRequest({
        serviceType: 'nadra',
        serviceRecordId: 'n-1',
        receiptType: 'submission',
      }),
    )

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/boom|failed to generate receipt/i)
  })
})
