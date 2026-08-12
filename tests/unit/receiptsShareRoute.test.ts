import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const markPersistedReceiptShared = vi.fn()
  const requireStaffSession = vi.fn()
  return { markPersistedReceiptShared, requireStaffSession }
})

vi.mock('@/lib/services/receiptStore', () => ({
  markPersistedReceiptShared: mocks.markPersistedReceiptShared,
}))
vi.mock('@/lib/auth/staffSession', () => ({
  requireStaffSession: mocks.requireStaffSession,
}))

import { POST } from '@/app/api/receipts/share/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/receipts/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/receipts/share', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireStaffSession.mockResolvedValue({
      authorized: true,
      user: { id: 'auth-user' },
      employee: { id: 'employee-server' },
    })
  })

  it('requires an active staff session', async () => {
    mocks.requireStaffSession.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const res = await POST(makeRequest({ receiptId: 'r-1' }))

    expect(res.status).toBe(401)
    expect(mocks.markPersistedReceiptShared).not.toHaveBeenCalled()
  })

  it('returns 400 when receiptId is missing', async () => {
    const res = await POST(makeRequest({ channel: 'whatsapp' }))
    expect(res.status).toBe(400)
  })

  it('returns supported=false when share tracking is unavailable', async () => {
    mocks.markPersistedReceiptShared.mockResolvedValue({
      supported: false,
      updated: false,
      reason: 'generated_receipts table is not available yet',
    })

    const res = await POST(makeRequest({ receiptId: 'r-1', channel: 'whatsapp' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.supported).toBe(false)
    expect(body.updated).toBe(false)
  })

  it('returns 404 when receipt does not exist', async () => {
    mocks.markPersistedReceiptShared.mockResolvedValue({
      supported: true,
      updated: false,
      reason: 'receipt not found',
    })

    const res = await POST(makeRequest({ receiptId: 'missing-id', channel: 'email' }))
    expect(res.status).toBe(404)
  })

  it('returns share info when update succeeds', async () => {
    mocks.markPersistedReceiptShared.mockResolvedValue({
      supported: true,
      updated: true,
      receiptId: 'r-1',
      shareCount: 2,
      channel: 'whatsapp',
      sharedAt: '2026-04-11T12:00:00.000Z',
    })

    const res = await POST(makeRequest({ receiptId: 'r-1', channel: 'WhatsApp' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      supported: true,
      updated: true,
      receiptId: 'r-1',
      shareCount: 2,
      channel: 'whatsapp',
      sharedAt: '2026-04-11T12:00:00.000Z',
    })

    expect(mocks.markPersistedReceiptShared).toHaveBeenCalledWith({
      receiptId: 'r-1',
      channel: 'whatsapp',
    })
  })
})
