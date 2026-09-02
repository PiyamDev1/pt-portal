export const PERFORMANCE_TABS = [
  {
    id: 'activity',
    label: 'Activity',
    href: '/dashboard/my-performance?view=activity',
  },
  {
    id: 'attendance',
    label: 'Attendance',
    href: '/dashboard/my-performance?view=attendance',
  },
  {
    id: 'earnings',
    label: 'Earnings & commission',
    href: '/dashboard/my-performance?view=earnings',
  },
] as const

export type PerformanceView = (typeof PERFORMANCE_TABS)[number]['id']

const PERFORMANCE_PERIOD_PATTERN = /^(\d{4})-(\d{2})$/

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function isCalendarMonth(value: string) {
  const match = PERFORMANCE_PERIOD_PATTERN.exec(value)
  if (!match) return false
  const month = Number(match[2])
  return month >= 1 && month <= 12
}

export function currentPerformancePeriod(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}`
}

export function resolvePerformancePeriod(value: string | string[] | undefined, now = new Date()) {
  const current = currentPerformancePeriod(now)
  const candidate = firstQueryValue(value)
  return candidate && isCalendarMonth(candidate) && candidate <= current ? candidate : current
}

export function performancePeriodHref(view: PerformanceView, period: string) {
  return `/dashboard/my-performance?view=${view}&period=${period}`
}

export function resolvePerformanceView(value: string | string[] | undefined): PerformanceView {
  const candidate = firstQueryValue(value)
  return PERFORMANCE_TABS.some((tab) => tab.id === candidate)
    ? (candidate as PerformanceView)
    : 'activity'
}
