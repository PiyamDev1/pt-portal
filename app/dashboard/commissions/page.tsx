import { redirect } from 'next/navigation'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import PageHeader from '@/app/components/PageHeader.client'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireStaffSession } from '@/lib/auth/staffSession'
import CommissionConsole from './CommissionConsole'

export const metadata = {
  title: 'Commission Shadow Console - PT Portal',
  description: 'Configure and reconcile non-payable Commission shadow calculations',
}

export default async function CommissionsPage() {
  const access = await requireStaffSession()
  if (!access.authorized) redirect('/login')

  const { data: canManage, error } = await getServiceSupabaseClient().rpc(
    'commission_actor_can_manage_2026082901',
    { p_employee_id: access.employee.id },
  )
  if (error || canManage !== true) redirect('/dashboard')

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-950 text-white">
        <PageHeader
          employeeName={access.employee.fullName}
          role={access.employee.role}
          userId={access.user.id}
        />
        <CommissionConsole />
      </div>
    </DashboardClientWrapper>
  )
}
