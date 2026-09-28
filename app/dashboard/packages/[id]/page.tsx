import PageHeader from '@/app/components/PageHeader.client'
import type { PackageEmployeeOption, PackageLocationOption } from './packageOverviewTypes'
import PackageOverviewClient from './PackageOverviewClient'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'

export const metadata = {
  title: 'Package Folder - PT Portal',
  description: 'View a travel package operational folder',
}

export default async function TravelPackageFolderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase, userId, employeeName, role, location } = await loadDashboardPageContext()
  const currentUserRole = role || 'Employee'
  const [{ data: employeeRows }, { data: locationRows }] = await Promise.all([
    supabase
      .from('employees')
      .select('id, full_name, email, location_id, locations(id, name, branch_code)')
      .eq('is_active', true)
      .order('full_name', { ascending: true }),
    supabase.from('locations').select('id, name, branch_code').order('name', { ascending: true }),
  ])
  const employees = (employeeRows || []) as PackageEmployeeOption[]
  const locations = (locationRows || []) as PackageLocationOption[]

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
          <PackageOverviewClient packageId={id} employees={employees} locations={locations} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
