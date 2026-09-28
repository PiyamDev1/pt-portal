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
import dynamic from 'next/dynamic'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'
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
  const { userId, employeeName, role, location } = await loadDashboardPageContext()

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <PageHeader
          employeeName={employeeName}
          role={role}
          location={location}
          userId={userId}
          showBack={true}
        />
        <main className="max-w-7xl mx-auto p-6 w-full flex-grow">
          <div className="mb-6">
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Loan Management</h1>
            <p className="text-slate-500 text-sm mt-1">
              Track customer accounts, services, and payments
            </p>
          </div>

          <LMSClient currentUserId={userId} initialFilter={initialFilter} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
