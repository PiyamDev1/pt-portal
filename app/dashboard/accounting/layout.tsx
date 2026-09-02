import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireAccountingAccess } from '@/lib/accounting/access'

export default async function AccountingLayout({ children }: { children: ReactNode }) {
  const access = await requireAccountingAccess()
  if (!access.authorized) {
    redirect(access.response.status === 401 ? '/login' : '/dashboard')
  }

  const { data: employee } = await getServiceSupabaseClient()
    .from('employees')
    .select('locations(name, branch_code)')
    .eq('id', access.employee.id)
    .single()

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations

  return (
    <DashboardClientWrapper>
      <div className="flex min-h-screen flex-col bg-slate-50">
        <PageHeader
          employeeName={access.employee.fullName}
          role={access.employee.role}
          location={location}
          userId={access.user.id}
          showBack
        />
        <main className="mx-auto w-full max-w-7xl flex-grow px-4 pb-8 pt-20 sm:px-6 sm:pt-8">
          {children}
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
