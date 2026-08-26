/**
 * Ticketing System Page
 *
 * Operational ticketing workspace for the ledger, Low Fare and all-agent
 * Flight Monitoring, with the refund calculator kept as a planned submodule.
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
