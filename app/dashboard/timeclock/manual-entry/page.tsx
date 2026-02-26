import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import ManualEntryClient from './client'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'

export default async function ManualEntryPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    redirect('/login')
  }

  // Check if user is a manager (has reports) or has Master Admin role
  const { data: employee } = await supabase
    .from('employees')
    .select('full_name, roles(name), locations(name, branch_code)')
    .eq('id', session.user.id)
    .single()

  const { count: reportCount } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('manager_id', session.user.id)

  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles
  const isManager = role?.name === 'Master Admin' || (reportCount || 0) > 0
  
  if (!isManager) {
    redirect('/dashboard/timeclock')
  }

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations

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
        <main className="max-w-4xl mx-auto p-6 w-full flex-grow">
          <ManualEntryClient userId={session.user.id} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
