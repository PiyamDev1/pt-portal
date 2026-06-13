/**
 * Dashboard Hub Page
 *
 * Server-rendered dashboard shell with two intentional layouts:
 * - Mobile: compact staff launcher with Timeclock and HRMS first.
 * - Desktop: wider operations command centre with grouped modules and context cards.
 *
 * The data remains server-side so users only see this page after a valid IMS session.
 * @module app/dashboard/page
 */

import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { ComponentType } from 'react'
import {
  BadgePoundSterling,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  FileText,
  FingerprintPattern,
  HeartPulse,
  LayoutDashboard,
  Plane,
  Settings,
  ShieldCheck,
  Sparkles,
  Ticket,
} from 'lucide-react'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from './client-wrapper'
import { BackupCodesReminder } from './lms/components/BackupCodesReminder'

type DashboardModule = {
  id: string
  title: string
  desc: string
  href: string
  group: 'staff' | 'operations' | 'finance' | 'admin'
  priority?: 'primary' | 'popular'
  accent: string
  icon: ComponentType<{ className?: string }>
}

const MODULES: DashboardModule[] = [
  {
    id: 'timeclock',
    title: 'Timeclock',
    desc: 'Clock in, clock out, review punches',
    href: '/dashboard/timeclock',
    group: 'staff',
    priority: 'primary',
    accent: 'from-slate-950 to-slate-700 text-white',
    icon: Clock3,
  },
  {
    id: 'hrms-transfer',
    title: 'HRMS',
    desc: 'Open Frappe HR through IMS handoff',
    href: '/dashboard/frappe-transfer',
    group: 'staff',
    priority: 'primary',
    accent: 'from-emerald-700 to-teal-600 text-white',
    icon: HeartPulse,
  },
  {
    id: 'applications',
    title: 'Applications Hub',
    desc: 'NADRA, passports, visas and document work',
    href: '/dashboard/applications',
    group: 'operations',
    accent: 'from-orange-600 to-amber-500 text-white',
    icon: FileText,
  },
  {
    id: 'bookings',
    title: 'Bookings',
    desc: 'Appointments, waitlist and no-show handling',
    href: '/dashboard/bookings',
    group: 'operations',
    accent: 'from-indigo-700 to-blue-600 text-white',
    icon: CalendarDays,
  },
  {
    id: 'ticketing',
    title: 'Ticketing',
    desc: 'PNR work, fares and ticket operations',
    href: '/dashboard/ticketing',
    group: 'operations',
    accent: 'from-sky-700 to-cyan-600 text-white',
    icon: Plane,
  },
  {
    id: 'gb-passport',
    title: 'GB Passport',
    desc: 'British passport services',
    href: '/dashboard/applications/passports-gb',
    group: 'operations',
    accent: 'from-blue-950 to-blue-800 text-white',
    icon: BriefcaseBusiness,
  },
  {
    id: 'lms',
    title: 'LMS',
    desc: 'Customer balances and instalments',
    href: '/dashboard/lms',
    group: 'finance',
    accent: 'from-yellow-400 to-amber-300 text-slate-950',
    icon: BadgePoundSterling,
  },
  {
    id: 'commissions',
    title: 'Commissions',
    desc: 'Sales earnings and staff commission view',
    href: '/dashboard/commissions',
    group: 'finance',
    accent: 'from-slate-700 to-slate-500 text-white',
    icon: Ticket,
  },
  {
    id: 'pricing',
    title: 'Pricing',
    desc: 'Service pricing and branch offers',
    href: '/dashboard/pricing',
    group: 'finance',
    accent: 'from-emerald-800 to-green-600 text-white',
    icon: BadgePoundSterling,
  },
  {
    id: 'settings',
    title: 'Settings',
    desc: 'Security, branches, staff and maintenance',
    href: '/dashboard/settings',
    group: 'admin',
    accent: 'from-slate-900 to-slate-700 text-white',
    icon: Settings,
  },
  {
    id: 'account',
    title: 'My Account',
    desc: 'Passkeys, devices and recovery settings',
    href: '/dashboard/account',
    group: 'staff',
    accent: 'from-cyan-700 to-blue-600 text-white',
    icon: FingerprintPattern,
  },
]

const GROUP_LABELS: Record<DashboardModule['group'], string> = {
  staff: 'Staff essentials',
  operations: 'Operations',
  finance: 'Finance',
  admin: 'Admin',
}

const MOBILE_PRIMARY_IDS = new Set(['timeclock', 'hrms-transfer'])
const MOBILE_QUICK_IDS = new Set(['account', 'applications', 'bookings'])

function ModuleIcon({
  moduleItem,
  className = 'h-5 w-5',
}: {
  moduleItem: DashboardModule
  className?: string
}) {
  const Icon = moduleItem.icon
  return <Icon className={className} />
}

