import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { requireStaffSession, ADMIN_ROLES } from '@/lib/auth/staffSession'
import { loadLoyaltyDashboard } from '@/lib/loyalty/server'
import LoyaltyClient from './LoyaltyClient'

export const metadata: Metadata = {
  title: 'Loyalty - PT Portal',
  description: 'Customer loyalty balances, earning history and audited corrections',
}

export const dynamic = 'force-dynamic'

function isAdmin(role: string) {
  const normalized = role.trim().toLowerCase().replace(/[_-]+/g, ' ')
  return ADMIN_ROLES.some((candidate) => candidate.toLowerCase() === normalized)
}

export default async function LoyaltyPage() {
  const access = await requireStaffSession({ roles: [...ADMIN_ROLES] })
  if (!access.authorized) redirect(access.response.status === 401 ? '/login' : '/dashboard')
  const canAdjust = isAdmin(access.employee.role)
  const initialData = await loadLoyaltyDashboard('', canAdjust).catch(() => null)

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-[#f6f7f9] text-slate-950">
        <PageHeader
          employeeName={access.employee.fullName}
          role={access.employee.role}
          userId={access.user.id}
          showBack
        />
        <main className="mx-auto w-full max-w-[92rem] px-4 pb-12 pt-20 sm:px-6 sm:pt-7 lg:px-8">
          <LoyaltyClient initialData={initialData} canAdjust={canAdjust} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
