import ApplicationsAccountingClient from './ApplicationsAccountingClient'

export const metadata = {
  title: 'Application Accounting - PT Portal',
  description: 'Monthly application volumes by service and category',
}

export default function AccountingApplicationsPage() {
  return <ApplicationsAccountingClient />
}
