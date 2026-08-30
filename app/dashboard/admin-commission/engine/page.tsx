import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import PageHeader from '@/app/components/PageHeader.client'
import CommissionConsole from '@/app/dashboard/commissions/CommissionConsole'
import { getCommissionPageIdentity, requireCommissionManager } from '@/lib/commissions/server'

export const metadata: Metadata = {
  title: 'Commission Shadow Console - PT Portal',
  description: 'Non-payable Commission diagnostics and reconciliation',
}

export const dynamic = 'force-dynamic'

export default async function CommissionEnginePage() {
  const access = await requireCommissionManager()
  if (!access.authorized) {
    redirect(access.response.status === 401 ? '/login' : '/dashboard')
  }
  const identity = await getCommissionPageIdentity(access)

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-950 text-white">
        <PageHeader
          employeeName={identity.fullName}
          role={identity.role}
          location={identity.location}
          userId={identity.userId}
          showBack
        />
        <CommissionConsole />
      </div>
    </DashboardClientWrapper>
  )
}
