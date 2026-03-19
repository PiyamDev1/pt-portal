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
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import ManualEntryClient from './client'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import {
  getRoleName,
  hasMaintenanceTimeclockAccess,
  hasManagerTimeclockAccess,
  pickRoleName,
} from '@/lib/timeclockAccess'

export default async function ManualEntryPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    },
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    redirect('/login')
  }

  // Check if user is a manager (has reports) or has Master Admin role
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

  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles
  const roleName = pickRoleName(getRoleName(role), profile?.role)
  const canAccessManualEntry =
    hasManagerTimeclockAccess(roleName, reportCount) || hasMaintenanceTimeclockAccess(roleName)

  if (!canAccessManualEntry) {
    redirect('/dashboard/timeclock')
  }

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations

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
        <main className="max-w-4xl mx-auto p-6 w-full flex-grow">
          <ManualEntryClient userId={session.user.id} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
