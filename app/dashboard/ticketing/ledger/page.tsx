import type { Metadata } from 'next'
import { TicketingLedgerClient } from './TicketingLedgerClient'

export const metadata: Metadata = {
  title: 'My Sales Ledger - PT Portal',
  description: 'Fast TK entry and personal ticket records',
}

export default function TicketingLedgerPage() {
  return <TicketingLedgerClient />
}
