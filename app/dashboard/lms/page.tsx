import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import dynamic from 'next/dynamic'
import PageHeader from '@/app/components/PageHeader.client'
const LMSClient = dynamic(() => import('./client'), { ssr: false })
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'

export default async function LMSPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { session } } = await supabase.auth.getSession()

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
            <div className="mb-6">
                <h1 className="text-3xl font-black text-slate-800 tracking-tight">Loan Management</h1>
                <p className="text-slate-500 text-sm mt-1">Track customer accounts, services, and payments</p>
            </div>
            
            <LMSClient currentUserId={session?.user?.id} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
