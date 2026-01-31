import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import PricingClient from './client'

export default async function PricingPage() {
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

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: employeeData } = await supabase
    .from('employees')
    .select('full_name, roles(name), locations(name, branch_code)')
    .eq('id', session.user.id)
    .single()

  const location = Array.isArray(employeeData?.locations) ? employeeData.locations[0] : employeeData?.locations
  const role = Array.isArray(employeeData?.roles) ? employeeData.roles[0] : employeeData?.roles
  const userRole = role?.name || 'Employee'

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50">
        <PageHeader 
          employeeName={employeeData?.full_name} 
          role={userRole} 
          location={location} 
          userId={session.user.id} 
          showBack={true}
        />
        
        <main className="max-w-7xl mx-auto p-6">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">Pricing Management</h1>
          <p className="text-slate-500 mb-8">Manage pricing for all services and offerings.</p>
          
          <PricingClient userRole={userRole} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
