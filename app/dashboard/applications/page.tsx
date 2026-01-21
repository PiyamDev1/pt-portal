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
    {
      cookies: { getAll() { return cookieStore.getAll() }, setAll() {} },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  // Fetching essential employee data for the header
  const { data: employee } = await supabase
    .from('employees')
    .select('full_name, roles(name), locations(name, branch_code)')
    .eq('id', session.user.id)
    .single()

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations
  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles

  const { data: nadraApplications } = await supabase
    .from('applications')
    .select(`
      id,
      tracking_number,
      created_at,
      applicants:applicants!applications_applicant_id_fkey ( first_name, last_name, citizen_number ),
      nadra_services!inner (
        id,
        status,
        service_type,
        created_at,
        tracking_number
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  const { data: pakPassports } = await supabase
    .from('applications')
    .select(`
      id,
      tracking_number,
      created_at,
      applicants:applicants!applications_applicant_id_fkey ( first_name, last_name, citizen_number ),
      pakistani_passport_applications!inner (
        id,
        status,
        application_type,
        created_at
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  const { data: gbPassports } = await supabase
    .from('british_passport_applications')
    .select(`
      id,
      status,
      created_at,
      applicants ( first_name, last_name ),
      applications ( id, tracking_number )
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  const { data: visas } = await supabase
    .from('visa_applications')
    .select(`
      id,
      status,
      created_at,
      applicants ( first_name, last_name, passport_number ),
      visa_countries ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(50)

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
            nadraRecords={nadraApplications || []} 
            pakPassportRecords={pakPassports || []} 
            gbPassportRecords={gbPassports || []} 
            visaRecords={visas || []} 
          />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
