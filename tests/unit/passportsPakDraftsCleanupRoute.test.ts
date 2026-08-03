import { beforeEach, describe, expect, it, vi } from 'vitest'

type QueryResult = {
  data?: unknown
  error?: unknown
}

const mocks = vi.hoisted(() => {
  const queues = new Map<string, any[]>()
  const from = vi.fn((table: string) => {
    const queue = queues.get(table) || []
    const query = queue.shift()
    queues.set(table, queue)
    return query || makeQuery()
  })
  const getSupabaseClient = vi.fn(() => ({ from }))
  const send = vi.fn(async () => ({}))
  const getS3Client = vi.fn(() => ({ send }))
  const getR2Client = vi.fn(() => ({ send }))
  const isR2Configured = vi.fn(() => false)

  function makeQuery(result: QueryResult = { data: null, error: null }) {
    const query: any = {
      select: vi.fn(() => query),
      update: vi.fn(() => query),
      delete: vi.fn(() => query),
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
      is: vi.fn(() => query),
      lte: vi.fn(() => query),
      limit: vi.fn(() => query),
      then: (resolve: (value: QueryResult) => unknown, reject: (reason?: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    }
    return query
  }

  return {
    queues,
    from,
    getSupabaseClient,
    getS3Client,
    getR2Client,
    isR2Configured,
    send,
    makeQuery,
  }
})

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}))

vi.mock('@/lib/s3Client', () => ({
  getS3Client: mocks.getS3Client,
}))

vi.mock('@/lib/r2Client', () => ({
  getR2Client: mocks.getR2Client,
  isR2Configured: mocks.isR2Configured,
}))

import { GET } from '@/app/api/cron/passports/pak/drafts-cleanup/route'

function queue(table: string, ...queries: any[]) {
  mocks.queues.set(table, queries)
}

describe('GET /api/cron/passports/pak/drafts-cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.queues.clear()
    delete process.env.CRON_SECRET
    mocks.isR2Configured.mockReturnValue(false)
  })

  it('returns zero counts when no cancelled drafts are eligible', async () => {
    queue('pakistani_passport_drafts', mocks.makeQuery({ data: [], error: null }))

    const res = await GET(new Request('http://localhost/api/cron/passports/pak/drafts-cleanup'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      deletedDraftCount: 0,
      deletedDocumentCount: 0,
      retentionDays: 30,
    })
  })

  it('soft-deletes documents and deletes eligible draft rows', async () => {
    const draftQuery = mocks.makeQuery({
      data: [{ id: 'row-1', draft_id: 'PKD-ABCDE12345' }],
      error: null,
    })
    const documentsQuery = mocks.makeQuery({
      data: [
        {
          id: 'doc-1',
          minio_key: 'family-PKD-ABCDE12345/general/passport.pdf',
          minio_bucket: 'portal-documents',
        },
      ],
      error: null,
    })
    const documentUpdate = mocks.makeQuery({ data: null, error: null })
    const draftDelete = mocks.makeQuery({ data: null, error: null })

    queue('pakistani_passport_drafts', draftQuery, draftDelete)
    queue('documents', documentsQuery, documentUpdate)

    const res = await GET(new Request('http://localhost/api/cron/passports/pak/drafts-cleanup'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      deletedDraftCount: 1,
      deletedDocumentCount: 1,
      retentionDays: 30,
    })
    expect(draftQuery.eq).toHaveBeenCalledWith('status', 'Cancelled')
    expect(draftQuery.in).toHaveBeenCalledWith('payment_status', [
      'unknown',
      'not_taken',
      'refunded',
    ])
    expect(documentUpdate.update).toHaveBeenCalledWith({ deleted: true })
    expect(documentUpdate.eq).toHaveBeenCalledWith('id', 'doc-1')
    expect(draftDelete.delete).toHaveBeenCalled()
    expect(draftDelete.in).toHaveBeenCalledWith('id', ['row-1'])
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })

  it('rejects unauthorized cron calls when CRON_SECRET is configured', async () => {
    process.env.CRON_SECRET = 'secret'

    const res = await GET(new Request('http://localhost/api/cron/passports/pak/drafts-cleanup'))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })
})
