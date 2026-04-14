/**
 * HTML receipt viewer modal.
 */

'use client'

import { useState } from 'react'
import { ModalBase } from '@/components/ModalBase'
import { toast } from 'sonner'
import { useReceipt, type GeneratedReceipt } from '@/hooks'
import ReceiptHistoryModal from './ReceiptHistoryModal'

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

function normalizeQrSource(value: string | null | undefined) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('data:image/')) return trimmed
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  if (trimmed.startsWith('<svg')) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(trimmed)}`
  }
  return null
}

export default function ReceiptViewerModal({ isOpen, onClose, receipt }: ReceiptViewerModalProps) {
  const { markReceiptShared } = useReceipt()
  const [historyOpen, setHistoryOpen] = useState(false)

  const qrSource = normalizeQrSource(receipt?.qrCodeDataUrl)
  const addressLine1 = process.env.NEXT_PUBLIC_RECEIPT_ADDRESS_LINE1 || 'Piyam Travels'
  const addressLine2 =
    process.env.NEXT_PUBLIC_RECEIPT_ADDRESS_LINE2 || 'Serving UK & International Clients'

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
    <ModalBase isOpen={isOpen} onClose={onClose} size="sm" title="Receipt Preview">
      {!receipt ? (
        <p className="text-sm text-slate-500">No receipt selected.</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm font-mono text-[12px] leading-relaxed relative">
            <button
              onClick={() => setHistoryOpen(true)}
              className="absolute right-3 top-3 h-7 w-7 rounded-full border border-slate-300 text-slate-600 hover:bg-slate-100"
              type="button"
              aria-label="Open receipt history"
              title="Receipt history"
            >
              📚
            </button>

            <div className="pr-10 text-center">
              <img src="/logo.png" alt="Piyam Travels logo" className="mx-auto h-10 w-auto" />
              <p className="mt-1 text-[11px] font-semibold">PIYAM TRAVELS</p>
              <p className="text-[10px] text-slate-600">{addressLine1}</p>
              <p className="text-[10px] text-slate-600">{addressLine2}</p>
              <p className="mt-1 border-t border-dashed border-slate-300 pt-1 text-[10px] text-slate-500">
                RECEIPT COPY
              </p>
            </div>

            <div className="mt-2 space-y-1">
              <p>Service: {receipt.serviceName || 'N/A'}</p>
              <p>Processing: {receipt.processingSpeed || 'Standard'}</p>
              <p>Family Head: {receipt.familyHeadName || 'N/A'}</p>
              <p>Contact: {receipt.contactNumber || receipt.phone || 'N/A'}</p>
              <p>Applicant: {receipt.applicantName || 'N/A'}</p>
              <p>Tracking: {receipt.trackingNumber || 'N/A'}</p>
              <p>PIN: {receipt.receiptPin}</p>
              <p>Price: {formatSalePrice(receipt)}</p>
              <p>Generated: {formatGeneratedAt(receipt.generatedAt)}</p>
            </div>

            <div className="mt-3 border-t border-dashed border-slate-300 pt-2 text-center">
              <p className="text-[10px] text-slate-500">VERIFY QR</p>
              {qrSource ? (
                <>
                  <img
                    src={qrSource}
                    alt="Receipt QR code"
                    className="mx-auto mt-1 h-24 w-24 rounded border border-slate-200 bg-white p-1"
                  />
                  <p className="mt-1 break-all text-[10px] text-slate-500">{receipt.verificationUrl}</p>
                </>
              ) : (
                <p className="mt-1 text-[10px] text-rose-600">
                  QR unavailable. Verify using Tracking + PIN manually.
                </p>
              )}
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

          <ReceiptHistoryModal
            isOpen={historyOpen}
            onClose={() => setHistoryOpen(false)}
            applicantId={receipt.applicantId}
            serviceType={receipt.serviceType}
            title="Receipt History Logs"
          />
        </div>
      )}
    </ModalBase>
  )
}
