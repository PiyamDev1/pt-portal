import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const verifyPersistedReceiptByPin = vi.fn()
  return { verifyPersistedReceiptByPin }
})

vi.mock('@/lib/services/receiptStore', () => ({
  verifyPersistedReceiptByPin: mocks.verifyPersistedReceiptByPin,
}))

import { POST } from '@/app/api/receipts/verify/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/receipts/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/receipts/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makeRequest({ trackingNumber: 'TRK-1' }))
    expect(res.status).toBe(400)
  })

  it('returns supported=false when storage is unavailable', async () => {
    mocks.verifyPersistedReceiptByPin.mockResolvedValue({
      supported: false,
      valid: false,
      reason: 'generated_receipts table is not available yet',
    })

    const res = await POST(makeRequest({ trackingNumber: 'TRK-1', receiptPin: '123456' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      valid: false,
      supported: false,
      message: 'generated_receipts table is not available yet',
    })
  })

  it('returns valid=false when pin does not match', async () => {
    mocks.verifyPersistedReceiptByPin.mockResolvedValue({
      supported: true,
      valid: false,
    })

    const res = await POST(makeRequest({ trackingNumber: 'TRK-1', receiptPin: '000000' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.supported).toBe(true)
  })

  it('returns verified receipt when pin matches', async () => {
    mocks.verifyPersistedReceiptByPin.mockResolvedValue({
      supported: true,
      valid: true,
      receipt: {
        id: 'r-1',
        serviceType: 'nadra',
        receiptType: 'submission',
        trackingNumber: 'TRK-1',
        applicantId: 'a-1',
        applicantName: 'Jane Doe',
        generatedAt: '2026-04-11T10:00:00.000Z',
      },
    })

    const res = await POST(makeRequest({ trackingNumber: 'TRK-1', receiptPin: '123456' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.receipt.id).toBe('r-1')
  })
})
