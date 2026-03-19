import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const from = vi.fn()
  const createClient = vi.fn(() => ({ from }))
  return { from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { POST } from '@/app/api/lms/seed-service-categories/route'

describe('/api/lms/seed-service-categories route', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  })

  it('returns 500 when Supabase env vars are missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    process.env.SUPABASE_SERVICE_ROLE_KEY = ''

    const response = await POST()
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toContain('Supabase not configured')
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('returns 500 when fetching existing categories fails', async () => {
    const select = vi.fn(async () => ({ data: null, error: { message: 'fetch failed' } }))

    mocks.from.mockImplementation((table: string) => {
      if (table !== 'loan_service_categories') {
        throw new Error(`Unexpected table: ${table}`)
      }
      return { select }
    })

    const response = await POST()
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toBe('fetch failed')
  })

  it('normalizes existing names, upserts defaults, and returns categories', async () => {
    const order = vi.fn(async () => ({
      data: [
        { id: '1', name: 'hotels' },
        { id: '2', name: 'nadra' },
      ],
      error: null,
    }))

      const upsert = vi.fn<(rows: Array<{ name: string }>) => Promise<{ data?: null; error: null }>>(async () => ({ error: null }))

    const updateEq = vi.fn(async () => ({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))

    let selectCalls = 0
    const select = vi.fn(() => {
      selectCalls += 1
      if (selectCalls === 1) {
        return Promise.resolve({
          data: [
            { id: '1', name: 'NADRA' },
            { id: '2', name: 'hotels' },
          ],
          error: null,
        })
      }
      return { order }
    })

    mocks.from.mockImplementation((table: string) => {
      if (table !== 'loan_service_categories') {
        throw new Error(`Unexpected table: ${table}`)
      }
      return {
        select,
        update,
        upsert,
      }
    })

    const response = await POST()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.categories).toEqual([
      { id: '1', name: 'hotels' },
      { id: '2', name: 'nadra' },
    ])

    expect(update).toHaveBeenCalledWith({ name: 'nadra' })
    expect(updateEq).toHaveBeenCalledWith('id', '1')
    expect(upsert).toHaveBeenCalledTimes(1)

      const upsertPayload = upsert.mock.calls.at(0)?.[0] ?? []
    expect(upsertPayload).toEqual([
      { name: 'nadra' },
      { name: 'passport' },
      { name: 'ticket' },
      { name: 'umrah' },
      { name: 'hotels' },
      { name: 'visa' },
    ])
  })

  it('returns 500 when upsert fails', async () => {
    const select = vi.fn(async () => ({ data: [], error: null }))
    const upsert = vi.fn(async () => ({ error: { message: 'upsert failed' } }))

    mocks.from.mockImplementation(() => ({ select, upsert }))

    const response = await POST()
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toBe('upsert failed')
  })

  afterAll(() => {
    process.env = originalEnv
  })
})
