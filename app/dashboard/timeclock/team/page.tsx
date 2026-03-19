/**
 * Team Timeclock Management Page
 * 
 * Manager view for team attendance tracking:
 * - View all team member attendance and punch records
 * - Approve or reject time adjustment requests
 * - Bulk time adjustments for team members
 * - Team attendance analytics and reports
 * - Filter by date range and employee
 * 
 * Server component that:
 * - Authenticates manager-level access
 * - Loads team member time records
 * - Renders team management interface
 * 
 * @module app/dashboard/timeclock/team/page
 */
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import TimeclockTeamClient from './client'
import {
  getRoleName,
  hasMaintenanceTimeclockAccess,
  hasManagerTimeclockAccess,
  pickRoleName,
} from '@/lib/timeclockAccess'

export const metadata = {
  title: 'Team Timeclock - PT Portal',
  description: 'Review your team timeclock punches',
}

export default async function TimeclockTeamPage() {
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

  if (
    !hasManagerTimeclockAccess(roleName, reportCount) &&
    !hasMaintenanceTimeclockAccess(roleName)
  ) {
    redirect('/dashboard/timeclock')
  }

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <PageHeader
          employeeName={employee?.full_name}
          role={role?.name}
          location={location}
          userId={session.user.id}
          showBack={true}
        />

        <main className="max-w-6xl mx-auto p-6 w-full flex-grow space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 mb-2">Team Timeclock</h1>
            <p className="text-slate-500">
              Review timeclock punches for your reports, or across the site if you have maintenance
              access.
            </p>
          </div>
          <TimeclockTeamClient />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
