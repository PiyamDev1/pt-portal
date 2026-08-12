import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const send = vi.fn()
  const getS3Client = vi.fn(() => ({ send }))
  const getR2Client = vi.fn()
  const isR2Configured = vi.fn(() => false)
  const migrateFallbackBatch = vi.fn()
  return { send, getS3Client, getR2Client, isR2Configured, migrateFallbackBatch }
})

vi.mock('@/lib/s3Client', () => ({ getS3Client: mocks.getS3Client }))
vi.mock('@/lib/r2Client', () => ({
  getR2Client: mocks.getR2Client,
  isR2Configured: mocks.isR2Configured,
}))
vi.mock('@/lib/r2Migration', () => ({ migrateFallbackBatch: mocks.migrateFallbackBatch }))

import { getDocumentStorageStatus } from '@/lib/documentStorageStatus'

describe('document storage status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.send.mockResolvedValue({})
    mocks.isR2Configured.mockReturnValue(false)
  })

  it('checks bucket health without mutating the bucket CORS policy', async () => {
    const status = await getDocumentStorageStatus({ runMaintenance: true })

    expect(status.connected).toBe(true)
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(mocks.send.mock.calls[0][0].constructor.name).toBe('HeadBucketCommand')
    expect(mocks.migrateFallbackBatch).not.toHaveBeenCalled()
  })
})
