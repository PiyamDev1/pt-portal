import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import GbPassportsClient from './client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'

export default async function GbPassportsPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  // Fetch Data
  const { data: passports } = await supabase
    .from('british_passport_applications')
    .select(`
      *,
      applicants (id, first_name, last_name, date_of_birth, phone_number),
      applications (id, tracking_number)
    `)
    .order('created_at', { ascending: false })

  // Fetch Employee Info
  const { data: employee } = await supabase
    .from('employees')
    .select('full_name, roles(name), locations(name, branch_code)')
    .eq('id', session?.user?.id)
    .single()

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations
  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <PageHeader 
            employeeName={employee?.full_name} 
            role={role?.name} 
            location={location}
            userId={session?.user?.id}
            showBack={true}
        />
        <main className="max-w-7xl mx-auto p-6 w-full flex-grow">
            <GbPassportsClient initialData={passports || []} currentUserId={session?.user?.id} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
