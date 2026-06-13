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
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Clock3, History, Keyboard, Users } from 'lucide-react'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import TimeclockClient from './client'
import {
  getRoleName,
  hasMaintenanceTimeclockAccess,
  hasManagerTimeclockAccess,
  pickRoleName,
} from '@/lib/timeclockAccess'

export const metadata = {
  title: 'Timeclock - PT Portal',
  description: 'Clock in and out using QR codes',
}

export default async function TimeclockPage() {
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

  const [{ data: employee }, { count: reportCount }, { data: profile }] = await Promise.all([
    supabase
      .from('employees')
      .select('full_name, roles(name), locations(name, branch_code)')
      .eq('id', session.user.id)
      .single(),
    supabase
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('manager_id', session.user.id),
    supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle(),
  ])

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations
  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles
  const roleName = pickRoleName(getRoleName(role), profile?.role)
  const isManager = hasManagerTimeclockAccess(roleName, reportCount)
  const canUseMaintenanceTools = hasMaintenanceTimeclockAccess(roleName)
  const canSeeTeam = isManager || canUseMaintenanceTools
  const canSeeManualEntry = isManager || canUseMaintenanceTools
  const quickLinks = [
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
          employeeName={employee?.full_name}
          role={roleName || role?.name}
          location={location}
          userId={session.user.id}
          showBack={true}
        />

        <main className="mx-auto w-full max-w-4xl flex-grow px-3 py-4 md:p-6">
          <section className="mb-4 rounded-[1.75rem] bg-gradient-to-br from-[#5c111d] via-[#8b1d2c] to-[#2f3033] p-4 text-white shadow-xl shadow-red-950/15 md:mb-6 md:rounded-none md:bg-none md:p-0 md:text-slate-800 md:shadow-none">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 md:hidden">
                <Clock3 className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Timeclock</h1>
                <p className="mt-1 text-sm leading-5 text-white/80 md:text-base md:text-slate-500">
                  Scan the QR code on the device to clock in or out. Managers can also open manual
                  entry for team access and self-punch fallback.
                </p>
              </div>
            </div>
          </section>

          <div className="mb-5 grid grid-cols-3 gap-2 md:mb-6 md:grid-cols-2 md:gap-4">
            {quickLinks.map((link) => {
              const Icon = link.icon
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className={`${link.tone} flex min-h-[92px] flex-col items-center justify-center rounded-2xl border p-3 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-red-300 hover:shadow-md md:min-h-0 md:items-start md:justify-start md:p-4 md:text-left`}
                >
                  <Icon className="mb-2 h-5 w-5 md:h-6 md:w-6" />
                  <h2 className="text-sm font-semibold md:text-lg">{link.title}</h2>
                  <p className="mt-1 hidden text-sm text-slate-500 md:block">{link.description}</p>
                </a>
              )
            })}
          </div>
          <TimeclockClient />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
