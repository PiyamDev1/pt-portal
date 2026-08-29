import { requireCommissionPolicyAccess } from '@/lib/commissions/apiAuth'
import { commissionError } from '@/lib/commissions/api'

export async function DELETE() {
  const access = await requireCommissionPolicyAccess()
  if (!access.authorized) return access.response
  return commissionError('Commission access is managed through HR department membership.', 410)
}
