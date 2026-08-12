import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireStaffSession: vi.fn(),
  findStoredDocumentById: vi.fn(),
  findStoredDocumentByKey: vi.fn(),
  readStoredDocument: vi.fn(),
}))

vi.mock('@/lib/auth/staffSession', () => ({ requireStaffSession: mocks.requireStaffSession }))
vi.mock('@/lib/services/documentServer', () => ({
  findStoredDocumentById: mocks.findStoredDocumentById,
  findStoredDocumentByKey: mocks.findStoredDocumentByKey,
  readStoredDocument: mocks.readStoredDocument,
}))

import { GET as preview } from '@/app/api/documents/preview/route'
import { GET as download } from '@/app/api/documents/download/route'

function byteStream(value: string) {
  return (async function* () {
    yield new TextEncoder().encode(value)
  })()
}

describe('authenticated document delivery routes', () => {
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
      key: 'family-fh-1/general/passport.pdf',
      category: 'general',
    })
    mocks.readStoredDocument.mockResolvedValue({ Body: byteStream('file-bytes') })
  })

  it('does not resolve or read storage for unauthenticated callers', async () => {
    mocks.requireStaffSession.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await preview(
      new Request('http://localhost/api/documents/preview?documentId=doc-1') as never,
    )

    expect(response.status).toBe(401)
    expect(mocks.findStoredDocumentById).not.toHaveBeenCalled()
    expect(mocks.readStoredDocument).not.toHaveBeenCalled()
  })

  it('previews a live record with sensitive cache and sniffing protections', async () => {
    const response = await preview(
      new Request('http://localhost/api/documents/preview?documentId=doc-1') as never,
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('file-bytes')
    expect(response.headers.get('content-type')).toContain('application/pdf')
    expect(response.headers.get('content-disposition')).toContain('inline')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(mocks.findStoredDocumentById).toHaveBeenCalledWith('doc-1')
  })

  it('requires a legacy key to resolve to a live document record', async () => {
    mocks.findStoredDocumentByKey.mockResolvedValue(null)

    const response = await preview(
      new Request('http://localhost/api/documents/preview?key=arbitrary/private-key') as never,
    )

    expect(response.status).toBe(404)
    expect(mocks.findStoredDocumentByKey).toHaveBeenCalledWith('arbitrary/private-key')
    expect(mocks.readStoredDocument).not.toHaveBeenCalled()
  })

  it('always sends downloads as private attachments', async () => {
    const response = await download(
      new Request('http://localhost/api/documents/download?documentId=doc-1') as never,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toContain('attachment')
    expect(response.headers.get('cache-control')).toContain('private')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })
})
