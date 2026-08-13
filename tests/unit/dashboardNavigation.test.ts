import { describe, expect, it } from 'vitest'
import { getDashboardParentNavigation } from '@/lib/navigation/dashboardNavigation'

describe('dashboard parent navigation', () => {
  it.each([
    '/dashboard/account',
    '/dashboard/accounting',
    '/dashboard/applications',
    '/dashboard/bookings',
    '/dashboard/commissions',
    '/dashboard/frappe-transfer',
    '/dashboard/lms',
    '/dashboard/packages',
    '/dashboard/pricing',
    '/dashboard/settings',
    '/dashboard/ticketing',
    '/dashboard/timeclock',
    '/dashboard/training',
  ])('returns top-level portal page %s to the dashboard', (pathname) => {
    expect(getDashboardParentNavigation(pathname)).toEqual({
      href: '/dashboard',
      label: 'Dashboard',
    })
  })

  it.each([
    ['/dashboard/applications/passports', '/dashboard/applications', 'Applications'],
    ['/dashboard/applications/passports-gb', '/dashboard/applications', 'Applications'],
    ['/dashboard/applications/nadra', '/dashboard/applications', 'Applications'],
    ['/dashboard/applications/visa', '/dashboard/applications', 'Applications'],
    [
      '/dashboard/applications/passports/documents/app-1',
      '/dashboard/applications/passports',
      'Pakistani Passports',
    ],
    [
      '/dashboard/applications/passports/drafts/PKD-ABCDE12345/documents',
      '/dashboard/applications/passports/drafts',
      'Passport Drafts',
    ],
    [
      '/dashboard/applications/nadra/documents/family-1',
      '/dashboard/applications/nadra',
      'NADRA Services',
    ],
    ['/dashboard/accounting/applications', '/dashboard/accounting', 'Accounting'],
    ['/dashboard/lms/statement/account-1', '/dashboard/lms', 'Accounts'],
    ['/dashboard/packages/quotations/new', '/dashboard/packages', 'Packages'],
    ['/dashboard/packages/quotations/quote-1/edit', '/dashboard/packages', 'Packages'],
    ['/dashboard/packages/groups/group-1', '/dashboard/packages', 'Packages'],
    ['/dashboard/packages/package-1', '/dashboard/packages', 'Packages'],
    ['/dashboard/packages/migration', '/dashboard/packages', 'Packages'],
    [
      '/dashboard/applications/passports/drafts',
      '/dashboard/applications/passports',
      'Pakistani Passports',
    ],
    ['/dashboard/timeclock/history', '/dashboard/timeclock', 'Timeclock'],
    ['/dashboard/timeclock/manual-entry', '/dashboard/timeclock', 'Timeclock'],
    ['/dashboard/timeclock/team', '/dashboard/timeclock', 'Timeclock'],
    ['/dashboard/ticketing/refund-calculator', '/dashboard/ticketing', 'Ticketing'],
    ['/dashboard/ticketing/ledger', '/dashboard/ticketing', 'Ticketing'],
  ])('maps %s to its stable parent directory', (pathname, href, label) => {
    expect(getDashboardParentNavigation(pathname)).toEqual({ href, label })
  })

  it('does not render parent navigation on or outside the dashboard root', () => {
    expect(getDashboardParentNavigation('/dashboard')).toBeNull()
    expect(getDashboardParentNavigation('/login')).toBeNull()
  })

  it('ignores query strings and trailing slashes', () => {
    expect(getDashboardParentNavigation('/dashboard/applications/passports/?tab=open')).toEqual({
      href: '/dashboard/applications',
      label: 'Applications',
    })
  })
})
