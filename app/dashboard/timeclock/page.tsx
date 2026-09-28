/**
 * Timeclock Dashboard Page
 *
 * Employee time tracking system with QR code scanning:
 * - Real-time clock in/out with QR code scanning
 * - Geolocation-based punch tracking
 * - Time adjustment requests
 * - Daily attendance summary
 * - Role-based features (employee vs manager vs admin)
 *
 * Server component that:
 * - Authenticates user access to timeclock
 * - Checks user role and timeclock permissions
 * - Renders appropriate timeclock interface
 *
 * @module app/dashboard/timeclock/page
 */
import Link from 'next/link'
import { Clock3, History, Keyboard, TrendingUp, Users } from 'lucide-react'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'
import TimeclockClient from './client'
import {
  hasMaintenanceTimeclockAccess,
  hasManagerTimeclockAccess,
  pickRoleName,
} from '@/lib/timeclockAccess'

export const metadata = {
  title: 'Timeclock - PT Portal',
  description: 'Clock in and out using QR codes',
}

export default async function TimeclockPage() {
  const { supabase, userId, employeeName, role, location } = await loadDashboardPageContext()

  const [{ count: reportCount }, { data: profile }] = await Promise.all([
    supabase
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('manager_id', userId),
    supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
  ])

  const roleName = pickRoleName(role, profile?.role)
  const isManager = hasManagerTimeclockAccess(roleName, reportCount)
  const canUseMaintenanceTools = hasMaintenanceTimeclockAccess(roleName)
  const canSeeTeam = isManager || canUseMaintenanceTools
  const canSeeManualEntry = isManager || canUseMaintenanceTools
  const quickLinks = [
    {
      href: '/dashboard/my-performance?view=attendance',
      title: 'My Performance',
      description: 'See recorded hours alongside your completed work.',
      icon: TrendingUp,
      tone: 'border-violet-100 bg-violet-50 text-violet-700 md:bg-white md:text-slate-800',
    },
    {
      href: '/dashboard/timeclock/history',
      title: 'My punches',
      description: 'Review your recent timeclock activity.',
      icon: History,
      tone: 'border-red-100 bg-red-50 text-red-700 md:bg-white md:text-slate-800',
    },
    ...(canSeeTeam
      ? [
          {
            href: '/dashboard/timeclock/team',
            title: 'Team punches',
            description:
              'See punches for your reporting team, or across the site with maintenance access.',
            icon: Users,
            tone: 'border-sky-100 bg-sky-50 text-sky-700 md:bg-white md:text-slate-800',
          },
        ]
      : []),
    ...(canSeeManualEntry
      ? [
          {
            href: '/dashboard/timeclock/manual-entry',
            title: 'Manual entry',
            description: 'Use QR code or 4-4 numeric code for punches.',
            icon: Keyboard,
            tone: 'border-emerald-100 bg-emerald-50 text-emerald-700 md:bg-white md:text-slate-800',
          },
        ]
      : []),
  ]

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <PageHeader
          employeeName={employeeName}
          role={roleName || role}
          location={location}
          userId={userId}
          showBack={true}
        />

        <main className="timeclock-mobile-surface mx-auto w-full max-w-5xl flex-grow px-3 py-4 md:p-6">
          <section className="timeclock-mobile-hero animate-enter-fade-up relative mb-5 overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#4b0f16] via-[#7b1926] to-[#252830] p-5 text-white shadow-xl shadow-red-950/15 sm:p-7 md:mb-6">
            <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-red-300/20 blur-3xl" />
            <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div className="flex items-start gap-3">
                <span className="timeclock-mobile-hero-icon inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                  <Clock3 className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-red-100">
                    Attendance hub
                  </p>
                  <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                    Clock in with confidence
                  </h1>
                  <p className="timeclock-mobile-hero-copy mt-2 max-w-2xl text-sm leading-6 text-white/80">
                    Scan the device QR code or use a manual code. Your completed punches flow into
                    My Performance and remain reviewable in the evidence trail.
                  </p>
                </div>
              </div>
              <div className="relative flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-wide text-red-100/80">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                  Secure scan
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                  Location-aware
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                  Audit-friendly
                </span>
              </div>
            </div>
          </section>

          <div className="timeclock-mobile-links mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:mb-6 md:gap-4">
            {quickLinks.map((link) => {
              const Icon = link.icon
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`${link.tone} timeclock-mobile-link ui-tap animate-enter-fade-up flex min-h-[92px] flex-row items-center justify-start gap-3 rounded-2xl border p-4 text-left shadow-sm hover:border-red-300 hover:shadow-md md:min-h-0 md:flex-col md:items-start md:justify-start md:gap-0 md:p-4 md:text-left`}
                >
                  <span className="mb-0 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 md:mb-3">
                    <Icon className="h-5 w-5 md:h-6 md:w-6" />
                  </span>
                  <div>
                    <h2 className="text-base font-black md:text-lg">{link.title}</h2>
                    <p className="timeclock-mobile-link-description mt-1 text-sm text-slate-600 md:text-slate-500">
                      {link.description}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
          <TimeclockClient />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
