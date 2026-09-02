import { describe, expect, it } from 'vitest'
import {
  getMobileShortcutOptions,
  resolveMobileShortcutIds,
  resolveMobileShortcutModules,
} from '@/lib/mobileNavigation'

describe('mobile navigation preferences', () => {
  it('uses the stable default order around the fixed Home button', () => {
    expect(resolveMobileShortcutIds(undefined)).toEqual(['applications', 'bookings', 'timeclock'])
  })

  it('preserves valid unique choices and repairs stale or duplicate metadata', () => {
    expect(
      resolveMobileShortcutIds(['packages', 'packages', 'missing-module', 'training']),
    ).toEqual(['packages', 'training', 'applications'])
  })

  it('never exposes fixed account or settings destinations as configurable shortcuts', () => {
    const resolved = resolveMobileShortcutModules(['settings', 'account', 'ticketing'])
    expect(resolved.map((moduleItem) => moduleItem.id)).toEqual([
      'ticketing',
      'applications',
      'bookings',
    ])
  })

  it('limits role-scoped options to the signed-in employee role', () => {
    const employeeIds = getMobileShortcutOptions('Employee').map((moduleItem) => moduleItem.id)
    const adminIds = getMobileShortcutOptions('Master Admin').map((moduleItem) => moduleItem.id)
    const accountingIds = getMobileShortcutOptions('Employee', ['Accounting']).map(
      (moduleItem) => moduleItem.id,
    )

    expect(employeeIds).not.toContain('pricing')
    expect(employeeIds).not.toContain('commissions')
    expect(employeeIds).not.toContain('accounting')
    expect(employeeIds).toContain('my-commissions')
    expect(adminIds).toContain('pricing')
    expect(adminIds).toContain('commissions')
    expect(adminIds).toContain('accounting')
    expect(adminIds).toContain('my-commissions')
    expect(accountingIds).toContain('accounting')
    expect(accountingIds).not.toContain('commissions')
  })

  it('keeps the stored My commissions ID while opening the renamed performance module', () => {
    const [moduleItem] = resolveMobileShortcutModules(['my-commissions'])

    expect(moduleItem).toMatchObject({
      id: 'my-commissions',
      title: 'My performance',
      href: '/dashboard/my-performance',
    })
  })
})
