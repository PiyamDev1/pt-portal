import type { Metadata } from 'next'
import { TicketingLedgerClient } from './TicketingLedgerClient'

export const metadata: Metadata = {
  title: 'My Sales Ledger - PT Portal',
  description: 'Fast TK entry and personal ticket records',
}

const LEDGER_STATUS_FILTERS = new Set([
  'all',
  'needs_details',
  'overdue_action',
  'held',
  'issued',
  'expired',
  'cancelled',
  'part_refunded',
  'refunded',
])

export default async function TicketingLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string | string[]; status?: string | string[] }>
}) {
  const params = await searchParams
  const requestedSearch = Array.isArray(params.search) ? params.search[0] : params.search
  const requestedStatus = Array.isArray(params.status) ? params.status[0] : params.status
  const initialSearch = String(requestedSearch || '')
    .trim()
    .slice(0, 80)
  const initialStatus =
    requestedStatus && LEDGER_STATUS_FILTERS.has(requestedStatus) ? requestedStatus : 'all'
  return <TicketingLedgerClient initialSearch={initialSearch} initialStatus={initialStatus} />
}
