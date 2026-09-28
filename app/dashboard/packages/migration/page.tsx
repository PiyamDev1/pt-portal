import { redirect } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import PackageMigrationClient from './PackageMigrationClient'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'

export const metadata = { title: 'Package Migration - PT Portal' }

export default async function PackageMigrationPage() {
  const { userId, employeeName, role, location } = await loadDashboardPageContext()
  const currentUserRole = role || 'Employee'
  if (currentUserRole.trim().toLowerCase() !== 'super admin') {
    redirect('/dashboard/packages')
  }
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
          <PackageMigrationClient />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
