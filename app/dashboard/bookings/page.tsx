import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { redirect } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import BookingsClient from './BookingsClient'

interface BranchLocationOption {
  id: string
  name: string
  branch_code?: string | null
  appointments_enabled?: boolean | null
}

export default async function BookingsDashboard() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('full_name, roles(name), locations(id, name, branch_code, appointments_enabled)')
    .eq('id', session.user.id)
    .single()

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations
  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles
  const userRole = role?.name || 'Employee'
  const isAdmin = ['Admin', 'Master Admin'].includes(userRole)

  const userLocationId = location?.id || null

  let branchLocations: BranchLocationOption[] = []

  if (isAdmin) {
    const { data: locationsData } = await supabase
      .from('locations')
      .select('id, name, branch_code, appointments_enabled')
      .eq('type', 'Branch')
      .eq('appointments_enabled', true)
      .order('name')
    branchLocations = (locationsData || []) as BranchLocationOption[]
  }

  const effectiveUserLocationId = location?.appointments_enabled === false
    ? branchLocations[0]?.id || null
    : location?.id || null

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50">
        <PageHeader
          employeeName={employee?.full_name}
          role={userRole}
          location={location}
          userId={session.user.id}
          showBack={true}
        />
        <BookingsClient
          isAdmin={isAdmin}
          userLocationId={effectiveUserLocationId}
          branchLocations={branchLocations}
        />
      </div>
    </DashboardClientWrapper>
  )
}
