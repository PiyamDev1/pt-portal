import type { Metadata } from 'next'
import { isSuperAdmin } from '@/lib/auth/superAdmin'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import { TicketingRefundReplacementWorkspace } from '../TicketingRefundReplacementWorkspace'

export const metadata: Metadata = {
  title: 'Refunds & Replacements - PT Portal',
  description: 'Handle ticket refunds, cancellations, exchanges and multi-ticket replacement cases',
}

export default async function RefundCalculatorPage({
  searchParams,
}: {
  searchParams: Promise<{ pnr?: string | string[] }>
}) {
  const access = await requireTicketingAccess()
  const superAdmin = access.authorized && isSuperAdmin(access.employee.role)
  const params = await searchParams
  const rawPnr = Array.isArray(params.pnr) ? params.pnr[0] : params.pnr
  const initialPnr = (rawPnr || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 20)
  return <TicketingRefundReplacementWorkspace isSuperAdmin={superAdmin} initialPnr={initialPnr} />
}
