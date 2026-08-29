import { requireCommissionPolicyAccess } from '@/lib/commissions/apiAuth'
import { commissionError } from '@/lib/commissions/api'

const accessMoved = () =>
  commissionError('Commission access is managed through HR department membership.', 410)

export async function GET() {
  const access = await requireCommissionPolicyAccess()
  if (!access.authorized) return access.response
  return accessMoved()
}

export async function POST() {
  const access = await requireCommissionPolicyAccess()
  if (!access.authorized) return access.response
  return accessMoved()
}
