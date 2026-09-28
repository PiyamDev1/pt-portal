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
import { redirect } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'
import TimeclockTeamClient from './client'
import {
  hasMaintenanceTimeclockAccess,
  hasManagerTimeclockAccess,
  pickRoleName,
} from '@/lib/timeclockAccess'

export const metadata = {
  title: 'Team Timeclock - PT Portal',
  description: 'Review your team timeclock punches',
}

export default async function TimeclockTeamPage() {
  const { supabase, userId, employeeName, role, location } = await loadDashboardPageContext()

  const [{ count: reportCount }, { data: profile }] = await Promise.all([
    supabase
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('manager_id', userId),
    supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
  ])

  const roleName = pickRoleName(role, profile?.role)

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
          employeeName={employeeName}
          role={role}
          location={location}
          userId={userId}
          showBack={true}
        />

        <main className="max-w-6xl mx-auto p-6 w-full flex-grow space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 mb-2">Team punches</h1>
            <p className="text-slate-500">
              Review the attendance evidence for your reports, or across the site if you have
              maintenance access.
            </p>
          </div>
          <TimeclockTeamClient />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
