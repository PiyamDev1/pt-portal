import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import VisasClient from './client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'

export default async function VisasPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { getAll() { return cookieStore.getAll() }, setAll() {} }
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  // Fetch Employee Info for Header
  const { data: employee } = await supabase
    .from('employees')
    .select('full_name, roles(name), locations(name, branch_code)')
    .eq('id', session.user.id)
    .single()

  // Fetch Visas with joins
  const { data: visas } = await supabase
    .from('visa_applications')
    .select(`
      id,
      internal_tracking_number,
      applicant_id,
      employee_id,
      visa_country_id,
      visa_type_id,
      application_date,
      passport_number_used,
      customer_price,
      base_price,
      cost_currency,
      status,
      notes,
      is_loyalty_claimed,
      created_at,
      applicants (first_name, last_name),
      visa_countries (id, name),
      visa_types (id, name)
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
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-800">Visa Applications</h1>
            <p className="text-slate-500">Manage visa applications and track processing status.</p>
          </div>
          <VisasClient initialData={visas || []} currentUserId={session.user.id} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
