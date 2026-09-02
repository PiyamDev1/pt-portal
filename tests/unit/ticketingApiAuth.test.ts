import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireStaffSession: vi.fn(),
}))

vi.mock('@/lib/auth/staffSession', () => ({
  requireStaffSession: mocks.requireStaffSession,
}))

import {
  hasTicketingDepartment,
  canManageTicketingRecords,
  isTicketingOversightRole,
  requireTicketingAccess,
  resolveTicketingAccessScope,
} from '@/lib/ticketing/apiAuth'

const staffSession = (role: string, departments: string[] = []) => ({
  authorized: true as const,
  user: { id: 'staff-1', email: 'staff@example.com' },
  employee: {
    id: 'staff-1',
    email: 'staff@example.com',
    fullName: 'Staff Member',
    role,
    departments,
  },
})

describe('Ticketing access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes oversight and record-maintenance roles', () => {
    expect(isTicketingOversightRole('master_admin')).toBe(true)
    expect(isTicketingOversightRole(' Manager ')).toBe(true)
    expect(isTicketingOversightRole('Maintenance Admin')).toBe(true)
    expect(canManageTicketingRecords('maintenance_admin')).toBe(true)
    expect(canManageTicketingRecords('Manager')).toBe(false)
  })

  it('recognizes Ticketing department membership case-insensitively', () => {
    expect(hasTicketingDepartment(['Applications', 'ticketing'])).toBe(true)
    expect(hasTicketingDepartment(['Applications'])).toBe(false)
  })

  it('gives oversight roles team scope and department members own scope', () => {
    expect(resolveTicketingAccessScope('Manager', [])).toBe('team')
    expect(resolveTicketingAccessScope('Employee', ['Ticketing'])).toBe('own')
    expect(resolveTicketingAccessScope('Maintenance Admin', [])).toBe('team')
    expect(resolveTicketingAccessScope('Maintenance Admin', ['Ticketing'])).toBe('team')
  })

  it('loads departments and returns own scope for a Ticketing agent', async () => {
    mocks.requireStaffSession.mockResolvedValue(staffSession('Employee', ['Ticketing']))

    const result = await requireTicketingAccess()

    expect(mocks.requireStaffSession).toHaveBeenCalledWith({ includeDepartments: true })
    expect(result).toEqual({ ...staffSession('Employee', ['Ticketing']), scope: 'own' })
  })

  it('returns team scope for an oversight role without department membership', async () => {
    mocks.requireStaffSession.mockResolvedValue(staffSession('Admin'))

    const result = await requireTicketingAccess()

    expect(result).toEqual({ ...staffSession('Admin'), scope: 'team' })
  })

  it('rejects staff without Ticketing membership or oversight', async () => {
    mocks.requireStaffSession.mockResolvedValue(staffSession('Employee', ['Applications']))

    const result = await requireTicketingAccess()

    expect(result.authorized).toBe(false)
    if (!result.authorized) expect(result.response.status).toBe(403)
  })

  it('passes through staff-session failures', async () => {
    const denied = {
      authorized: false as const,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    }
    mocks.requireStaffSession.mockResolvedValue(denied)

    const result = await requireTicketingAccess()

    expect(result).toBe(denied)
  })
})
