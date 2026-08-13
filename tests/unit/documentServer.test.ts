import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const eqDeleted = vi.fn(() => ({ maybeSingle }))
  const eqIdentity = vi.fn(() => ({ eq: eqDeleted }))
  const select = vi.fn(() => ({ eq: eqIdentity }))
  const from = vi.fn(() => ({ select }))
  const getSignedUrl = vi.fn()
  const getS3Client = vi.fn(() => ({ send: vi.fn() }))
  const getR2Client = vi.fn(() => ({ send: vi.fn() }))
  const isR2Configured = vi.fn(() => false)
  return {
    maybeSingle,
    eqDeleted,
    eqIdentity,
    select,
    from,
    getSignedUrl,
    getS3Client,
    getR2Client,
    isR2Configured,
  }
})

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: () => ({ from: mocks.from }),
}))
vi.mock('@/lib/s3Client', () => ({ getS3Client: mocks.getS3Client }))
vi.mock('@/lib/r2Client', () => ({
  getR2Client: mocks.getR2Client,
  isR2Configured: mocks.isR2Configured,
}))
vi.mock('@/lib/r2Migration', () => ({ migrateObjectFromR2ToMinio: vi.fn() }))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: mocks.getSignedUrl }))

import {
  findStoredDocumentById,
  getSignedDocumentUrl,
  type StoredDocument,
} from '@/lib/services/documentServer'

const baseRow = {
  id: 'doc-1',
  file_name: 'passport.pdf',
  file_type: 'application/pdf',
  family_head_id: 'fh-1',
  minio_bucket: 'portal-documents',
  minio_key: 'family-fh-1/general/doc-1-passport.pdf',
  category: 'general',
  deleted: false,
}

describe('document server storage resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.maybeSingle.mockResolvedValue({ data: baseRow, error: null })
    mocks.getSignedUrl.mockResolvedValue('https://signed.example/document')
    mocks.isR2Configured.mockReturnValue(false)
  })

  it('rejects a database key that does not belong to the document scope', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { ...baseRow, minio_key: 'family-other/private.pdf' },
      error: null,
    })

    await expect(findStoredDocumentById('doc-1')).resolves.toBeNull()
  })

  it('accepts the original PKD storage key for its converted application', async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({
        data: {
          ...baseRow,
          family_head_id: '11111111-1111-4111-8111-111111111111',
          minio_key: 'family-PKD-ABCDE12345/general/doc-1-passport.pdf',
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: 'draft-row-1' }, error: null })

    await expect(findStoredDocumentById('doc-1')).resolves.toEqual(
      expect.objectContaining({
        familyHeadId: '11111111-1111-4111-8111-111111111111',
        key: 'family-PKD-ABCDE12345/general/doc-1-passport.pdf',
      }),
    )
    expect(mocks.eqIdentity).toHaveBeenCalledWith('draft_id', 'PKD-ABCDE12345')
    expect(mocks.eqDeleted).toHaveBeenCalledWith(
      'converted_application_id',
      '11111111-1111-4111-8111-111111111111',
    )
  })

  it('restricts database-provided buckets to configured document storage', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { ...baseRow, minio_bucket: 'unrelated-private-bucket' },
      error: null,
    })

    await expect(findStoredDocumentById('doc-1')).resolves.toEqual(
      expect.objectContaining({ bucket: 'portal-documents' }),
    )
  })

  it('forces unsafe stored types to download with private no-store signing headers', async () => {
    const document: StoredDocument = {
      id: 'doc-1',
      fileName: 'archive.zip',
      fileType: 'application/zip',
      familyHeadId: 'fh-1',
      bucket: 'portal-documents',
      key: 'family-fh-1/zip-archive/archive.zip',
      category: 'zip-archive',
    }

    await expect(getSignedDocumentUrl(document)).resolves.toBe('https://signed.example/document')

    const command = mocks.getSignedUrl.mock.calls[0][1]
    expect(command.input.ResponseContentDisposition).toContain('attachment')
    expect(command.input.ResponseCacheControl).toContain('no-store')
  })
})
