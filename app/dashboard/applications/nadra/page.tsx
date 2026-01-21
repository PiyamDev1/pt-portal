import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import NadraClient from './client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'

export default async function NadraPage() {
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

  const { data: employee } = await supabase
    .from('employees')
    .select('full_name, roles(name), locations(name, branch_code)')
    .eq('id', session.user.id)
    .single()

  // Query all family heads (applicants marked as family heads)
  const { data: familyHeads } = await supabase
    .from('applicants')
    .select('id, first_name, last_name, citizen_number')
    .not('id', 'is', null)

  // Query applications with their details
  const { data: applications } = await supabase
    .from('applications')
    .select(`
      id,
      tracking_number,
      family_head_id,
      family_heads:applicants!applications_family_head_id_fkey ( first_name, last_name, citizen_number ),
      applicants!applications_applicant_id_fkey ( id, first_name, last_name, citizen_number, email ),
      nadra_services!inner (
        id,
        service_type,
        status,
        application_pin,
        tracking_number,
        created_at,
        employee_id,
        nicop_cnic_details ( service_option ),
        employees!nadra_services_employee_id_fkey ( id, full_name )
      )
    `)
    .order('created_at', { ascending: false })

  // Merge: create entries for family heads with no applications
  const familyHeadIds = new Set(applications?.map(app => app.family_head_id) || [])
  const headsWithNoMembers = familyHeads?.filter(head => !familyHeadIds.has(head.id)) || []
  
  const allRecords = [
    ...(applications || []),
    ...headsWithNoMembers.map(head => ({
      id: null,
      tracking_number: null,
      family_head_id: head.id,
      family_heads: head,
      applicants: null,
      nadra_services: null
    }))
  ]

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations
  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50">
        <PageHeader 
          employeeName={employee?.full_name} 
          role={role?.name} 
          location={location} 
          userId={session.user.id} 
          showBack={true} 
        />
        
        <main className="max-w-7xl mx-auto p-6 w-full flex-grow">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-800">Nadra Services</h1>
            <p className="text-slate-500">Manage Family Head records and track application credentials.</p>
          </div>

          <NadraClient initialApplications={allRecords} currentUserId={session.user.id} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}