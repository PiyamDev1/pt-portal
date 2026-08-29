import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireStaffSession, type StaffSession } from '@/lib/auth/staffSession'

export type CommissionAccessResult =
  | ({ authorized: true; response?: never } & StaffSession)
  | { authorized: false; response: NextResponse }

export async function requireCommissionPolicyAccess(): Promise<CommissionAccessResult> {
  const access = await requireStaffSession()
  if (!access.authorized) return access

  const { data, error } = await getServiceSupabaseClient().rpc(
    'commission_actor_can_manage_2026082901',
    { p_employee_id: access.employee.id },
  )
  if (error) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Commission access could not be verified.' },
        { status: 503 },
      ),
    }
  }
  if (data !== true) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return access
}
