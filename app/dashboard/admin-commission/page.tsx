import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import {
  getCommissionPageIdentity,
  loadCommissionAdminData,
  requireCommissionManager,
} from '@/lib/commissions/server'
import AdminCommissionClient from './AdminCommissionClient'

export const metadata: Metadata = {
  title: 'Admin commission - PT Portal',
  description: 'Manage independent employee commission agreements and calculation health',
}

export const dynamic = 'force-dynamic'

export default async function AdminCommissionPage() {
  const access = await requireCommissionManager()
  if (!access.authorized) {
    redirect(access.response.status === 401 ? '/login' : '/dashboard')
  }

  const [identity, data] = await Promise.all([
    getCommissionPageIdentity(access),
    loadCommissionAdminData(access.employee.id, access.supabase),
  ])

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-[#f6f7f9]">
        <PageHeader
          employeeName={identity.fullName}
          role={identity.role}
          location={identity.location}
          userId={identity.userId}
          showBack
        />
        <main className="mx-auto w-full max-w-[92rem] px-4 pb-12 pt-20 sm:px-6 sm:pt-7 lg:px-8">
          <AdminCommissionClient initialData={data} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
