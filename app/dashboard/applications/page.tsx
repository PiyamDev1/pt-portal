import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import ApplicationsClient from './client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'

export default async function ApplicationsHubPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('full_name, roles(name), locations(name, branch_code)')
    .eq('id', session.user.id)
    .single()

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations
  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles

  // Parallel fetch: status-only arrays for accurate counts + recent activity rows for the feed
  const [
    { data: nadraStatuses },
    { data: pakStatuses },
    { data: gbStatuses },
    { data: visaStatuses },
    { data: nadraRecent },
    { data: pakRecent },
    { data: gbRecent },
    { data: visaRecent },
  ] = await Promise.all([
    supabase.from('nadra_services').select('id, status, created_at'),
    supabase.from('pakistani_passport_applications').select('id, status, created_at'),
    supabase.from('british_passport_applications').select('id, status, created_at'),
    supabase.from('visa_applications').select('id, status, created_at'),

    supabase.from('applications').select(`
      id, tracking_number, created_at,
      applicants:applicants!applications_applicant_id_fkey(first_name, last_name),
      nadra_services!inner(id, status, service_type, created_at, tracking_number)
    `).order('created_at', { ascending: false }).limit(12),

    supabase.from('applications').select(`
      id, tracking_number, created_at,
      applicants:applicants!applications_applicant_id_fkey(first_name, last_name),
      pakistani_passport_applications!inner(id, status, application_type, created_at)
    `).order('created_at', { ascending: false }).limit(12),

    supabase.from('british_passport_applications').select(`
      id, status, created_at,
      applicants(first_name, last_name),
      applications(id, tracking_number)
    `).order('created_at', { ascending: false }).limit(12),

    supabase.from('visa_applications').select(`
      id, status, created_at,
      applicants(first_name, last_name),
      visa_countries(name)
    `).order('created_at', { ascending: false }).limit(12),
  ])

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
        <main className="max-w-7xl mx-auto p-6 w-full flex-grow">
          <ApplicationsClient
            nadraStatuses={nadraStatuses || []}
            pakStatuses={pakStatuses || []}
            gbStatuses={gbStatuses || []}
            visaStatuses={visaStatuses || []}
            nadraRecent={nadraRecent || []}
            pakRecent={pakRecent || []}
            gbRecent={gbRecent || []}
            visaRecent={visaRecent || []}
          />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
