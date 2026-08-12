import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireAdminSession = vi.fn()
  const enforceRateLimit = vi.fn()
  const getClientIp = vi.fn(() => '203.0.113.5')
  const roleMaybeSingle = vi.fn()
  const locationMaybeSingle = vi.fn()
  const departmentsIn = vi.fn()
  const employeeInsert = vi.fn()
  const passwordHistoryInsert = vi.fn()
  const departmentInsert = vi.fn()
  const cleanupEq = vi.fn()
  const createUser = vi.fn()
  const deleteUser = vi.fn()
  const updateUserById = vi.fn()
  const messagesCreate = vi.fn()
  const mailgunClient = vi.fn(() => ({ messages: { create: messagesCreate } }))
  const Mailgun = vi.fn(function MockMailgun() {
    return { client: mailgunClient }
  })
  const hash = vi.fn()
  const logServerEvent = vi.fn()
  const reportOperationalError = vi.fn()

  const from = vi.fn((table: string) => {
    const deleteQuery = {
      delete: () => ({
        eq: (column: string, value: string) => cleanupEq(table, column, value),
      }),
    }

    if (table === 'roles') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: roleMaybeSingle }) }),
        ...deleteQuery,
      }
    }
    if (table === 'departments') {
      return {
        select: () => ({ in: departmentsIn }),
        ...deleteQuery,
      }
    }
    if (table === 'locations') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: locationMaybeSingle }) }),
        ...deleteQuery,
      }
    }
    if (table === 'employees') return { insert: employeeInsert, ...deleteQuery }
    if (table === 'password_history') return { insert: passwordHistoryInsert, ...deleteQuery }
    if (table === 'employee_departments') return { insert: departmentInsert, ...deleteQuery }
    return deleteQuery
  })

  const admin = {
    from,
    auth: { admin: { createUser, deleteUser, updateUserById } },
  }
  const getServiceSupabaseClient = vi.fn(() => admin)

  return {
    requireAdminSession,
    enforceRateLimit,
    getClientIp,
    roleMaybeSingle,
    locationMaybeSingle,
    departmentsIn,
    employeeInsert,
    passwordHistoryInsert,
    departmentInsert,
    cleanupEq,
    createUser,
    deleteUser,
    updateUserById,
    messagesCreate,
    mailgunClient,
    Mailgun,
    hash,
    logServerEvent,
    reportOperationalError,
    from,
    admin,
    getServiceSupabaseClient,
  }
})

vi.mock('@/lib/adminSessionAuth', () => ({
  requireAdminSession: mocks.requireAdminSession,
}))

vi.mock('@/lib/security/rateLimit', () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  getClientIp: mocks.getClientIp,
}))

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

vi.mock('@/lib/security/secureRandom.server', () => ({
  generateTemporaryPassword: () => 'SecureTemporaryPasswordAa1!',
}))

vi.mock('@/lib/observability/server', () => ({
  logServerEvent: mocks.logServerEvent,
  reportOperationalError: mocks.reportOperationalError,
}))

vi.mock('mailgun.js', () => ({ default: mocks.Mailgun }))

vi.mock('bcryptjs', () => ({
  default: { hash: mocks.hash },
}))

import { GET, OPTIONS, POST } from '@/app/api/admin/add-employee/route'

const ROLE_ID = 'a8b59d29-0d67-4cb7-a356-82c21534e5ff'
const DEPARTMENT_ID = 'bcff4acf-f1d5-4a01-8dc5-c3720b439c9e'
const SECOND_DEPARTMENT_ID = 'dd2f44bf-8191-4161-a85a-82660244be13'
const LOCATION_ID = 'd5a1ec5b-65b5-490c-82d6-5fa8473b4cda'
const CREATED_USER_ID = 'f0f18ca7-9b4f-42ad-a26a-20f7680a2f21'

