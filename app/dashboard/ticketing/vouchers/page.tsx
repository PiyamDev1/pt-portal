import type { Metadata } from 'next'
import { TicketVoucherClient } from './TicketVoucherClient'

export const metadata: Metadata = {
  title: 'Ticket Vouchers - PT Portal',
  description: 'Track cancelled passenger tickets awaiting airline claim or reuse',
}

export default function TicketVouchersPage() {
  return <TicketVoucherClient />
}
