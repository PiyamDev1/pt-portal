import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRouteSupabaseClient: vi.fn(),
  requireStaffSession: vi.fn(),
}))

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))
vi.mock('@/lib/auth/staffSession', () => ({
  ADMIN_ROLES: ['Admin', 'Master Admin', 'Super Admin'],
  requireStaffSession: mocks.requireStaffSession,
}))

import { requireAccountingAccess } from '@/lib/accounting/access'

function staff(role: string, departments: string[]) {
  return {
    authorized: true,
    user: { id: '10000000-0000-4000-8000-000000000001', email: 'staff@example.com' },
    employee: {
      id: '10000000-0000-4000-8000-000000000001',
      email: 'staff@example.com',
      fullName: 'Staff Member',
      role,
      departments,
    },
  }
}

describe('requireAccountingAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRouteSupabaseClient.mockResolvedValue({ rpc: vi.fn() })
  })

  it.each(['Accounting', 'accounts', '  ACCOUNTING  '])(
    'allows canonical employee_departments membership %s',
    async (department) => {
      mocks.requireStaffSession.mockResolvedValue(staff('Agent', [department]))

      const result = await requireAccountingAccess()

      expect(result.authorized).toBe(true)
      expect(mocks.requireStaffSession).toHaveBeenCalledWith({ includeDepartments: true })
      expect(mocks.getRouteSupabaseClient).toHaveBeenCalledOnce()
    },
  )

  it.each(['Admin', 'Master Admin', 'Super_Admin'])(
    'allows portal administrator role %s without Accounting membership',
    async (role) => {
      mocks.requireStaffSession.mockResolvedValue(staff(role, ['Sales']))

      expect((await requireAccountingAccess()).authorized).toBe(true)
    },
  )

  it('denies unrelated staff and does not create an Accounting RPC client', async () => {
    mocks.requireStaffSession.mockResolvedValue(staff('Agent', ['Ticketing']))

    const result = await requireAccountingAccess()

    expect(result.authorized).toBe(false)
    if (result.authorized) throw new Error('Expected access to be denied')
    expect(result.response.status).toBe(403)
    expect(result.response.headers.get('cache-control')).toBe('private, no-store, max-age=0')
    expect(mocks.getRouteSupabaseClient).not.toHaveBeenCalled()
  })

  it('passes through authentication failures with private no-store caching', async () => {
    mocks.requireStaffSession.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const result = await requireAccountingAccess()

    expect(result.authorized).toBe(false)
    if (result.authorized) throw new Error('Expected access to be denied')
    expect(result.response.status).toBe(401)
    expect(result.response.headers.get('cache-control')).toBe('private, no-store, max-age=0')
  })
})
