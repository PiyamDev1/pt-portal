/**
 * Ticketing System Page
 *
 * Front-end ticketing workspace. Ticket ledger/refund persistence is not
 * connected yet; the page defines the intended tools and flight-change flow.
 *
 * @module app/dashboard/ticketing/page
 */
import { TicketingDashboard } from './TicketingDashboard'

export const metadata = {
  title: 'Ticketing - PT Portal',
  description: 'Ticketing tools and upcoming-flight schedule monitoring',
}

export default function TicketingPage() {
  return <TicketingDashboard />
}
