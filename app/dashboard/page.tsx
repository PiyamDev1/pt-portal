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
    accent: 'from-[#3a3a3a] to-black text-white',
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
    accent: 'from-[#8b1e2d] to-[#c43b42] text-white',
    icon: FileText,
  },
  {
    id: 'bookings',
    title: 'Bookings',
    desc: 'Appointments, waitlist and no-show handling',
    href: '/dashboard/bookings',
    group: 'operations',
    accent: 'from-[#6f1422] to-[#a32234] text-white',
    icon: CalendarDays,
  },
  {
    id: 'ticketing',
    title: 'Ticketing',
    desc: 'PNR work, fares and ticket operations',
    href: '/dashboard/ticketing',
    group: 'operations',
    accent: 'from-[#991b1b] to-[#dc2626] text-white',
    icon: Plane,
  },
  {
    id: 'gb-passport',
    title: 'GB Passport',
    desc: 'British passport services',
    href: '/dashboard/applications/passports-gb',
    group: 'operations',
    accent: 'from-[#4b5563] to-[#111827] text-white',
    icon: BriefcaseBusiness,
  },
  {
    id: 'lms',
    title: 'LMS',
    desc: 'Customer balances and instalments',
    href: '/dashboard/lms',
    group: 'finance',
    accent: 'from-[#f3f4f6] to-[#d1d5db] text-slate-950',
    icon: BadgePoundSterling,
  },
  {
    id: 'commissions',
    title: 'Commissions',
    desc: 'Sales earnings and staff commission view',
    href: '/dashboard/commissions',
    group: 'finance',
    accent: 'from-[#3a3a3a] to-[#1f2937] text-white',
    icon: Ticket,
  },
  {
    id: 'pricing',
    title: 'Pricing',
    desc: 'Service pricing and branch offers',
    href: '/dashboard/pricing',
    group: 'finance',
    accent: 'from-[#7f1d1d] to-[#b91c1c] text-white',
    icon: BadgePoundSterling,
  },
  {
    id: 'settings',
    title: 'Settings',
    desc: 'Security, branches, staff and maintenance',
    href: '/dashboard/settings',
    group: 'admin',
    accent: 'from-[#111827] to-[#3a3a3a] text-white',
    icon: Settings,
  },
  {
    id: 'account',
    title: 'My Account',
    desc: 'Passkeys, devices and recovery settings',
    href: '/dashboard/account',
    group: 'staff',
    accent: 'from-[#4b0f16] to-[#8b1e2d] text-white',
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
      <div className="rounded-[2rem] bg-[#4b0f16] p-5 text-white shadow-2xl shadow-red-950/20">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-red-100">
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
  const sortedModules = [...modules].sort((a, b) => a.title.localeCompare(b.title))
  const operationsModules = modules.filter((moduleItem) => moduleItem.group === 'operations')

  return (
    <section className="hidden space-y-8 lg:block">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.22em] text-[#8b1e2d]">Dashboard</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">
            Welcome back, {userName || 'team member'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {roleName || 'Staff'} {branchName ? `at ${branchName}` : 'workspace'}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-right shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">IMS access</p>
          <p className="mt-1 text-lg font-black text-[#4b0f16]">Secured</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                Priority actions
              </p>
              <h2 className="mt-2 text-3xl font-black text-slate-950">2</h2>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4b0f16] text-white">
              <Sparkles className="h-6 w-6" />
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-500">Timeclock and HRMS stay one click away.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                Operations modules
              </p>
              <h2 className="mt-2 text-3xl font-black text-slate-950">
                {operationsModules.length}
              </h2>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-[#8b1e2d]">
              <FileText className="h-6 w-6" />
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Applications, bookings, ticketing and passports.
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
                HRMS handoff
              </p>
              <h2 className="mt-2 text-3xl font-black text-emerald-950">Ready</h2>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-700 text-white">
              <ShieldCheck className="h-6 w-6" />
            </div>
          </div>
          <p className="mt-4 text-sm text-emerald-900">
            Desktop opens Frappe desktop, mobile opens HRMS app shell.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {primaryModules.map((moduleItem) => (
          <Link key={moduleItem.id} href={moduleItem.href} className="group">
            <div
              className={`min-h-56 overflow-hidden rounded-[1.75rem] bg-gradient-to-br ${moduleItem.accent} p-7 shadow-xl transition duration-200 group-hover:-translate-y-1 group-hover:shadow-2xl`}
            >
              <div className="flex items-start justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
                  <ModuleIcon moduleItem={moduleItem} className="h-8 w-8" />
                </div>
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-wide">
                  Popular
                </span>
              </div>
              <h2 className="mt-12 text-3xl font-black">{moduleItem.title}</h2>
              <p className="mt-3 max-w-sm text-sm leading-6 opacity-85">{moduleItem.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950">All modules</h2>
            <p className="text-sm text-slate-500">
              Roomier desktop cards for day-to-day branch work.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
            {sortedModules.length} modules
          </span>
        </div>
        <div className="grid grid-cols-3 gap-5 xl:grid-cols-5">
          {sortedModules.map((moduleItem) => (
            <Link key={moduleItem.id} href={moduleItem.href} className="group">
              <div className="flex min-h-44 flex-col rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm transition duration-200 hover:-translate-y-1 hover:border-[#8b1e2d]/40 hover:shadow-lg">
                <div
                  className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${moduleItem.accent} shadow-sm`}
                >
                  <ModuleIcon moduleItem={moduleItem} className="h-7 w-7" />
                </div>
                <h3 className="mt-5 text-base font-black text-slate-950 group-hover:text-[#8b1e2d]">
                  {moduleItem.title}
                </h3>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                  {moduleItem.desc}
                </p>
                <p className="mt-auto pt-4 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                  {GROUP_LABELS[moduleItem.group]}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
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
      <div className="min-h-screen bg-[#f5f5f5]">
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
