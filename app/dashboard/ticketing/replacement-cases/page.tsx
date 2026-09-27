import type { Metadata } from 'next'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import { isSuperAdmin } from '@/lib/auth/superAdmin'
import { TicketingRefundReplacementWorkspace } from '../TicketingRefundReplacementWorkspace'

export const metadata: Metadata = {
  title: 'Refunds & Replacements - PT Portal',
  description: 'Refund and replacement workflows for ticketing adjustments',
}

export default async function TicketReplacementCasesPage() {
  const access = await requireTicketingAccess()
  const superAdmin = access.authorized && isSuperAdmin(access.employee.role)
  return <TicketingRefundReplacementWorkspace isSuperAdmin={superAdmin} initialTab="replacement" />
}
