import type { Metadata } from 'next'
import { LowFareClient } from './LowFareClient'

export const metadata: Metadata = {
  title: 'Low Fare - PT Portal',
  description: 'Shared issued-ticket queue for supplier fare adjustments',
}

export default function LowFarePage() {
  return <LowFareClient />
}
