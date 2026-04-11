import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const listPersistedReceipts = vi.fn()
  return { listPersistedReceipts }
})

vi.mock('@/lib/services/receiptStore', () => ({
  listPersistedReceipts: mocks.listPersistedReceipts,
}))

import { GET } from '@/app/api/receipts/list/route'

describe('GET /api/receipts/list includePayload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes includePayload=true to store when requested', async () => {
    mocks.listPersistedReceipts.mockResolvedValue({
      supported: true,
      receipts: [],
    })

    const req = new Request(
      'http://localhost/api/receipts/list?applicantId=a-1&serviceType=nadra&includePayload=true',
    )

    const res = await GET(req)
    expect(res.status).toBe(200)

    expect(mocks.listPersistedReceipts).toHaveBeenCalledWith({
      applicantId: 'a-1',
      serviceType: 'nadra',
      includePayload: true,
    })
  })
})
