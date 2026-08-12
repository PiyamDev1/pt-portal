import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const updateUserById = vi.fn()
  const from = vi.fn()
  const createClient = vi.fn(() => ({
    from,
    auth: { admin: { updateUserById } },
  }))

  const mailCreate = vi.fn()
  const mailClient = vi.fn(() => ({ messages: { create: mailCreate } }))
  const Mailgun = vi.fn(function MailgunMock() {
    return { client: mailClient }
  })

  const compare = vi.fn()
  const hash = vi.fn()

  return {
    from,
    createClient,
    updateUserById,
    Mailgun,
    mailCreate,
    compare,
    hash,
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

vi.mock('mailgun.js', () => ({
  default: mocks.Mailgun,
}))

vi.mock('bcryptjs', () => ({
  default: {
    compare: mocks.compare,
    hash: mocks.hash,
  },
}))

import { POST } from '@/app/api/admin/reset-password/route'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { enforceRateLimit } from '@/lib/security/rateLimit'

describe('POST /api/admin/reset-password', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    process.env.MAILGUN_API_KEY = 'mg-key'
    process.env.MAILGUN_DOMAIN = 'mg.example.com'
    process.env.MAILGUN_SENDER_EMAIL = 'no-reply@example.com'

    vi.mocked(requireStaffSession).mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1', email: 'admin@example.com' },
      employee: {
        id: 'admin-1',
        email: 'admin@example.com',
        fullName: 'Admin User',
        role: 'Admin',
        departments: [],
      },
    })
    vi.mocked(enforceRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 4,
      retryAfterSeconds: 0,
    })

    mocks.compare.mockResolvedValue(false)
    mocks.hash.mockResolvedValue('hashed-password')
    mocks.updateUserById.mockResolvedValue({ data: { id: 'emp-1' }, error: null })
    mocks.mailCreate.mockResolvedValue({ id: 'mail-1' })

    mocks.from.mockImplementation((table: string) => {
      if (table === 'employees') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { id: 'emp-1' }, error: null })),
            })),
          })),
          update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        }
      }

      if (table === 'password_history') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          })),
          insert: vi.fn(async () => ({ error: null })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              not: vi.fn(async () => ({ error: null })),
            })),
          })),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    })
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns unauthorized response when admin verification fails', async () => {
    vi.mocked(requireStaffSession).mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }) as never,
    })

    const response = await POST(
      new Request('http://localhost/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'staff@example.com' }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload).toEqual({ error: 'Forbidden' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('passes through a shared rate-limit response before reading the body', async () => {
    vi.mocked(enforceRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
      response: Response.json({ error: 'Too many requests' }, { status: 429 }) as never,
    })

    const response = await POST(
      new Request('http://localhost/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'staff@example.com' }),
      }),
    )

    expect(response.status).toBe(429)
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('rejects an invalid employee identifier before initializing privileged clients', async () => {
    const response = await POST(
      new Request('http://localhost/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: 'not-a-uuid' }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Invalid employee ID' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('returns 500 when required env vars are missing', async () => {
    process.env.MAILGUN_API_KEY = ''

    const response = await POST(
      new Request('http://localhost/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'staff@example.com' }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toContain('Missing required environment variables')
  })

  it('returns 400 when neither employee_id nor email is provided', async () => {
    const response = await POST(
      new Request('http://localhost/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'employee_id or email is required' })
  })

  it('returns semantic success payload when password reset email is sent', async () => {
    const response = await POST(
      new Request('http://localhost/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'staff@example.com' }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      resetUserId: 'emp-1',
      message: 'Password reset and emailed',
    })
  })
})
