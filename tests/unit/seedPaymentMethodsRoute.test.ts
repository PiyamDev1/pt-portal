import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const from = vi.fn()
  const createClient = vi.fn(() => ({ from }))
  return { from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { POST } from '@/app/api/admin/seed-payment-methods/route'

describe('/api/admin/seed-payment-methods route', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  })

  it('returns 500 when Supabase env vars are missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    process.env.SUPABASE_SERVICE_ROLE_KEY = ''

    const request = new Request('http://localhost/api/admin/seed-payment-methods', {
      method: 'POST',
    })
    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'Supabase not configured' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('returns skipped when payment methods already exist', async () => {
    const limit = vi.fn(async () => ({ data: [{ id: 'pm-1' }], error: null }))
    const select = vi.fn(() => ({ limit }))
    mocks.from.mockImplementation(() => ({ select }))

    const request = new Request('http://localhost/api/admin/seed-payment-methods', {
      method: 'POST',
    })
    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ message: 'Payment methods already exist', skipped: true })
  })

  it('returns 500 when insert fails', async () => {
    const limit = vi.fn(async () => ({ data: [], error: null }))
    const existingSelect = vi.fn(() => ({ limit }))

    const insertSelect = vi.fn(async () => ({
      data: null,
      error: { message: 'insert failed' },
    }))
    const insert = vi.fn(() => ({ select: insertSelect }))

    let callCount = 0
    mocks.from.mockImplementation(() => {
      callCount += 1
      return callCount === 1 ? { select: existingSelect } : { insert }
    })

    const request = new Request('http://localhost/api/admin/seed-payment-methods', {
      method: 'POST',
    })
    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toBe('insert failed')
  })

  it('inserts default payment methods and returns them', async () => {
    const limit = vi.fn(async () => ({ data: [], error: null }))
    const existingSelect = vi.fn(() => ({ limit }))

    const insertedMethods = [
      { id: 'pm-1', name: 'Cash' },
      { id: 'pm-2', name: 'Bank Transfer' },
      { id: 'pm-3', name: 'Card Payment' },
    ]
    const insertSelect = vi.fn(async () => ({ data: insertedMethods, error: null }))
    const insert = vi.fn(() => ({ select: insertSelect }))

    let callCount = 0
    mocks.from.mockImplementation(() => {
      callCount += 1
      return callCount === 1 ? { select: existingSelect } : { insert }
    })

    const request = new Request('http://localhost/api/admin/seed-payment-methods', {
      method: 'POST',
    })
    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.createdCount).toBe(3)
    expect(payload.methods).toEqual(insertedMethods)
    expect(insert).toHaveBeenCalledWith([
      { name: 'Cash' },
      { name: 'Bank Transfer' },
      { name: 'Card Payment' },
    ])
  })

  afterAll(() => {
    process.env = originalEnv
  })
})
