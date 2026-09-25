import type { Metadata } from 'next'
import { isSuperAdmin } from '@/lib/auth/superAdmin'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import { TicketCancellationCalculator } from './TicketCancellationCalculator'
import { RefundRegister } from './RefundRegister'

export const metadata: Metadata = {
  title: 'Ticket Cancellation Calculator - PT Portal',
  description:
    'Preview ticket cancellation charges, customer refunds and safe replacement-ticket adjustments',
}

export default async function RefundCalculatorPage() {
  const access = await requireTicketingAccess()
  const superAdmin = access.authorized && isSuperAdmin(access.employee.role)
  return (
    <div className="space-y-8">
      <TicketCancellationCalculator isSuperAdmin={superAdmin} />
      <RefundRegister />
    </div>
  )
}
