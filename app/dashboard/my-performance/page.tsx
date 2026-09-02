import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { getCommissionPageIdentity } from '@/lib/commissions/server'
import { loadMyPerformanceData } from '@/lib/performance/server'
import {
  currentPerformancePeriod,
  performancePeriodHref,
  resolvePerformancePeriod,
  resolvePerformanceView,
} from '@/lib/performance/view'
import MyPerformanceView from './MyPerformanceView'

export const metadata: Metadata = {
  title: 'My performance - PT Portal',
  description: 'Review your recorded work, attendance and commission earnings',
}

export const dynamic = 'force-dynamic'

export default async function MyPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[]; period?: string | string[] }>
}) {
  const params = await searchParams
  const requestNow = new Date()
  const selectedView = resolvePerformanceView(params.view)
  const selectedPeriod = resolvePerformancePeriod(params.period, requestNow)
  const currentPeriod = currentPerformancePeriod(requestNow)
  const requestedView = Array.isArray(params.view) ? params.view[0] : params.view
  const requestedPeriod = Array.isArray(params.period) ? params.period[0] : params.period
  const access = await requireStaffSession()
  if (!access.authorized) {
    redirect(access.response.status === 401 ? '/login' : '/dashboard')
  }
  if (
    requestedView !== selectedView ||
    requestedPeriod !== selectedPeriod ||
    Array.isArray(params.view) ||
    Array.isArray(params.period)
  ) {
    redirect(performancePeriodHref(selectedView, selectedPeriod))
  }

  const [identity, data] = await Promise.all([
    getCommissionPageIdentity(access),
    loadMyPerformanceData(access.employee.id, requestNow, selectedPeriod),
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
          performancePeriod={selectedPeriod}
        />
        <main className="mx-auto w-full max-w-7xl px-4 pb-12 pt-20 sm:px-6 sm:pt-7 lg:px-8">
          <MyPerformanceView
            data={data}
            employeeName={identity.fullName}
            selectedView={selectedView}
            selectedPeriod={selectedPeriod}
            currentPeriod={currentPeriod}
          />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
