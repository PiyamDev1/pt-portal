import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'

export default async function TicketingLayout({ children }: { children: ReactNode }) {
  const access = await requireTicketingAccess()
  if (!access.authorized) {
    redirect(access.response.status === 401 ? '/login' : '/dashboard')
  }

  const supabase = getServiceSupabaseClient()
  const { data: employee } = await supabase
    .from('employees')
    .select('locations(name, branch_code)')
    .eq('id', access.employee.id)
    .single()

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50 text-slate-950">
        <PageHeader
          employeeName={access.employee.fullName}
          role={access.employee.role}
          location={location}
          userId={access.user.id}
        />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </DashboardClientWrapper>
  )
}
