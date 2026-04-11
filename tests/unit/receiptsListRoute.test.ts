import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const listPersistedReceipts = vi.fn()
  return { listPersistedReceipts }
})

vi.mock('@/lib/services/receiptStore', () => ({
  listPersistedReceipts: mocks.listPersistedReceipts,
}))

import { GET } from '@/app/api/receipts/list/route'

const makeRequest = (query = '') =>
  new Request(`http://localhost/api/receipts/list${query ? `?${query}` : ''}`)

describe('GET /api/receipts/list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when no filters are provided', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid serviceType', async () => {
    const res = await GET(makeRequest('serviceType=visa'))
    expect(res.status).toBe(400)
  })

  it('returns receipts list with supported=false message when unavailable', async () => {
    mocks.listPersistedReceipts.mockResolvedValue({
      supported: false,
      reason: 'generated_receipts table is not available yet',
      receipts: [],
    })

    const res = await GET(makeRequest('applicantId=a-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.supported).toBe(false)
    expect(body.receipts).toEqual([])
  })

  it('returns receipts with valid filter mapping', async () => {
    mocks.listPersistedReceipts.mockResolvedValue({
      supported: true,
      receipts: [
        {
          id: 'r-1',
          serviceType: 'nadra',
          receiptType: 'submission',
          trackingNumber: 'TRK-1',
          applicantId: 'a-1',
          applicantName: 'Jane Doe',
          generatedAt: '2026-04-11T10:00:00.000Z',
        },
      ],
    })

    const res = await GET(makeRequest('applicantId=a-1&serviceType=nadra'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.supported).toBe(true)
    expect(body.receipts).toHaveLength(1)

    expect(mocks.listPersistedReceipts).toHaveBeenCalledWith({
      applicantId: 'a-1',
      serviceType: 'nadra',
      includePayload: false,
    })
  })
})
