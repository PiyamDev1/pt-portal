/**
 * Admin Settings Page
 *
 * Comprehensive admin configuration interface (Admin only):
 * - Manage organization branches and staff hierarchy
 * - Configure LMS pricing tables and charges
 * - Set maintenance windows and notifications
 * - Manage active security sessions
 * - View device and access logs
 *
 * Server component that:
 * - Verifies admin authorization
 * - Loads organizational structure and settings
 * - Renders configuration tabs for different admin functions
 *
 * @module app/dashboard/settings/page
 */
import dynamic from 'next/dynamic'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'
import { DeviceLayoutPreference } from './components/DeviceLayoutPreference'

const SettingsClient = dynamic(() => import('./client'), {
  loading: () => (
    <div className="h-96 animate-pulse rounded-[2rem] border border-slate-200 bg-white" />
  ),
})

export default async function SettingsPage() {
  const { supabase, userId, userEmail, userMetadata, employeeName, role, location } =
    await loadDashboardPageContext()

  const serviceSupabase = getServiceSupabaseClient()

  // 2. Fetch Hierarchy Data in Parallel (Fast)
  const [locations, departments, roles, employees, employeeDepartments] = await Promise.all([
    supabase.from('locations').select('*').order('name'),
    serviceSupabase.from('departments').select('*').order('name'),
    supabase.from('roles').select('*').order('level'), // Level 1 = Boss
    supabase
      .from('employees')
      .select('id, full_name, email, role_id, department_id, location_id, manager_id, is_active'),
    serviceSupabase.from('employee_departments').select('employee_id, department_id'),
  ])

  const departmentsByEmployee = new Map<string, string[]>()
  for (const membership of employeeDepartments.data || []) {
    if (!membership.employee_id || !membership.department_id) continue
    const current = departmentsByEmployee.get(membership.employee_id) || []
    current.push(membership.department_id)
    departmentsByEmployee.set(membership.employee_id, current)
  }

  const employeesWithDepartments = (employees.data || []).map((employee) => ({
    ...employee,
    department_ids:
      departmentsByEmployee.get(employee.id) ||
      (employee.department_id ? [employee.department_id] : []),
  }))

  const userRole = role || 'Employee'
  const currentDepartmentIds = new Set(departmentsByEmployee.get(userId) || [])
  const userDepartments = (departments.data || [])
    .filter((department) => currentDepartmentIds.has(department.id))
    .map((department) => department.name)
    .filter((name): name is string => Boolean(name))
  const normalizedRole = userRole.trim().toLowerCase()
  const hasAdminConsole = ['admin', 'master admin', 'maintenance admin', 'super admin'].includes(
    normalizedRole,
  )

  // 3. Pass data to the Client Component (The Dashboard UI)
  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50">
        <PageHeader
          employeeName={employeeName}
          role={userRole}
          location={location}
          userId={userId}
          showBack={true}
        />

        <main className="mobile-settings-page max-w-7xl mx-auto p-6">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">
            {hasAdminConsole ? 'Admin & Settings' : 'Settings'}
          </h1>
          <p className="text-slate-500 mb-8">
            {hasAdminConsole
              ? 'Manage account security, organization controls, and operational maintenance from one workspace.'
              : 'Manage your personal account and security settings.'}
          </p>

          <div className="mb-6">
            <DeviceLayoutPreference />
          </div>

          <SettingsClient
            currentUser={{
              id: userId,
              email: userEmail || '',
              user_metadata: userMetadata,
            }}
            userRole={userRole}
            userDepartments={userDepartments}
            initialLocations={locations.data || []}
            initialDepts={departments.data || []}
            initialRoles={roles.data || []}
            initialEmployees={employeesWithDepartments}
          />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
