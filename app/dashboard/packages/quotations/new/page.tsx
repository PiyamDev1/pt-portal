import PageHeader from '@/app/components/PageHeader.client'
import PackagesClient from '../../PackagesClient'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'

export const metadata = {
  title: 'New Package Quote - PT Portal',
  description: 'Create a holidays, ziyarat, or umrah package quote',
}

export default async function NewPackageQuotationPage() {
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
          <PackagesClient currentUserId={userId} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
