import type { Metadata } from 'next'
import { TicketingPlaceholder } from '../TicketingPlaceholder'

export const metadata: Metadata = {
  title: 'Refund Calculator - PT Portal',
  description: 'Placeholder for the future ticket refund calculator',
}

export default function RefundCalculatorPage() {
  return <TicketingPlaceholder kind="refund" />
}
