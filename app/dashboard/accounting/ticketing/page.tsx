import TicketingAccountingClient from './TicketingAccountingClient'

export const metadata = {
  title: 'Ticketing Accounting - PT Portal',
  description: 'Monthly ticketing volumes and gross margin by live branch and airline',
}

export default function AccountingTicketingPage() {
  return <TicketingAccountingClient />
}