const validBody = {
  email: 'New.User@Example.COM',
  firstName: 'Jane',
  lastName: 'Doe',
  role_id: ROLE_ID,
  department_ids: [DEPARTMENT_ID],
  location_id: LOCATION_ID,
}

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/admin/add-employee', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://portal.example.com',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe('/api/admin/add-employee route', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    process.env.MAILGUN_API_KEY = 'mg-key'
    process.env.MAILGUN_DOMAIN = 'mg.example.com'
    process.env.MAILGUN_SENDER_EMAIL = 'no-reply@example.com'

    mocks.requireAdminSession.mockResolvedValue({
      authorized: true,
      user: { id: '550e8400-e29b-41d4-a716-446655440000', email: 'admin@example.com' },
      employee: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'admin@example.com',
        fullName: 'Admin User',
        role: 'Master Admin',
        departments: [],
      },
    })
    mocks.enforceRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 19,
      retryAfterSeconds: 0,
    })
    mocks.roleMaybeSingle.mockResolvedValue({
      data: { id: ROLE_ID, name: 'Employee' },
      error: null,
    })
    mocks.departmentsIn.mockImplementation(async (_column: string, ids: string[]) => ({
      data: ids.map((id) => ({ id })),
      error: null,
    }))
    mocks.locationMaybeSingle.mockResolvedValue({
      data: { id: LOCATION_ID, name: 'London <HQ>', branch_code: 'LON' },
      error: null,
    })
    mocks.createUser.mockResolvedValue({
      data: { user: { id: CREATED_USER_ID } },
      error: null,
    })
    mocks.employeeInsert.mockResolvedValue({ error: null })
    mocks.hash.mockResolvedValue('hashed-temporary-password')
    mocks.passwordHistoryInsert.mockResolvedValue({ error: null })
    mocks.departmentInsert.mockResolvedValue({ error: null })
    mocks.messagesCreate.mockResolvedValue({ id: 'message-1' })
    mocks.deleteUser.mockResolvedValue({ error: null })
    mocks.updateUserById.mockResolvedValue({ error: null })
    mocks.cleanupEq.mockResolvedValue({ error: null })
    mocks.reportOperationalError.mockResolvedValue('request-id')
  })

  it('preserves GET and OPTIONS health/CORS contracts', async () => {
    const getResponse = await GET(
      new Request('http://localhost/api/admin/add-employee', {
        headers: { Origin: 'https://portal.example.com' },
      }),
    )
    const optionsResponse = await OPTIONS(
      new Request('http://localhost/api/admin/add-employee', {
        method: 'OPTIONS',
        headers: { Origin: 'https://portal.example.com' },
      }),
    )

    await expect(getResponse.json()).resolves.toMatchObject({
      method: 'GET',
      route: 'add-employee',
    })
    expect(getResponse.status).toBe(200)
    expect(getResponse.headers.get('access-control-allow-origin')).toBe(
      'https://portal.example.com',
    )
    await expect(optionsResponse.json()).resolves.toMatchObject({ method: 'OPTIONS' })
    expect(optionsResponse.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS')
  })

  it('uses the canonical admin session guard and keeps CORS on authorization errors', async () => {
    mocks.requireAdminSession.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await POST(postRequest({}))

    expect(response.status).toBe(401)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://portal.example.com')
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('applies a shared user/IP limiter before parsing or provisioning', async () => {
    mocks.enforceRateLimit.mockResolvedValue({
      allowed: false,
      response: Response.json({ error: 'Too many requests' }, { status: 429 }),
      remaining: 0,
      retryAfterSeconds: 60,
    })

    const response = await POST(postRequest(validBody))

    expect(response.status).toBe(429)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://portal.example.com')
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        scope: 'admin.add-employee',
        identities: ['user:550e8400-e29b-41d4-a716-446655440000', 'ip:203.0.113.5'],
      }),
    )
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('rejects invalid and oversized input before creating an auth user', async () => {
    const invalidResponse = await POST(
      postRequest({ ...validBody, role_id: 'not-a-uuid', unexpected: true }),
    )
    const oversizedResponse = await POST(postRequest(validBody, { 'Content-Length': '20000' }))

    expect(invalidResponse.status).toBe(400)
    expect((await invalidResponse.json()).error).toMatch(/Invalid Role ID|Unrecognized key/)
    expect(oversizedResponse.status).toBe(400)
    expect((await oversizedResponse.json()).error).toBe('Request body is too large')
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it('requires every selected department to exist', async () => {
    mocks.departmentsIn.mockResolvedValue({
      data: [{ id: DEPARTMENT_ID }],
      error: null,
    })

    const response = await POST(
      postRequest({ ...validBody, department_ids: [DEPARTMENT_ID, SECOND_DEPARTMENT_ID] }),
    )

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('One or more departments are invalid.')
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it('prevents a regular Admin from assigning a Master Admin role', async () => {
    const access = await mocks.requireAdminSession()
    mocks.requireAdminSession.mockResolvedValue({
      ...access,
      employee: { ...access.employee, role: 'Admin' },
    })
    mocks.roleMaybeSingle.mockResolvedValue({
      data: { id: ROLE_ID, name: 'Master Admin' },
      error: null,
    })

    const response = await POST(postRequest(validBody))

    expect(response.status).toBe(403)
    expect((await response.json()).error).toBe('Only a Master Admin can assign this role.')
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it('normalizes identity fields, validates references, and preserves the success contract', async () => {
    const response = await POST(
      postRequest({
        ...validBody,
        email: '  New.User@Example.COM  ',
        firstName: '  <Jane>  ',
        lastName: '  Doe  ',
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://portal.example.com')
    expect(payload).toEqual({ createdUserId: CREATED_USER_ID, message: 'User created' })
    expect(mocks.createUser).toHaveBeenCalledWith({
      email: 'new.user@example.com',
      password: 'SecureTemporaryPasswordAa1!',
      email_confirm: true,
      user_metadata: { first_name: '<Jane>', last_name: 'Doe' },
    })
    expect(mocks.employeeInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: CREATED_USER_ID,
        email: 'new.user@example.com',
        full_name: '<Jane> Doe',
        role_id: ROLE_ID,
        location_id: LOCATION_ID,
      }),
    )
    expect(mocks.departmentInsert).toHaveBeenCalledWith([
      { employee_id: CREATED_USER_ID, department_id: DEPARTMENT_ID },
    ])
    expect(mocks.messagesCreate).toHaveBeenCalledWith(
      'mg.example.com',
      expect.objectContaining({
        to: 'new.user@example.com',
        html: expect.stringContaining('&lt;Jane&gt;'),
      }),
    )
    const mail = mocks.messagesCreate.mock.calls[0][1]
    expect(mail.html).toContain('London &lt;HQ&gt;')
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it.each([
    ['profile', () => mocks.employeeInsert.mockResolvedValue({ error: { code: 'profile' } })],
    [
      'history',
      () => mocks.passwordHistoryInsert.mockResolvedValue({ error: { code: 'history' } }),
    ],
    ['departments', () => mocks.departmentInsert.mockResolvedValue({ error: { code: 'dept' } })],
    ['email', () => mocks.messagesCreate.mockRejectedValue(new Error('mail failure'))],
  ])('rolls the auth user back when the %s stage fails', async (_stage, arrangeFailure) => {
    arrangeFailure()

    const response = await POST(postRequest(validBody))

    expect(response.status).toBeGreaterThanOrEqual(500)
    expect(mocks.deleteUser).toHaveBeenCalledWith(CREATED_USER_ID)
    expect(mocks.logServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'admin.employee_onboarding_rolled_back',
        context: expect.objectContaining({ createdUserId: CREATED_USER_ID, stage: _stage }),
      }),
    )
  })

  it('bans and explicitly cleans a partially created identity when direct deletion fails', async () => {
    mocks.employeeInsert.mockResolvedValue({ error: { code: 'profile' } })
    mocks.deleteUser.mockResolvedValue({ error: { code: 'delete-failed' } })

    const response = await POST(postRequest(validBody))

    expect(response.status).toBe(500)
    expect(mocks.updateUserById).toHaveBeenCalledWith(CREATED_USER_ID, {
      ban_duration: '876000h',
      user_metadata: { onboarding_failed: true },
    })
    expect(mocks.cleanupEq).toHaveBeenCalledTimes(3)
    expect(mocks.deleteUser).toHaveBeenCalledTimes(2)
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'admin.employee_onboarding_rollback_incomplete',
        alert: true,
        context: expect.objectContaining({
          createdUserId: CREATED_USER_ID,
          rollbackContained: true,
          rollbackComplete: false,
        }),
      }),
    )
    const logged = JSON.stringify(mocks.reportOperationalError.mock.calls)
    expect(logged).not.toContain('SecureTemporaryPasswordAa1!')
    expect(logged).not.toContain('new.user@example.com')
  })

  it('checks configuration only after authentication and bounded validation', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = ''
    process.env.MAILGUN_API_KEY = ''

    const response = await POST(postRequest(validBody))

    expect(response.status).toBe(500)
    expect((await response.json()).error).toContain('Missing required environment variables')
    expect(mocks.requireAdminSession).toHaveBeenCalledOnce()
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  afterAll(() => {
    process.env = originalEnv
  })
})
