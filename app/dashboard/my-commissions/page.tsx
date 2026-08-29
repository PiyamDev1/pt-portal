import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { getCommissionPageIdentity, loadMyCommissionData } from '@/lib/commissions/server'
import MyCommissionsView from './MyCommissionsView'

export const metadata: Metadata = {
  title: 'My commissions - PT Portal',
  description: 'Review your commission agreement and calculated earnings',
}

export const dynamic = 'force-dynamic'

export default async function MyCommissionsPage() {
  const access = await requireStaffSession()
  if (!access.authorized) {
    redirect(access.response.status === 401 ? '/login' : '/dashboard')
  }

  const [identity, data] = await Promise.all([
    getCommissionPageIdentity(access),
    loadMyCommissionData(access.employee.id),
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
        <main className="mx-auto w-full max-w-7xl px-4 pb-12 pt-20 sm:px-6 sm:pt-7 lg:px-8">
          <MyCommissionsView data={data} employeeName={identity.fullName} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
