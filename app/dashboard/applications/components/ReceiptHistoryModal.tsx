/**
 * Shared receipt history modal for applications dashboards.
 */

'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ModalBase } from '@/components/ModalBase'
import { useReceipt, type ReceiptSummary, type ReceiptServiceType } from '@/hooks'

type ReceiptHistoryModalProps = {
  isOpen: boolean
  onClose: () => void
  applicantId?: string | null
  serviceType: ReceiptServiceType
  title?: string
}

export default function ReceiptHistoryModal({
  isOpen,
  onClose,
  applicantId,
  serviceType,
  title = 'Receipt History',
}: ReceiptHistoryModalProps) {
  const { listReceipts, loading } = useReceipt()
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    if (!isOpen || !applicantId) {
      setReceipts([])
      return
    }

    let active = true
    setLoadingHistory(true)

    listReceipts({ applicantId, serviceType })
      .then((result) => {
        if (!active) return
        setReceipts(result.receipts || [])
      })
      .catch((error) => {
        if (!active) return
        toast.error(error instanceof Error ? error.message : 'Failed to load receipt history')
      })
      .finally(() => {
        if (active) setLoadingHistory(false)
      })

    return () => {
      active = false
    }
  }, [applicantId, isOpen, listReceipts, serviceType])

  return (
    <ModalBase isOpen={isOpen} onClose={onClose} title={title} size="lg" isLoading={loading}>
      {!applicantId ? (
        <div className="text-sm text-slate-500">Select an applicant to view receipt history.</div>
      ) : loadingHistory ? (
        <div className="text-sm text-slate-500" role="status" aria-live="polite">
          Loading receipt history...
        </div>
      ) : receipts.length === 0 ? (
        <div className="text-sm text-slate-500" role="status" aria-live="polite">
          No receipts found for this applicant.
        </div>
      ) : (
        <div className="space-y-3">
          {receipts.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-slate-200 bg-slate-50 p-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="text-xs text-slate-500 uppercase tracking-wide">{item.receiptType}</div>
                <div className="text-sm font-semibold text-slate-800 truncate">
                  {item.trackingNumber || 'No tracking number'}
                </div>
                <div className="text-xs text-slate-500">
                  Generated: {new Date(item.generatedAt).toLocaleString('en-GB')}
                </div>
                <div className="text-xs text-slate-500">
                  Shares: {item.shareCount || 0}
                  {item.sharedAt ? ` • Last shared: ${new Date(item.sharedAt).toLocaleString('en-GB')}` : ''}
                  {item.sharedVia ? ` • Via: ${item.sharedVia}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ModalBase>
  )
}
