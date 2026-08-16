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
import { LayoutDashboard } from 'lucide-react'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from './client-wrapper'
import { DashboardModuleIcon } from './DashboardModuleIcon'
import { BackupCodesReminder } from './lms/components/BackupCodesReminder'
import { DashboardModulesClient } from './DashboardModulesClient'
import { NoticeBoardClient } from './NoticeBoardClient'
import {
  DASHBOARD_GROUP_LABELS,
  DASHBOARD_MODULES,
  type DashboardModule,
} from '@/lib/dashboardModules'

const MOBILE_PRIMARY_IDS = new Set(['timeclock', 'hrms-transfer'])
function MobileDashboard({
  modules,
  userName,
}: {
  modules: DashboardModule[]
  userName?: string | null
}) {
  const primaryModules = modules.filter((moduleItem) => MOBILE_PRIMARY_IDS.has(moduleItem.id))
  const workspaceModules = modules.filter((moduleItem) => !MOBILE_PRIMARY_IDS.has(moduleItem.id))

  return (
    <section className="platform-mobile-only">
      <div className="overflow-hidden rounded-[1.75rem] bg-[#4b0f16] p-5 text-white shadow-xl shadow-red-950/20">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-red-100">
              Mobile workspace
            </p>
            <h1 className="mt-2 text-2xl font-black leading-tight">Hi {userName || 'there'}</h1>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
            <LayoutDashboard className="h-6 w-6" />
          </div>
        </div>
        <p className="mt-3 text-sm leading-5 text-red-50/85">
          Open a workspace quickly, or pin your most-used pages to the navigation bar.
        </p>
      </div>

      <div className="mt-6">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
          Start here
        </p>
        <div className="grid grid-cols-2 gap-3">
          {primaryModules.map((moduleItem) => (
            <Link
              key={moduleItem.id}
              href={moduleItem.href}
              className={`flex min-h-36 flex-col items-center justify-center gap-3 rounded-[1.5rem] bg-gradient-to-br ${moduleItem.tileTone} p-3 text-center text-slate-950 shadow-md ring-1 ring-slate-900/5 active:scale-[0.99]`}
            >
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${moduleItem.iconTone} shadow-lg`}
              >
                <DashboardModuleIcon moduleItem={moduleItem} className="h-8 w-8" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-black leading-tight">{moduleItem.title}</h2>
                <p className="mt-1 line-clamp-2 text-xs leading-4 text-slate-600">
                  {moduleItem.desc}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {workspaceModules.length > 0 && (
        <div className="mt-6">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
            Your workspaces
          </p>
          <div className="grid grid-cols-2 gap-3">
            {workspaceModules.map((moduleItem) => (
              <Link
                key={moduleItem.id}
                href={moduleItem.href}
                className={`flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-white/70 bg-gradient-to-br ${moduleItem.tileTone} p-3 text-center shadow-sm ring-1 ring-slate-900/5 active:scale-[0.99]`}
              >
                <div
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${moduleItem.iconTone} shadow-sm`}
                >
                  <DashboardModuleIcon moduleItem={moduleItem} className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-black leading-tight text-slate-900">
                    {moduleItem.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-4 text-slate-600">
                    {moduleItem.desc}
                  </p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {DASHBOARD_GROUP_LABELS[moduleItem.group]}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
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
  return (
    <section className="platform-desktop-only space-y-5">
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
        <DashboardModulesClient modules={modules} />
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
          />
          <NoticeBoardClient showDesktopRail={false} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
