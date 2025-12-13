import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import SettingsClient from './client'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'

export default async function SettingsPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: any[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )

  // 1. Security Check: Only allow if logged in
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  // 2. Fetch Hierarchy Data in Parallel (Fast)
  const [locations, departments, roles, employees, employeeData] = await Promise.all([
    supabase.from('locations').select('*').order('name'),
    supabase.from('departments').select('*').order('name'),
    supabase.from('roles').select('*').order('level'), // Level 1 = Boss
    supabase.from('employees').select('id, full_name, email, role_id, department_id, location_id, manager_id'),
    supabase.from('employees')
      .select('full_name, roles(name), locations(name, branch_code)')
      .eq('id', session.user.id)
      .single()
  ])

  const location = Array.isArray(employeeData?.data?.locations) ? employeeData.data.locations[0] : employeeData?.data?.locations
  const role = Array.isArray(employeeData?.data?.roles) ? employeeData.data.roles[0] : employeeData?.data?.roles

  // 3. Pass data to the Client Component (The Dashboard UI)
  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50">
        <PageHeader employeeName={employeeData?.data?.full_name} role={role?.name} location={location} userId={session.user.id} showBack={true} />
      
      <main className="max-w-7xl mx-auto p-6">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Organization Settings</h1>
        <p className="text-slate-500 mb-8">Manage branches, structure, and staff access levels.</p>
      
      <SettingsClient 
        currentUser={session.user}
        initialLocations={locations.data || []}
        initialDepts={departments.data || []}
        initialRoles={roles.data || []}
        initialEmployees={employees.data || []}
      />
      </main>
      </div>
    </DashboardClientWrapper>
  )
}