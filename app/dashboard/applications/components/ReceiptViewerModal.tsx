/**
 * HTML receipt viewer modal.
 */

'use client'

import { ModalBase } from '@/components/ModalBase'
import { toast } from 'sonner'
import { useReceipt, type GeneratedReceipt } from '@/hooks'

type ReceiptViewerModalProps = {
  isOpen: boolean
  onClose: () => void
  receipt: GeneratedReceipt | null
}

function formatSalePrice(receipt: GeneratedReceipt) {
  const value = receipt.pricing.salePrice
  if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A'
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: receipt.pricing.currency || 'GBP',
  }).format(value)
}

function formatGeneratedAt(value: string) {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export default function ReceiptViewerModal({ isOpen, onClose, receipt }: ReceiptViewerModalProps) {
  const { markReceiptShared } = useReceipt()

  const copyTextReceipt = async () => {
    if (!receipt?.plainText) {
      toast.error('No receipt content to copy')
      return
    }

    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      toast.error('Clipboard is unavailable on this device')
      return
    }

    try {
      await navigator.clipboard.writeText(receipt.plainText)
      await markReceiptShared({ receiptId: receipt.id, channel: 'clipboard' })
      toast.success('Receipt copied to clipboard')
    } catch (error) {
      toast.error('Failed to copy receipt')
    }
  }

  return (
    <ModalBase isOpen={isOpen} onClose={onClose} size="lg" title="Receipt Preview">
      {!receipt ? (
        <p className="text-sm text-slate-500">No receipt selected.</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">Piyam Travel Service Receipt</h3>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-slate-700">
              <p>
                <span className="font-semibold">Service:</span> {receipt.serviceName || 'N/A'}
              </p>
              <p>
                <span className="font-semibold">Processing speed:</span>{' '}
                {receipt.processingSpeed || 'Standard'}
              </p>
              <p>
                <span className="font-semibold">Family Head Name:</span>{' '}
                {receipt.familyHeadName || 'N/A'}
              </p>
              <p>
                <span className="font-semibold">Contact Number:</span>{' '}
                {receipt.contactNumber || receipt.phone || 'N/A'}
              </p>
              <p>
                <span className="font-semibold">Applicant Name:</span> {receipt.applicantName || 'N/A'}
              </p>
              <p>
                <span className="font-semibold">Tracking Number:</span>{' '}
                {receipt.trackingNumber || 'N/A'}
              </p>
              <p>
                <span className="font-semibold">Pin:</span> {receipt.receiptPin}
              </p>
              <p>
                <span className="font-semibold">Price:</span> {formatSalePrice(receipt)}
              </p>
              <p className="md:col-span-2">
                <span className="font-semibold">Generated at:</span> {formatGeneratedAt(receipt.generatedAt)}
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">QR Code</p>
                {receipt.qrCodeDataUrl ? (
                  <img
                    src={receipt.qrCodeDataUrl}
                    alt="Receipt QR code"
                    className="mt-1 h-28 w-28 rounded border border-slate-200 bg-white p-1"
                  />
                ) : (
                  <p className="text-xs text-slate-500 mt-1">Unavailable</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
              type="button"
            >
              Close
            </button>
            <button
              onClick={() => void copyTextReceipt()}
              className="px-3 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800"
              type="button"
            >
              Copy Receipt
            </button>
          </div>
        </div>
      )}
    </ModalBase>
  )
}
