import { describe, expect, it, vi } from 'vitest'
import {
  extractDepartmentNames,
  loadEmployeeDepartmentNames,
} from '@/lib/auth/departmentMemberships'

describe('department membership adapter', () => {
  it('normalizes object and array relations while ignoring missing names', () => {
    expect(
      extractDepartmentNames([
        { departments: { name: 'Applications' } },
        { departments: [{ name: 'POS' }] },
        { departments: null },
        { departments: { name: null } },
      ]),
    ).toEqual(['Applications', 'POS'])
  })

  it('loads names through the caller-provided client and preserves query errors', async () => {
    const queryError = { message: 'membership lookup failed' }
    const eq = vi.fn().mockResolvedValue({
      data: [{ departments: { name: 'Ticketing' } }],
      error: queryError,
    })
    const select = vi.fn(() => ({ eq }))
    const supabase = { from: vi.fn(() => ({ select })) }

    await expect(loadEmployeeDepartmentNames(supabase as never, 'employee-1')).resolves.toEqual({
      departmentNames: ['Ticketing'],
      error: queryError,
    })
    expect(supabase.from).toHaveBeenCalledWith('employee_departments')
    expect(select).toHaveBeenCalledWith('departments(name)')
    expect(eq).toHaveBeenCalledWith('employee_id', 'employee-1')
  })
})
