import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const supabaseAnonInstance = { auth: { getUser } }
  const createServerClient = vi.fn(() => supabaseAnonInstance)
  const adminFrom = vi.fn()
  const createClient = vi.fn(() => ({ from: adminFrom }))
  const cookies = vi.fn(async () => ({ getAll: () => [] }))
  return { getUser, createServerClient, adminFrom, createClient, cookies }
})

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerClient: mocks.createServerClient,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
}))

// Prevent real mailgun/bcrypt calls from executing
vi.mock('mailgun.js', () => ({
  default: vi.fn(() => ({ client: vi.fn() })),
}))

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn(async () => 'hashed') },
}))

import { GET, POST } from '@/app/api/admin/add-employee/route'

describe('/api/admin/add-employee route', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    process.env.MAILGUN_API_KEY = 'mg-key'
    process.env.MAILGUN_DOMAIN = 'mg.example.com'
    process.env.MAILGUN_SENDER_EMAIL = 'no-reply@example.com'
  })

  it('GET returns health check ok', async () => {
    const request = new Request('http://localhost/api/admin/add-employee')
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.method).toBe('GET')
    expect(payload.route).toBe('add-employee')
  })

  it('POST returns 500 when required env vars are missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    process.env.SUPABASE_SERVICE_ROLE_KEY = ''

    const request = new Request('http://localhost/api/admin/add-employee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    })
    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toContain('Missing required environment variables')
  })

  it('POST returns 401 when user is not authenticated', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'no auth' } })

    const request = new Request('http://localhost/api/admin/add-employee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    })
    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload.error).toContain('Unauthorized')
    expect(mocks.adminFrom).not.toHaveBeenCalled()
  })

  it('POST returns 403 when employee profile is not found', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'admin@example.com' } },
      error: null,
    })

    const maybeSingle = vi.fn(async () => ({ data: null, error: null }))
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    mocks.adminFrom.mockImplementation(() => ({ select }))

    const request = new Request('http://localhost/api/admin/add-employee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@example.com' }),
    })
    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error).toContain('employee profile not found')
  })

  afterAll(() => {
    process.env = originalEnv
  })
})
