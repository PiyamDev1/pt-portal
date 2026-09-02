import CommissionReviewBatchesClient from './CommissionReviewBatchesClient'

export const metadata = {
  title: 'Commission Review - Accounting - PT Portal',
  description: 'Review Commission batches submitted to Accounting',
}

export default function AccountingCommissionPage() {
  return <CommissionReviewBatchesClient />
}
