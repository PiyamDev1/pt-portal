import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireStaffSession = vi.fn()
  const findStoredDocumentById = vi.fn()
  const s3Send = vi.fn()
  const r2Send = vi.fn()
  const isR2Configured = vi.fn(() => false)
  const finalEq = vi.fn()
  const firstEq = vi.fn(() => ({ eq: finalEq }))
  const update = vi.fn(() => ({ eq: firstEq }))
  const from = vi.fn(() => ({ update }))
  return {
    requireStaffSession,
    findStoredDocumentById,
    s3Send,
    r2Send,
    isR2Configured,
    finalEq,
    firstEq,
    update,
    from,
  }
})

vi.mock('@/lib/auth/staffSession', () => ({ requireStaffSession: mocks.requireStaffSession }))
vi.mock('@/lib/services/documentServer', () => ({
  findStoredDocumentById: mocks.findStoredDocumentById,
}))
vi.mock('@/lib/s3Client', () => ({ getS3Client: () => ({ send: mocks.s3Send }) }))
vi.mock('@/lib/r2Client', () => ({
  getR2Client: () => ({ send: mocks.r2Send }),
  isR2Configured: mocks.isR2Configured,
}))
vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: () => ({ from: mocks.from }),
}))

import { DELETE } from '@/app/api/documents/[documentId]/route'

const callDelete = () =>
  DELETE(new Request('http://localhost/api/documents/doc-1', { method: 'DELETE' }) as never, {
    params: Promise.resolve({ documentId: 'doc-1' }),
  })

describe('DELETE /api/documents/[documentId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireStaffSession.mockResolvedValue({
      authorized: true,
      user: { id: 'staff-1' },
      employee: { id: 'staff-1' },
    })
    mocks.findStoredDocumentById.mockResolvedValue({
      id: 'doc-1',
      fileName: 'passport.pdf',
      fileType: 'application/pdf',
      familyHeadId: 'fh-1',
      bucket: 'portal-documents',
      key: 'family-fh-1/general/doc-1-passport.pdf',
      category: 'general',
    })
    mocks.s3Send.mockResolvedValue({})
    mocks.finalEq.mockResolvedValue({ error: null })
    mocks.isR2Configured.mockReturnValue(false)
  })

  it('rejects unauthenticated deletion before record or storage access', async () => {
    mocks.requireStaffSession.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await callDelete()

    expect(response.status).toBe(401)
    expect(mocks.findStoredDocumentById).not.toHaveBeenCalled()
    expect(mocks.s3Send).not.toHaveBeenCalled()
  })

  it('resolves a live record before deleting its exact object and metadata', async () => {
    const response = await callDelete()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ deletedDocumentId: 'doc-1' })
    expect(mocks.findStoredDocumentById).toHaveBeenCalledWith('doc-1')
    expect(mocks.s3Send).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledWith({ deleted: true })
  })

  it('does not delete storage when database access revocation fails', async () => {
    mocks.finalEq.mockResolvedValue({ error: { message: 'database unavailable' } })

    const response = await callDelete()

    expect(response.status).toBe(500)
    expect(mocks.s3Send).not.toHaveBeenCalled()
  })

  it('restores the live metadata flag when primary storage deletion fails', async () => {
    mocks.s3Send.mockRejectedValue(new Error('storage unavailable'))
    mocks.finalEq.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: null })

    const response = await callDelete()

    expect(response.status).toBe(500)
    expect(mocks.update).toHaveBeenNthCalledWith(1, { deleted: true })
    expect(mocks.update).toHaveBeenNthCalledWith(2, { deleted: false })
  })
})
