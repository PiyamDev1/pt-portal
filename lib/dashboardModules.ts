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
  allowedRoles?: string[]
  iconKey:
    | 'badge-pound'
    | 'briefcase'
    | 'calendar'
    | 'clock'
    | 'file-text'
    | 'fingerprint'
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
    iconKey: 'clock',
  },
  {
    id: 'hrms-transfer',
    title: 'HRMS',
    desc: 'Open Frappe HR through IMS handoff',
    href: '/dashboard/frappe-transfer',
    group: 'staff',
    accent: 'from-emerald-700 to-teal-600 text-white',
    iconKey: 'heart',
  },
  {
    id: 'applications',
    title: 'Applications Hub',
    desc: 'NADRA, passports, visas and document work',
    href: '/dashboard/applications',
    group: 'operations',
    accent: 'from-[#8b1e2d] to-[#c43b42] text-white',
    iconKey: 'file-text',
  },
  {
    id: 'bookings',
    title: 'Bookings',
    desc: 'Appointments, waitlist and no-show handling',
    href: '/dashboard/bookings',
    group: 'operations',
    accent: 'from-[#6f1422] to-[#a32234] text-white',
    iconKey: 'calendar',
  },
  {
    id: 'ticketing',
    title: 'Ticketing',
    desc: 'PNR work, fares and ticket operations',
    href: '/dashboard/ticketing',
    group: 'operations',
    accent: 'from-[#991b1b] to-[#dc2626] text-white',
    iconKey: 'plane',
  },
  {
    id: 'gb-passport',
    title: 'GB Passport',
    desc: 'British passport services',
    href: '/dashboard/applications/passports-gb',
    group: 'operations',
    accent: 'from-[#4b5563] to-[#111827] text-white',
    iconKey: 'briefcase',
  },
  {
    id: 'lms',
    title: 'LMS',
    desc: 'Customer balances and instalments',
    href: '/dashboard/lms',
    group: 'finance',
    accent: 'from-[#f3f4f6] to-[#d1d5db] text-slate-950',
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
    iconKey: 'settings',
  },
  {
    id: 'account',
    title: 'My Account',
    desc: 'Passkeys, devices and recovery settings',
    href: '/dashboard/account',
    group: 'staff',
    accent: 'from-[#4b0f16] to-[#8b1e2d] text-white',
    iconKey: 'fingerprint',
  },
]
