/**
 * Pricing Management Page
 *
 * Service pricing configuration and management interface (Admin only):
 * - View and edit service fee pricing
 * - Manage pricing tiers and discounts
 * - Configure surcharges and additional fees
 * - Set pricing effective dates
 *
 * Server component that:
 * - Verifies admin authorization
 * - Loads current pricing configuration from database
 * - Renders pricing table for editing
 *
 * @module app/dashboard/pricing/page
 */
import dynamic from 'next/dynamic'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'

const PricingClient = dynamic(() => import('./client'), {
  loading: () => (
    <div className="h-96 animate-pulse rounded-[2rem] border border-slate-200 bg-white" />
  ),
})

export default async function PricingPage() {
  const { userId, employeeName, role, location } = await loadDashboardPageContext()
  const userRole = role || 'Employee'

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50">
        <PageHeader
          employeeName={employeeName}
          role={userRole}
          location={location}
          userId={userId}
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
