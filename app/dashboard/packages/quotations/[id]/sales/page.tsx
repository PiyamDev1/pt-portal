import PageHeader from '@/app/components/PageHeader.client'
import PackageSalesModeClient from './PackageSalesModeClient'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'

export const metadata = {
  title: 'Sales Mode Package Quote - PT Portal',
  description: 'Finalise a package quote selection internally with a customer',
}

export default async function PackageQuoteSalesModePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { userId, employeeName, role, location } = await loadDashboardPageContext()
  const currentUserRole = role || 'Employee'

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50 text-slate-950">
        <PageHeader
          employeeName={employeeName}
          role={currentUserRole}
          location={location}
          userId={userId}
        />

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <PackageSalesModeClient quoteId={id} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