function MobileDashboard({
  modules,
  userName,
}: {
  modules: DashboardModule[]
  userName?: string | null
}) {
  const primaryModules = modules.filter((moduleItem) => MOBILE_PRIMARY_IDS.has(moduleItem.id))
  const quickModules = modules.filter((moduleItem) => MOBILE_QUICK_IDS.has(moduleItem.id))
  const remainingModules = modules.filter(
    (moduleItem) => !MOBILE_PRIMARY_IDS.has(moduleItem.id) && !MOBILE_QUICK_IDS.has(moduleItem.id),
  )

  return (
    <section className="lg:hidden">
      <div className="rounded-[2rem] bg-slate-950 p-5 text-white shadow-2xl shadow-slate-950/20">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">
              Staff launchpad
            </p>
            <h1 className="mt-2 text-2xl font-black leading-tight">Hi {userName || 'there'}</h1>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
            <LayoutDashboard className="h-6 w-6" />
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          Fast access for phones. Clock in or jump to HRMS first, then everything else below.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {primaryModules.map((moduleItem) => (
          <Link key={moduleItem.id} href={moduleItem.href} className="group">
            <div
              className={`min-h-36 rounded-[1.5rem] bg-gradient-to-br ${moduleItem.accent} p-4 shadow-lg`}
            >
              <ModuleIcon moduleItem={moduleItem} className="h-7 w-7" />
              <h2 className="mt-5 text-lg font-black">{moduleItem.title}</h2>
              <p className="mt-1 text-xs leading-5 opacity-85">{moduleItem.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">
            Quick options
          </h2>
          <Sparkles className="h-4 w-4 text-amber-500" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {quickModules.map((moduleItem) => (
            <Link
              key={moduleItem.id}
              href={moduleItem.href}
              className="rounded-2xl bg-slate-50 p-3 text-center"
            >
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-800 shadow-sm">
                <ModuleIcon moduleItem={moduleItem} className="h-5 w-5" />
              </div>
              <p className="mt-2 text-[11px] font-bold leading-tight text-slate-700">
                {moduleItem.title}
              </p>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 pb-20">
        {remainingModules.map((moduleItem) => (
          <Link
            key={moduleItem.id}
            href={moduleItem.href}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${moduleItem.accent}`}
              >
                <ModuleIcon moduleItem={moduleItem} className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">{moduleItem.title}</h3>
                <p className="text-[11px] text-slate-500">{GROUP_LABELS[moduleItem.group]}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

function DesktopDashboard({
  modules,
  userName,
  roleName,
  branchName,
}: {
  modules: DashboardModule[]
  userName?: string | null
  roleName?: string | null
  branchName?: string | null
}) {
  const primaryModules = modules.filter((moduleItem) => moduleItem.priority === 'primary')
  const groupedModules = (
    ['operations', 'finance', 'admin', 'staff'] as DashboardModule['group'][]
  ).map((group) => ({
    group,
    modules: modules.filter(
      (moduleItem) => moduleItem.group === group && moduleItem.priority !== 'primary',
    ),
  }))

  return (
    <section className="hidden lg:block">
      <div className="grid grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="overflow-hidden rounded-[2rem] bg-slate-950 p-8 text-white shadow-2xl shadow-slate-950/20">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">
                IMS command centre
              </p>
              <h1 className="mt-4 max-w-xl text-4xl font-black leading-tight">
                Welcome back, {userName || 'team member'}.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
                Start with staff-critical actions, then move into applications, finance, bookings,
                or admin work from one authenticated entry point.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-right">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Branch</p>
              <p className="mt-1 font-black">{branchName || 'Unassigned'}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-300">Role</p>
              <p className="mt-1 font-black">{roleName || 'Staff'}</p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4">
            {primaryModules.map((moduleItem) => (
              <Link key={moduleItem.id} href={moduleItem.href} className="group">
                <div
                  className={`rounded-[1.5rem] bg-gradient-to-br ${moduleItem.accent} p-5 transition duration-200 group-hover:-translate-y-1 group-hover:shadow-xl`}
                >
                  <div className="flex items-center justify-between">
                    <ModuleIcon moduleItem={moduleItem} className="h-8 w-8" />
                    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
                      Popular
                    </span>
                  </div>
                  <h2 className="mt-8 text-2xl font-black">{moduleItem.title}</h2>
                  <p className="mt-2 text-sm leading-6 opacity-85">{moduleItem.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50 p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-700 text-white">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-black text-emerald-950">Security posture</h2>
                <p className="mt-2 text-sm leading-6 text-emerald-900">
                  Passkeys, 2FA, session controls, auth telemetry, and Frappe handoff auditing are
                  now wired into the portal flow.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Today</p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                ['Access', 'IMS'],
                ['HR', 'Frappe'],
                ['Devices', 'Managed'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-slate-50 p-4 text-center">
                  <p className="text-xl font-black text-slate-950">{value}</p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-6 xl:grid-cols-4">
        {groupedModules.map(({ group, modules: groupModules }) => (
          <div
            key={group}
            className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
              {GROUP_LABELS[group]}
            </h2>
            <div className="mt-4 space-y-3">
              {groupModules.map((moduleItem) => (
                <Link
                  key={moduleItem.id}
                  href={moduleItem.href}
                  className="group flex items-center gap-3 rounded-2xl p-2 transition hover:bg-slate-50"
                >
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${moduleItem.accent}`}
                  >
                    <ModuleIcon moduleItem={moduleItem} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-black text-slate-900 group-hover:text-emerald-700">
                      {moduleItem.title}
                    </h3>
                    <p className="truncate text-xs text-slate-500">{moduleItem.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default async function Dashboard() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {}
        },
      },
    },
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('full_name, roles(name), locations(name, branch_code)')
    .eq('id', session.user.id)
    .single()

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations
  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-[#f4f7f3]">
        <PageHeader
          employeeName={employee?.full_name}
          role={role?.name}
          location={location}
          userId={session.user.id}
        />

        <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <BackupCodesReminder userId={session.user.id} />
          <MobileDashboard modules={MODULES} userName={employee?.full_name} />
          <DesktopDashboard
            modules={MODULES}
            userName={employee?.full_name}
            roleName={role?.name}
            branchName={location?.name}
          />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
