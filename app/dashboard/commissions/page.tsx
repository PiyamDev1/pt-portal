import { redirect } from 'next/navigation'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireStaffSession } from '@/lib/auth/staffSession'

export const metadata = {
  title: 'Commissions - PT Portal',
  description: 'Commission agreements and calculated earnings',
}

export const dynamic = 'force-dynamic'

/** Keep existing bookmarks working while the staff and admin concerns have separate homes. */
export default async function LegacyCommissionsRedirect() {
  const access = await requireStaffSession()
  if (!access.authorized) redirect('/login')

  const { data: canManage } = await getServiceSupabaseClient().rpc(
    'commission_actor_can_manage_2026082901',
    { p_employee_id: access.employee.id },
  )

  redirect(canManage === true ? '/dashboard/admin-commission' : '/dashboard/my-performance')
}
