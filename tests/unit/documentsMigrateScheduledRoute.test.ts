import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => {
  const getDocumentStorageStatus = vi.fn()
  const migrateFallbackBatch = vi.fn()

  return { getDocumentStorageStatus, migrateFallbackBatch }
})

vi.mock('@/lib/documentStorageStatus', () => ({
  getDocumentStorageStatus: mocks.getDocumentStorageStatus,
}))

vi.mock('@/lib/r2Migration', () => ({
  migrateFallbackBatch: mocks.migrateFallbackBatch,
}))

import { GET, POST } from '@/app/api/documents/migrate-scheduled/route'

function makeNextRequest(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, init)
}

describe('scheduled document migration route', () => {
  const originalToken = process.env.DOCUMENT_MIGRATION_CRON_TOKEN

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DOCUMENT_MIGRATION_CRON_TOKEN = 'cron-secret'
  })

  afterAll(() => {
    process.env.DOCUMENT_MIGRATION_CRON_TOKEN = originalToken
  })

  it('returns 401 for unauthorized GET requests', async () => {
    const response = await GET(makeNextRequest('http://localhost/api/documents/migrate-scheduled'))
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized' })
  })

  it('returns skipped payload when primary storage is offline', async () => {
    mocks.getDocumentStorageStatus.mockResolvedValue({ connected: false })

    const response = await GET(
      makeNextRequest('http://localhost/api/documents/migrate-scheduled?token=cron-secret'),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      skipped: true,
      reason: 'Primary storage is offline',
    })
    expect(mocks.getDocumentStorageStatus).toHaveBeenCalledWith({ runMaintenance: false })
    expect(mocks.migrateFallbackBatch).not.toHaveBeenCalled()
  })

  it('returns migration result for authorized requests', async () => {
    mocks.getDocumentStorageStatus.mockResolvedValue({ connected: true })
    mocks.migrateFallbackBatch.mockResolvedValue({ attempted: 7, migrated: 5 })

    const response = await POST(
      makeNextRequest('http://localhost/api/documents/migrate-scheduled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'cron-secret', limit: 7 }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.skipped).toBe(false)
    expect(payload.result).toEqual({ attempted: 7, migrated: 5 })
    expect(payload.timestamp).toEqual(expect.any(String))
    expect(mocks.migrateFallbackBatch).toHaveBeenCalledWith(7, { trigger: 'cron' })
  })

  it('returns normalized 500 error when migration throws', async () => {
    mocks.getDocumentStorageStatus.mockResolvedValue({ connected: true })
    mocks.migrateFallbackBatch.mockRejectedValue(new Error('batch failure'))

    const response = await GET(
      makeNextRequest('http://localhost/api/documents/migrate-scheduled?token=cron-secret'),
    )
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'batch failure' })
  })
})
