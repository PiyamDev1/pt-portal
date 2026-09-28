import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import PageHeader from '@/app/components/PageHeader.client'
import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'
import PackageGroupsClient from './PackageGroupsClient'

export const metadata = {
  title: 'Group Packages - PT Portal',
  description: 'Manage linked travel package groups and their shared customer links',
}

export default async function PackageGroupsPage() {
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
          <PackageGroupsClient currentUserRole={currentUserRole} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
