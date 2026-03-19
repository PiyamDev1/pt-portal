import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const limit = vi.fn()
  const select = vi.fn(() => ({ limit }))
  const from = vi.fn(() => ({ select }))
  const createClient = vi.fn(() => ({ from }))

  return { limit, select, from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { POST } from '@/app/api/admin/create-installments-table/route'

describe('POST /api/admin/create-installments-table', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    mocks.limit.mockResolvedValue({ error: null })
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns 500 when supabase env vars are missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    process.env.SUPABASE_SERVICE_ROLE_KEY = ''

    const response = await POST()
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'Supabase not configured' })
  })

  it('returns 400 and sql guidance when table does not exist', async () => {
    mocks.limit.mockResolvedValue({ error: { message: 'relation does not exist' } })

    const response = await POST()
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Table does not exist. Please run this SQL in your Supabase SQL Editor:')
    expect(payload.sql).toContain('CREATE TABLE IF NOT EXISTS public.loan_installments')
  })

  it('returns semantic table-ready payload when table exists', async () => {
    const response = await POST()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ tableReady: true, tableExists: true })
  })
})
