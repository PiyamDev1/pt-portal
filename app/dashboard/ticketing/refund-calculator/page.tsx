import type { Metadata } from 'next'
import { TicketCancellationCalculator } from './TicketCancellationCalculator'
import { RefundRegister } from './RefundRegister'

export const metadata: Metadata = {
  title: 'Ticket Cancellation Calculator - PT Portal',
  description:
    'Preview ticket cancellation charges, customer refunds and safe replacement-ticket adjustments',
}

export default function RefundCalculatorPage() {
  return (
    <div className="space-y-8">
      <TicketCancellationCalculator />
      <RefundRegister />
    </div>
  )
}
