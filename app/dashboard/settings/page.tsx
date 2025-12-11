import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import SettingsClient from './client'

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
  const [locations, departments, roles, employees] = await Promise.all([
    supabase.from('locations').select('*').order('name'),
    supabase.from('departments').select('*').order('name'),
    supabase.from('roles').select('*').order('level'), // Level 1 = Boss
    supabase.from('employees').select('id, full_name, email, role_id, department_id, location_id, manager_id')
  ])

  // 3. Pass data to the Client Component (The Dashboard UI)
  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-slate-800 mb-2">Organization Settings</h1>
      <p className="text-slate-500 mb-8">Manage branches, structure, and staff access levels.</p>
      
      <SettingsClient 
        initialLocations={locations.data || []}
        initialDepts={departments.data || []}
        initialRoles={roles.data || []}
        initialEmployees={employees.data || []}
      />
    </div>
  )
}