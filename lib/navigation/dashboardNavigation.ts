export type DashboardParentNavigation = {
  href: string
  label: string
}

type ParentRule = {
  pattern: RegExp
  parent: DashboardParentNavigation
}

const PARENT_RULES: ParentRule[] = [
  {
    pattern: /^\/dashboard\/applications\/nadra\/documents\/[^/]+$/,
    parent: { href: '/dashboard/applications/nadra', label: 'NADRA Services' },
  },
  {
    pattern: /^\/dashboard\/applications\/passports\/drafts\/[^/]+\/documents$/,
    parent: {
      href: '/dashboard/applications/passports/drafts',
      label: 'Passport Drafts',
    },
  },
  {
    pattern: /^\/dashboard\/applications\/passports\/documents\/[^/]+$/,
    parent: {
      href: '/dashboard/applications/passports',
      label: 'Pakistani Passports',
    },
  },
  {
    pattern: /^\/dashboard\/packages\/groups\/[^/]+$/,
    parent: { href: '/dashboard/packages', label: 'Packages' },
  },
  {
    pattern: /^\/dashboard\/packages\/quotations\/(?:new|[^/]+\/(?:edit|sales))$/,
    parent: { href: '/dashboard/packages', label: 'Packages' },
  },
  {
    pattern: /^\/dashboard\/lms\/statement\/[^/]+$/,
    parent: { href: '/dashboard/lms', label: 'Accounts' },
  },
]

const DIRECTORY_LABELS: Record<string, string> = {
  account: 'Dashboard',
  accounting: 'Accounting',
  applications: 'Applications',
  bookings: 'Bookings',
  dashboard: 'Dashboard',
  lms: 'Accounts',
  nadra: 'NADRA Services',
  packages: 'Packages',
  passports: 'Pakistani Passports',
  'passports-gb': 'GB Passports',
  timeclock: 'Timeclock',
}

function normalizeDashboardPath(pathname: string) {
  const path = String(pathname || '')
    .split(/[?#]/, 1)[0]
    .replace(/\/+$/, '')
  return path || '/'
}

function labelForDirectory(pathname: string) {
  const directory = pathname.split('/').filter(Boolean).at(-1) || 'dashboard'
  return (
    DIRECTORY_LABELS[directory] ||
    directory
      .split('-')
      .filter(Boolean)
      .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
      .join(' ')
  )
}

/**
 * Return the portal page that owns the current route.
 *
 * This deliberately follows the route hierarchy instead of browser history,
 * so a user always returns to the stable directory page even after opening a
 * deep link, refreshing, or arriving from a notification.
 */
export function getDashboardParentNavigation(pathname: string): DashboardParentNavigation | null {
  const normalizedPath = normalizeDashboardPath(pathname)
  if (normalizedPath === '/dashboard' || !normalizedPath.startsWith('/dashboard/')) {
    return null
  }

  const explicitRule = PARENT_RULES.find(({ pattern }) => pattern.test(normalizedPath))
  if (explicitRule) return explicitRule.parent

  const segments = normalizedPath.split('/').filter(Boolean)
  const parentPath =
    segments.length <= 2 ? '/dashboard' : `/${segments.slice(0, segments.length - 1).join('/')}`

  return {
    href: parentPath,
    label: labelForDirectory(parentPath),
  }
}
