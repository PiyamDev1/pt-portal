import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const ilike = vi.fn()
  const maybeSingle = vi.fn()
  const countrySelect = vi.fn(() => ({ ilike }))
  const countryInsertSingle = vi.fn()
  const countryInsertSelect = vi.fn(() => ({ single: countryInsertSingle }))
  const countryInsert = vi.fn(() => ({ select: countryInsertSelect }))

  const typeUpsert = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'visa_countries') {
      return {
        select: countrySelect,
        insert: countryInsert,
      }
    }
    if (table === 'visa_types') {
      return {
        upsert: typeUpsert,
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  const getServiceSupabaseClient = vi.fn(() => ({ from }))

  return {
    ilike,
    maybeSingle,
    countrySelect,
    countryInsertSingle,
    countryInsertSelect,
    countryInsert,
    typeUpsert,
    from,
    getServiceSupabaseClient,
  }
})

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

import { GET } from '@/app/api/admin/seed-presets/route'

describe('GET /api/admin/seed-presets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

    mocks.ilike.mockReturnValue({ maybeSingle: mocks.maybeSingle })
    mocks.maybeSingle.mockResolvedValue({ data: { id: 'country-1' }, error: null })
    mocks.countryInsertSingle.mockResolvedValue({ data: { id: 'country-new' }, error: null })
    mocks.typeUpsert.mockResolvedValue({ error: null })
  })

  it('returns 500 when Supabase env vars are missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    process.env.SUPABASE_SERVICE_ROLE_KEY = ''

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'Supabase not configured' })
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('returns semantic sync summary payload on success', async () => {
    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.syncedPresetCount).toBeGreaterThan(0)
    expect(Array.isArray(payload.logs)).toBe(true)
  })

  it('returns 500 when seeding throws', async () => {
    mocks.ilike.mockImplementationOnce(() => {
      throw new Error('query failed')
    })

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'query failed' })
  })

  it('returns a controlled error when a missing country cannot be created', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    mocks.countryInsertSingle.mockResolvedValueOnce({ data: null, error: null })

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'Failed to create visa country: Kingdom of Saudi Arabia' })
  })
})
