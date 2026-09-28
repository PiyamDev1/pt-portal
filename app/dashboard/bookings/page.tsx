import dynamic from 'next/dynamic'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { BookingStatus } from '@/app/types/bookings'
import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'

const BookingsClient = dynamic(() => import('./BookingsClient'), {
  loading: () => (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="h-96 animate-pulse rounded-[2rem] border border-slate-200 bg-white" />
    </div>
  ),
})

interface BranchLocationOption {
  id: string
  name: string
  branch_code?: string | null
  appointments_enabled?: boolean | null
}

export default async function BookingsDashboard({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>
}) {
  const params = await searchParams
  const requestedStatus = Array.isArray(params.status) ? params.status[0] : params.status
  const initialStatus = Object.values(BookingStatus).includes(requestedStatus as BookingStatus)
    ? (requestedStatus as BookingStatus)
    : 'all'
  const { supabase, userId, employeeName, role, location } = await loadDashboardPageContext()
  const userRole = role || 'Employee'
  const isAdmin = ['Admin', 'Master Admin'].includes(userRole)

  const userLocationId = location?.id || null

  let branchLocations: BranchLocationOption[] = []

  // Load appointment-enabled locations so all staff can pick an alternate site
  const { data: locationsData } = await supabase
    .from('locations')
    .select('id, name, branch_code, appointments_enabled')
    .eq('type', 'Branch')
    .eq('appointments_enabled', true)
    .order('name')
  branchLocations = (locationsData || []) as BranchLocationOption[]

  const effectiveUserLocationId =
    // By default, show user's own location if appointment-enabled; otherwise fall back to the next available appointment-enabled site
    location?.appointments_enabled === false ? branchLocations[0]?.id || null : location?.id || null

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50">
        <PageHeader
          employeeName={employeeName}
          role={userRole}
          location={location}
          userId={userId}
          showBack={true}
        />
        <BookingsClient
          isAdmin={isAdmin}
          userLocationId={effectiveUserLocationId}
          branchLocations={branchLocations}
          initialStatus={initialStatus}
        />
      </div>
    </DashboardClientWrapper>
  )
}
