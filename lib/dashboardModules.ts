/**
 * Dashboard module catalogue.
 *
 * This file is intentionally serialisable: client and server components both import it,
 * and module preferences are stored against the stable `id` values in Supabase.
 */
export type DashboardModuleGroup = 'staff' | 'operations' | 'finance' | 'admin'

export type DashboardModule = {
  id: string
  title: string
  desc: string
  href: string
  group: DashboardModuleGroup
  accent: string
  iconTone: string
  tileTone: string
  allowedRoles?: string[]
  iconKey:
    | 'badge-pound'
    | 'briefcase'
    | 'calendar'
    | 'clock'
    | 'file-text'
    | 'fingerprint'
    | 'graduation'
    | 'heart'
    | 'plane'
    | 'settings'
    | 'ticket'
}

export const DASHBOARD_GROUP_LABELS: Record<DashboardModuleGroup, string> = {
  staff: 'Staff essentials',
  operations: 'Operations',
  finance: 'Finance',
  admin: 'Admin',
}

export const DASHBOARD_GROUP_ORDER: DashboardModuleGroup[] = [
  'staff',
  'operations',
  'finance',
  'admin',
]

export const DASHBOARD_MODULES: DashboardModule[] = [
  {
    id: 'timeclock',
    title: 'Timeclock',
    desc: 'Clock in, clock out, review punches',
    href: '/dashboard/timeclock',
    group: 'staff',
    accent: 'from-[#3a3a3a] to-black text-white',
    iconTone: 'from-[#2b2b2b] via-[#111827] to-black text-white shadow-black/25',
    tileTone: 'from-white via-slate-50 to-slate-200',
    iconKey: 'clock',
  },
  {
    id: 'hrms-transfer',
    title: 'HRMS',
    desc: 'Open Frappe HR through IMS handoff',
    href: '/dashboard/frappe-transfer',
    group: 'staff',
    accent: 'from-emerald-700 to-teal-600 text-white',
    iconTone: 'from-emerald-500 via-emerald-700 to-teal-800 text-white shadow-emerald-900/25',
    tileTone: 'from-emerald-50 via-white to-teal-50',
    iconKey: 'heart',
  },
  {
    id: 'training',
    title: 'Training',
    desc: 'Courses, certificates and compliance refreshers',
    href: '/dashboard/training',
    group: 'staff',
    accent: 'from-[#7f1d1d] to-[#111827] text-white',
    iconTone: 'from-[#8b1e2d] via-[#c43b42] to-[#111827] text-white shadow-red-950/25',
    tileTone: 'from-red-50 via-white to-slate-100',
    iconKey: 'graduation',
  },
  {
    id: 'applications',
    title: 'Applications Hub',
    desc: 'NADRA, passports, visas and document work',
    href: '/dashboard/applications',
    group: 'operations',
    accent: 'from-[#8b1e2d] to-[#c43b42] text-white',
    iconTone: 'from-[#8b1e2d] via-[#b91c1c] to-[#ef4444] text-white shadow-red-900/25',
    tileTone: 'from-red-50 via-white to-rose-100',
    iconKey: 'file-text',
  },
  {
    id: 'bookings',
    title: 'Bookings',
    desc: 'Appointments, waitlist and no-show handling',
    href: '/dashboard/bookings',
    group: 'operations',
    accent: 'from-[#6f1422] to-[#a32234] text-white',
    iconTone: 'from-[#6f1422] via-[#a32234] to-[#dc2626] text-white shadow-red-950/25',
    tileTone: 'from-[#fff5f5] via-white to-[#fee2e2]',
    iconKey: 'calendar',
  },
  {
    id: 'ticketing',
    title: 'Ticketing',
    desc: 'PNR work, fares and ticket operations',
    href: '/dashboard/ticketing',
    group: 'operations',
    accent: 'from-[#991b1b] to-[#dc2626] text-white',
    iconTone: 'from-[#991b1b] via-[#dc2626] to-[#f97316] text-white shadow-orange-900/25',
    tileTone: 'from-orange-50 via-white to-red-100',
    iconKey: 'plane',
  },
  {
    id: 'packages',
    title: 'Packages',
    desc: 'Holidays, ziyarat and umrah quotes',
    href: '/dashboard/packages',
    group: 'operations',
    accent: 'from-[#4b0f16] to-[#8b1e2d] text-white',
    iconTone: 'from-[#4b0f16] via-[#8b1e2d] to-[#c43b42] text-white shadow-red-950/25',
    tileTone: 'from-rose-50 via-white to-slate-100',
    iconKey: 'plane',
  },
  {
    id: 'gb-passport',
    title: 'GB Passport',
    desc: 'British passport services',
    href: '/dashboard/applications/passports-gb',
    group: 'operations',
    accent: 'from-[#4b5563] to-[#111827] text-white',
    iconTone: 'from-[#4b5563] via-[#1f2937] to-[#111827] text-white shadow-slate-900/25',
    tileTone: 'from-slate-50 via-white to-slate-200',
    iconKey: 'briefcase',
  },
  {
    id: 'lms',
    title: 'LMS',
    desc: 'Customer balances and instalments',
    href: '/dashboard/lms',
    group: 'finance',
    accent: 'from-[#f3f4f6] to-[#d1d5db] text-slate-950',
    iconTone: 'from-[#f8fafc] via-[#e5e7eb] to-[#9ca3af] text-slate-950 shadow-slate-500/20',
    tileTone: 'from-white via-slate-50 to-zinc-200',
    iconKey: 'badge-pound',
  },
  {
    id: 'commissions',
    title: 'Commissions',
    desc: 'Sales earnings and staff commission view',
    href: '/dashboard/commissions',
    group: 'finance',
    allowedRoles: ['Admin', 'Master Admin', 'Manager'],
    accent: 'from-[#3a3a3a] to-[#1f2937] text-white',
    iconTone: 'from-[#3a3a3a] via-[#111827] to-black text-white shadow-black/25',
    tileTone: 'from-zinc-50 via-white to-zinc-200',
    iconKey: 'ticket',
  },
  {
    id: 'pricing',
    title: 'Pricing',
    desc: 'Service pricing and branch offers',
    href: '/dashboard/pricing',
    group: 'finance',
    allowedRoles: ['Admin', 'Master Admin'],
    accent: 'from-[#7f1d1d] to-[#b91c1c] text-white',
    iconTone: 'from-[#7f1d1d] via-[#b91c1c] to-[#ef4444] text-white shadow-red-900/25',
    tileTone: 'from-red-50 via-white to-stone-100',
    iconKey: 'badge-pound',
  },
  {
    id: 'settings',
    title: 'Settings',
    desc: 'Security, branches, staff and maintenance',
    href: '/dashboard/settings',
    group: 'admin',
    allowedRoles: ['Admin', 'Master Admin', 'Maintenance Admin'],
    accent: 'from-[#111827] to-[#3a3a3a] text-white',
    iconTone: 'from-[#111827] via-[#3a3a3a] to-[#6b7280] text-white shadow-slate-900/25',
    tileTone: 'from-slate-100 via-white to-neutral-200',
    iconKey: 'settings',
  },
  {
    id: 'account',
    title: 'My Account',
    desc: 'Passkeys, devices and recovery settings',
    href: '/dashboard/account',
    group: 'staff',
    accent: 'from-[#4b0f16] to-[#8b1e2d] text-white',
    iconTone: 'from-[#4b0f16] via-[#8b1e2d] to-[#c43b42] text-white shadow-red-950/25',
    tileTone: 'from-rose-50 via-white to-red-100',
    iconKey: 'fingerprint',
  },
]
