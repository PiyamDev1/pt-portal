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
  const { listReceipts, markReceiptShared, loading } = useReceipt()
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    if (!isOpen || !applicantId) {
      setReceipts([])
      return
    }

    let active = true
    setLoadingHistory(true)

    listReceipts({ applicantId, serviceType, includePayload: true })
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

  const copyReceipt = async (item: ReceiptSummary) => {
    if (!item.plainText) {
      toast.error('This receipt does not contain copy text')
      return
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(item.plainText)
        await markReceiptShared({ receiptId: item.id, channel: 'clipboard' })
        setReceipts((current) =>
          current.map((receipt) =>
            receipt.id === item.id
              ? {
                  ...receipt,
                  shareCount: Number(receipt.shareCount || 0) + 1,
                  isShared: true,
                  sharedAt: new Date().toISOString(),
                  sharedVia: 'clipboard',
                }
              : receipt,
          ),
        )
        toast.success('Receipt copied to clipboard')
      } else {
        toast.success('Clipboard unavailable on this device')
      }
    } catch (error) {
      toast.error('Failed to copy receipt')
    }
  }

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
              className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-xs text-slate-500 uppercase tracking-wide">{item.receiptType}</div>
                <div className="text-sm font-semibold text-slate-800 truncate">
                  {item.trackingNumber || 'No tracking number'}
                </div>
                <div className="text-xs text-slate-500">
                  {new Date(item.generatedAt).toLocaleString('en-GB')} • Shares: {item.shareCount || 0}
                </div>
              </div>
              <button
                onClick={() => void copyReceipt(item)}
                className="px-3 py-1.5 text-xs rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                type="button"
              >
                Copy
              </button>
            </div>
          ))}
        </div>
      )}
    </ModalBase>
  )
}
