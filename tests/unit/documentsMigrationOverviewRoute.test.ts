import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireMaintenanceSession = vi.fn()
  const getDocumentStorageConstants = vi.fn(() => ({
    MINIO_BUCKET: 'portal-documents',
    R2_BUCKET: 'portal-fallback',
  }))
  const getDocumentStorageStatus = vi.fn()
  const getDocumentMigrationMetrics = vi.fn()
  const getPersistentMigrationEvents = vi.fn()
  const migrateFallbackBatch = vi.fn()

  const from = vi.fn((table: string) => {
    if (table !== 'documents') {
      throw new Error(`Unexpected table: ${table}`)
    }

    return {
      select: vi.fn((columns: string, options?: { count?: 'exact'; head?: boolean }) => {
        const state = {
          columns,
          options,
          filters: {} as Record<string, unknown>,
          orderAscending: undefined as boolean | undefined,
          limit: undefined as number | undefined,
          wantsMaybeSingle: false,
        }

        const resolve = () => {
          const filters = state.filters
          const bucket = filters.minio_bucket
          const deleted = filters.deleted

          if (state.wantsMaybeSingle) {
            return { data: { uploaded_at: '2026-03-18T00:00:00.000Z' }, error: null }
          }

          if (state.options?.head) {
            if (deleted === true) return { count: 1, error: null }
            if (bucket === 'portal-documents') return { count: 8, error: null }
            if (bucket === 'portal-fallback') return { count: 2, error: null }
            return { count: 10, error: null }
          }

          if (state.columns.includes('file_name')) {
            return {
              data: [
                {
                  id: 'doc-1',
                  file_name: 'receipt.pdf',
                  file_size: 512,
                  category: 'receipt',
                  uploaded_at: '2026-03-18T00:00:00.000Z',
                  family_head_id: 'fh-1',
                  minio_key: 'family-fh-1/receipt/receipt.pdf',
                },
              ],
              error: null,
            }
          }

          return { data: [], error: null }
        }

        const query: {
          eq: (column: string, value: unknown) => typeof query
          order: (column: string, options: { ascending: boolean }) => typeof query
          limit: (value: number) => typeof query
          maybeSingle: () => Promise<unknown>
          then: (resolveThen: (value: unknown) => unknown) => Promise<unknown>
        } = {
          eq: (column, value) => {
            state.filters[column] = value
            return query
          },
          order: (_column, options) => {
            state.orderAscending = options.ascending
            return query
          },
          limit: (value) => {
            state.limit = value
            return query
          },
          maybeSingle: () => {
            state.wantsMaybeSingle = true
            return Promise.resolve(resolve())
          },
          then: (resolveThen) => Promise.resolve(resolve()).then(resolveThen),
        }

        return query
      }),
    }
  })

  const getSupabaseClient = vi.fn(() => ({ from }))

  return {
    requireMaintenanceSession,
    getDocumentStorageConstants,
    getDocumentStorageStatus,
    getDocumentMigrationMetrics,
    getPersistentMigrationEvents,
    migrateFallbackBatch,
    getSupabaseClient,
  }
})

vi.mock('@/lib/adminSessionAuth', () => ({
  requireMaintenanceSession: mocks.requireMaintenanceSession,
}))

vi.mock('@/lib/documentStorageStatus', () => ({
  getDocumentStorageConstants: mocks.getDocumentStorageConstants,
  getDocumentStorageStatus: mocks.getDocumentStorageStatus,
}))

vi.mock('@/lib/documentMigrationMetrics', () => ({
  getDocumentMigrationMetrics: mocks.getDocumentMigrationMetrics,
}))

vi.mock('@/lib/documentMigrationStore', () => ({
  getPersistentMigrationEvents: mocks.getPersistentMigrationEvents,
}))

vi.mock('@/lib/r2Migration', () => ({
  migrateFallbackBatch: mocks.migrateFallbackBatch,
}))

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}))

import { GET, POST } from '@/app/api/documents/migration-overview/route'

describe('document migration overview route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireMaintenanceSession.mockResolvedValue({ authorized: true, user: { id: 'admin-1' } })
    mocks.getDocumentStorageStatus.mockResolvedValue({ connected: true, mode: 'primary', ping: 22 })
    mocks.getDocumentMigrationMetrics.mockReturnValue({
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastBatchAt: null,
      lastBatchAttempted: 0,
      lastBatchMigrated: 0,
      lastError: null,
      recentEvents: [],
    })
    mocks.getPersistentMigrationEvents.mockResolvedValue([])
    mocks.migrateFallbackBatch.mockResolvedValue({ attempted: 2, migrated: 2 })
  })

  it('passes through unauthorized response', async () => {
    mocks.requireMaintenanceSession.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    })

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload).toEqual({ error: 'Forbidden' })
  })

  it('returns overview payload directly for GET', async () => {
    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.summary.totalActiveDocuments).toBe(10)
    expect(payload.summary.primaryDocuments).toBe(8)
    expect(payload.summary.fallbackDocuments).toBe(2)
    expect(Array.isArray(payload.recentFallbackDocuments)).toBe(true)
  })

  it('returns 409 when primary storage is offline during manual batch', async () => {
    mocks.getDocumentStorageStatus.mockResolvedValueOnce({ connected: false })

    const response = await POST(
      new Request('http://localhost/api/documents/migration-overview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 10 }),
      }) as never,
    )
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload).toEqual({ error: 'Primary storage is offline. Batch migration is unavailable.' })
  })

  it('returns result and refreshed overview on successful manual batch', async () => {
    const response = await POST(
      new Request('http://localhost/api/documents/migration-overview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 20 }),
      }) as never,
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.result).toEqual({ attempted: 2, migrated: 2 })
    expect(payload.overview.summary.totalActiveDocuments).toBe(10)
    expect(mocks.migrateFallbackBatch).toHaveBeenCalledWith(20, { trigger: 'manual' })
  })
})
