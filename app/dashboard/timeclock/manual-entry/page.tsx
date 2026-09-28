/**
 * Manual Attendance Entry Page
 *
 * Manual time clock entry for exceptional cases:
 * - Enter historical time records for employees
 * - Create punch records for missing scans
 * - Bulk manual entry for multiple records
 * - Audit trail of manual entries
 * - Request approval for manual entries
 *
 * Server component with authorization:
 * - Verifies manager-level access
 * - Loads manual entry templates
 * - Renders manual entry form
 *
 * @module app/dashboard/timeclock/manual-entry/page
 */
import { redirect } from 'next/navigation'
import ManualEntryClient from './client'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'
import {
  hasMaintenanceTimeclockAccess,
  hasManagerTimeclockAccess,
  pickRoleName,
} from '@/lib/timeclockAccess'

export default async function ManualEntryPage() {
  const { supabase, userId, employeeName, role, location } = await loadDashboardPageContext()

  // Check if user is a manager (has reports) or has Master Admin role
  const [{ count: reportCount }, { data: profile }] = await Promise.all([
    supabase
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('manager_id', userId),
    supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
  ])

  const roleName = pickRoleName(role, profile?.role)
  const canAccessManualEntry =
    hasManagerTimeclockAccess(roleName, reportCount) || hasMaintenanceTimeclockAccess(roleName)

  if (!canAccessManualEntry) {
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
        <main className="max-w-4xl mx-auto p-6 w-full flex-grow">
          <ManualEntryClient userId={userId} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
