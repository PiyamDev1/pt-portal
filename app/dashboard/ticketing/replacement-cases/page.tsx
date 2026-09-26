import type { Metadata } from 'next'
import { ReplacementCasesClient } from './ReplacementCasesClient'

export const metadata: Metadata = {
  title: 'Replacement Cases - PT Portal',
  description: 'Guided multi-ticket replacement and later-change records',
}

export default function TicketReplacementCasesPage() {
  return <ReplacementCasesClient />
}
