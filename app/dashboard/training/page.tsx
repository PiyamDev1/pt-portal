/**
 * Training and Certification Page.
 *
 * Server component that protects the module behind IMS auth and passes the
 * current staff identity into the shared dashboard chrome.
 */

import dynamic from 'next/dynamic'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'

const TrainingClient = dynamic(() => import('./client'), {
  loading: () => (
    <div className="h-96 animate-pulse rounded-[2rem] border border-slate-200 bg-white" />
  ),
})

export const metadata = {
  title: 'Training & Certification - PT Portal',
  description: 'Internal staff training, certification, and compliance tracking',
}

export default async function TrainingPage() {
  const { userId, employeeName, role, location } = await loadDashboardPageContext()

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50">
        <PageHeader
          employeeName={employeeName}
          role={role || 'Employee'}
          location={location}
          userId={userId}
          showBack={true}
        />
        <main className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 md:py-8">
          <TrainingClient />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
