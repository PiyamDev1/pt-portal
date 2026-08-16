import { DASHBOARD_MODULES, type DashboardModule } from '@/lib/dashboardModules'

export const MOBILE_NAVIGATION_METADATA_KEY = 'mobile_nav_shortcuts'
export const MOBILE_NAVIGATION_UPDATED_EVENT = 'pt-mobile-navigation-updated'
export const DEFAULT_MOBILE_NAV_SHORTCUT_IDS = ['applications', 'bookings', 'timeclock'] as const

const FIXED_MOBILE_NAV_IDS = new Set(['account', 'settings'])

const MOBILE_LABELS: Record<string, string> = {
  applications: 'Apps',
  'gb-passport': 'GB Passports',
  'hrms-transfer': 'HRMS',
  timeclock: 'Clock',
}

export function getMobileNavigationLabel(moduleItem: DashboardModule) {
  return MOBILE_LABELS[moduleItem.id] || moduleItem.title
}

export function getMobileShortcutOptions(userRole?: string | null) {
  const normalizedRole = userRole?.trim().toLowerCase()

  return DASHBOARD_MODULES.filter((moduleItem) => {
    if (FIXED_MOBILE_NAV_IDS.has(moduleItem.id)) return false
    if (!moduleItem.allowedRoles) return true
    return moduleItem.allowedRoles.some((role) => role.toLowerCase() === normalizedRole)
  })
}

export function resolveMobileShortcutIds(
  storedValue: unknown,
  availableModules: DashboardModule[] = getMobileShortcutOptions(),
) {
  const allowedIds = new Set(availableModules.map((moduleItem) => moduleItem.id))
  const requested = Array.isArray(storedValue)
    ? storedValue.filter((value): value is string => typeof value === 'string')
    : []
  const orderedIds = [
    ...requested,
    ...DEFAULT_MOBILE_NAV_SHORTCUT_IDS,
    ...availableModules.map((moduleItem) => moduleItem.id),
  ]
  const resolved: string[] = []

  for (const id of orderedIds) {
    if (!allowedIds.has(id) || resolved.includes(id)) continue
    resolved.push(id)
    if (resolved.length === 3) break
  }

  return resolved
}

export function resolveMobileShortcutModules(
  storedValue: unknown,
  availableModules: DashboardModule[] = getMobileShortcutOptions(),
) {
  const modulesById = new Map(availableModules.map((moduleItem) => [moduleItem.id, moduleItem]))
  return resolveMobileShortcutIds(storedValue, availableModules)
    .map((id) => modulesById.get(id))
    .filter((moduleItem): moduleItem is DashboardModule => Boolean(moduleItem))
}
