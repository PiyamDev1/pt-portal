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

export function resolvePerformanceView(value: string | string[] | undefined): PerformanceView {
  const candidate = Array.isArray(value) ? value[0] : value
  return PERFORMANCE_TABS.some((tab) => tab.id === candidate)
    ? (candidate as PerformanceView)
    : 'activity'
}
