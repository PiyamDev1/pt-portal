import type { Metadata } from 'next'
import { TicketingLedgerClient } from './TicketingLedgerClient'

export const metadata: Metadata = {
  title: 'My Sales Ledger - PT Portal',
  description: 'Fast TK entry and personal ticket records',
}

export default async function TicketingLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string | string[] }>
}) {
  const params = await searchParams
  const requestedSearch = Array.isArray(params.search) ? params.search[0] : params.search
  const initialSearch = String(requestedSearch || '')
    .trim()
    .slice(0, 80)
  return <TicketingLedgerClient initialSearch={initialSearch} />
}
