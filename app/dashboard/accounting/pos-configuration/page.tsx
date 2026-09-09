import PosConfigurationClient from './PosConfigurationClient'

export const metadata = {
  title: 'POS configuration - PT Portal',
  description: 'Manage POS categories, services and supplier assignments',
}

export default function PosConfigurationPage() {
  return <PosConfigurationClient />
}
