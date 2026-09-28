import PageHeader from '@/app/components/PageHeader.client'
import PackagesDashboardClient from './PackagesDashboardClient'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'

export const metadata = {
  title: 'Packages - PT Portal',
  description: 'Create and share holidays, ziyarat, and umrah package quotes',
}

export default async function PackagesPage() {
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
          <PackagesDashboardClient currentUserId={userId} currentUserRole={currentUserRole} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
