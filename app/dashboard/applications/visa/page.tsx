import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import VisaApplicationsClient from './client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'

export default async function VisaApplicationsPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  // Fetch Visas + Related Info
  const { data: visas } = await supabase
    .from('visa_applications')
    .select(`
      *,
      applicants (first_name, last_name, passport_number, dob, nationality),
      visa_countries (id, name),
      visa_types (id, name)
    `)
    .order('created_at', { ascending: false })

  // Employee Data for Header
  const { data: employee } = await supabase
    .from('employees')
    .select('full_name, roles(name), locations(name, branch_code)')
    .eq('id', session.user.id)
    .single()

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations
  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles

  return (
    <DashboardClientWrapper>
      <div className="min-h-full bg-slate-50 flex flex-col">
        <PageHeader 
            employeeName={employee?.full_name} 
          role={role?.name} 
          location={location}
          userId={session.user.id}
            showBack={true}
        />
        <main className="max-w-7xl mx-auto p-6 w-full flex-grow">
            {/* Temporary Database Notice */}
            <div className="mb-4 bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg shadow-sm">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-amber-800">Database Update Required</h3>
                  <div className="mt-1 text-sm text-amber-700">
                    <p>Supabase database schema needs to be updated to support the nationality filtering feature for visa applications.</p>
                  </div>
                </div>
              </div>
            </div>
            
            <VisaApplicationsClient initialData={visas || []} currentUserId={session?.user?.id} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
