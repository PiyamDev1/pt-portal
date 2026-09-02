import CommissionReviewBatchClient from './CommissionReviewBatchClient'

export const metadata = {
  title: 'Commission Batch Review - Accounting - PT Portal',
  description: 'Double-check and approve a submitted Commission batch',
}

export default async function AccountingCommissionBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>
}) {
  const { batchId } = await params
  return <CommissionReviewBatchClient batchId={batchId} />
}
