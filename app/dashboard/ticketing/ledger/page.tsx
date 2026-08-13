import type { Metadata } from 'next'
import { TicketingPlaceholder } from '../TicketingPlaceholder'

export const metadata: Metadata = {
  title: 'Ticketing Ledger - PT Portal',
  description: 'Placeholder for the future ticketing ledger',
}

export default function TicketingLedgerPage() {
  return <TicketingPlaceholder kind="ledger" />
}
