/**
 * Dashboard Hub Page
 *
 * Server-rendered dashboard shell with two intentional layouts:
 * - Mobile: compact staff launcher optimised for thumbs and quick tasks.
 * - Desktop: smaller operations hub with favorites, frequent modules, categories, and notices.
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
  GraduationCap,
  HeartPulse,
  LayoutDashboard,
  Plane,
  Settings,
  Sparkles,
  Ticket,
} from 'lucide-react'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from './client-wrapper'
import { DashboardFrappeSyncCard } from './DashboardFrappeSyncCard'
import { BackupCodesReminder } from './lms/components/BackupCodesReminder'
import { DashboardModulesClient } from './DashboardModulesClient'
import { NoticeBoardClient } from './NoticeBoardClient'
import {
  DASHBOARD_GROUP_LABELS,
  DASHBOARD_MODULES,
  type DashboardModule,
} from '@/lib/dashboardModules'

type IconProps = { className?: string }

const ICONS: Record<DashboardModule['iconKey'], ComponentType<IconProps>> = {
  'badge-pound': BadgePoundSterling,
  briefcase: BriefcaseBusiness,
  calendar: CalendarDays,
  clock: Clock3,
  'file-text': FileText,
  fingerprint: FingerprintPattern,
  graduation: GraduationCap,
  heart: HeartPulse,
  plane: Plane,
  settings: Settings,
  ticket: Ticket,
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
  const Icon = ICONS[moduleItem.iconKey]
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
              className={`min-h-36 rounded-[1.5rem] bg-gradient-to-br ${moduleItem.tileTone} p-4 text-slate-950 shadow-lg ring-1 ring-slate-900/5`}
            >
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${moduleItem.iconTone} shadow-lg`}
              >
                <ModuleIcon moduleItem={moduleItem} className="h-7 w-7" />
              </div>
              <h2 className="mt-5 text-lg font-black">{moduleItem.title}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">{moduleItem.desc}</p>
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
              className={`rounded-2xl bg-gradient-to-br ${moduleItem.tileTone} p-3 text-center shadow-sm ring-1 ring-slate-900/5`}
            >
              <div
                className={`mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${moduleItem.iconTone} shadow-sm`}
              >
                <ModuleIcon moduleItem={moduleItem} className="h-5 w-5" />
              </div>
              <p className="mt-2 text-[11px] font-bold leading-tight text-slate-700">
                {moduleItem.title}
              </p>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {remainingModules.map((moduleItem) => (
          <Link
            key={moduleItem.id}
            href={moduleItem.href}
            className={`rounded-2xl border border-white/70 bg-gradient-to-br ${moduleItem.tileTone} p-4 shadow-sm ring-1 ring-slate-900/5`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${moduleItem.iconTone} shadow-sm`}
              >
                <ModuleIcon moduleItem={moduleItem} className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">{moduleItem.title}</h3>
                <p className="text-[11px] text-slate-500">
                  {DASHBOARD_GROUP_LABELS[moduleItem.group]}
                </p>
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
  showFrappeBridge,
}: {
  modules: DashboardModule[]
  userName?: string | null
  roleName?: string | null
  branchName?: string | null
  showFrappeBridge: boolean
}) {
  return (
    <section className="hidden space-y-5 lg:block">
      <div className="relative overflow-hidden rounded-[1.5rem] border border-red-100 bg-gradient-to-r from-white via-red-50 to-slate-100 px-5 py-4 shadow-sm">
        <div className="pointer-events-none absolute -right-10 -top-16 h-36 w-36 rounded-full bg-[#8b1e2d]/15 blur-3xl" />
        <div className="relative flex items-center justify-between gap-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#8b1e2d]">
              Dashboard
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
              Welcome back, {userName || 'team member'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {roleName || 'Staff'} {branchName ? `at ${branchName}` : 'workspace'}
            </p>
          </div>
          <div className="rounded-2xl bg-[#4b0f16] px-4 py-3 text-right text-white">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-red-100">
              IMS access
            </p>
            <p className="mt-1 text-base font-black">Secured</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_21rem] gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-5">
          {showFrappeBridge && <DashboardFrappeSyncCard />}
          <DashboardModulesClient modules={modules} />
        </div>
        <NoticeBoardClient showMobilePopup={false} />
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
  const showFrappeBridge = ['Admin', 'Master Admin', 'Maintenance Admin', 'Manager'].includes(
    role?.name || '',
  )
  const visibleModules = DASHBOARD_MODULES.filter(
    (moduleItem) => !moduleItem.allowedRoles || moduleItem.allowedRoles.includes(role?.name || ''),
  )

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-[#f5f5f5]">
        <PageHeader
          employeeName={employee?.full_name}
          role={role?.name}
          location={location}
          userId={session.user.id}
        />

        <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <BackupCodesReminder userId={session.user.id} />
          <MobileDashboard modules={visibleModules} userName={employee?.full_name} />
          <DesktopDashboard
            modules={visibleModules}
            userName={employee?.full_name}
            roleName={role?.name}
            branchName={location?.name}
            showFrappeBridge={showFrappeBridge}
          />
          <NoticeBoardClient showDesktopRail={false} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
