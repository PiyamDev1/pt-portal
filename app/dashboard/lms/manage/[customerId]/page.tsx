import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import PageHeader from '@/app/components/PageHeader.client'
import LedgerClient from './client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'

export default async function ManageCustomerPage({ params }: any) {
  const { customerId } = params
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { session } } = await supabase.auth.getSession()
  
  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <PageHeader 
            employeeName="Staff" 
            userId={session?.user?.id}
            showBack={true}
        />
        <main className="max-w-5xl mx-auto p-6 w-full flex-grow">
            <LedgerClient customerId={customerId} currentUserId={session?.user?.id} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
