import type { Metadata } from 'next'
import { isSuperAdmin } from '@/lib/auth/superAdmin'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import { TicketingRefundReplacementWorkspace } from '../TicketingRefundReplacementWorkspace'

export const metadata: Metadata = {
  title: 'Refunds & Replacements - PT Portal',
  description:
    'Handle ticket refunds, cancellations, exchanges and multi-ticket replacement cases',
}

export default async function RefundCalculatorPage() {
  const access = await requireTicketingAccess()
  const superAdmin = access.authorized && isSuperAdmin(access.employee.role)
  return (
    <TicketingRefundReplacementWorkspace isSuperAdmin={superAdmin} />
  )
}
