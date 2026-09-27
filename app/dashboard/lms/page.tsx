/**
 * Loan Management System (LMS) Page
 *
 * Financial statement and loan management interface:
 * - View loan account statements and transaction history
 * - Track installment payments and schedules
 * - Generate and export financial reports
 * - Manage loan documentation
 *
 * Server component that:
 * - Authenticates user access to LMS
 * - Loads loan and installment accounts
 * - Renders financial statements and transaction data
 *
 * @module app/dashboard/lms/page
 */
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import dynamic from 'next/dynamic'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { FILTER_OPTIONS } from './constants'

const LMSClient = dynamic(() => import('./client'), {
  loading: () => (
    <div className="h-96 animate-pulse rounded-[2rem] border border-slate-200 bg-white" />
  ),
})

export default async function LMSPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string | string[] }>
}) {
  const params = await searchParams
  const requestedFilter = Array.isArray(params.filter) ? params.filter[0] : params.filter
  const initialFilter = FILTER_OPTIONS.includes(requestedFilter as (typeof FILTER_OPTIONS)[number])
    ? (requestedFilter as (typeof FILTER_OPTIONS)[number])
    : 'active'
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
    },
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

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
            <p className="text-slate-500 text-sm mt-1">
              Track customer accounts, services, and payments
            </p>
          </div>

          <LMSClient currentUserId={session?.user?.id ?? ''} initialFilter={initialFilter} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
