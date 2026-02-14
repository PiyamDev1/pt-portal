import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import PakPassportClient from './client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'

export default async function PakPassportPage() {
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

  // Fetch Hierarchy: App -> Applicant -> Passport Details
  const { data: applications } = await supabase
      .from('applications')
      .select(`
        id,
        tracking_number,
        applicants:applicants!applications_applicant_id_fkey(
          id, first_name, last_name, citizen_number, email, phone_number
        ),
        pakistani_passport_applications!inner (
          id,
          application_id,
          application_type,
          category,
          page_count,
          speed,
          status,
          old_passport_number,
          new_passport_number,
          family_head_email,
          is_old_passport_returned,
          old_passport_returned_at,
          fingerprints_completed,
          created_at
        )
      `)
    .order('created_at', { ascending: false })

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
        <main className="max-w-7xl mx-auto p-6">
          <div className="mb-8 flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-bold text-slate-800">Pakistani Passports</h1>
              <p className="text-slate-500">Manage renewals, new arrivals, and custody of old passports.</p>
            </div>
          </div>
          <PakPassportClient initialApplications={applications || []} currentUserId={session.user.id} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}