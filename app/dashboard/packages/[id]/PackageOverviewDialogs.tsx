'use client'

import { useEffect, useRef, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Copy,
  Download,
  FileImage,
  FileText,
  Link2,
  Loader2,
  PackageCheck,
  Pencil,
  Printer,
  X,
} from 'lucide-react'
import type {
  PackageCombination,
  PackageQuotePayload,
  TravelPackageDocument,
  TravelPackageDocumentCategory,
  TravelPackageFolder,
  TravelPackageInvoice,
  TravelPackageInvoiceLine,
} from '@/app/types/packages'
import { formatMoney } from '@/lib/packageQuote'
import type { InvoiceFormState } from './packageOverviewTypes'
import {
  CUSTOMER_PORTAL_URL,
  formatFileSize,
  formatPaymentMethod,
  getVisaPassengerCategoryLabel,
  getVisaQuantity,
} from './packageOverviewModel'
import type { VisaPassengerCounts } from './packageOverviewModel'

type DialogSurfaceProps = {
  label: string
  onClose: () => void
  overlayClassName: string
  surfaceClassName: string
  children: ReactNode
}

function DialogSurface({
  label,
  onClose,
  overlayClassName,
  surfaceClassName,
  children,
}: DialogSurfaceProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    document.body.style.overflow = 'hidden'

    const animationFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current
      const firstFocusable = dialog?.querySelector<HTMLElement>(focusableSelector)
      if (firstFocusable) firstFocusable.focus()
      else dialog?.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)]
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [])

  return (
    <div className={overlayClassName}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={surfaceClassName}
      >
        {children}
      </div>
    </div>
  )
}

type PackageOverviewDialogsProps = {
  showAccessVoucher: boolean
  setShowAccessVoucher: Dispatch<SetStateAction<boolean>>
  accessVoucherQr: string
  accessVoucherCopyMessage: string
  accessVoucherDetailsText: string
  copyAccessVoucherText: (text: string, message: string) => Promise<void>
  printStandaloneAccessVoucher: () => void
  quoteCustomerFirstName: string
  quoteCustomerLastName: string
  showQuoteSnapshot: boolean
  setShowQuoteSnapshot: Dispatch<SetStateAction<boolean>>
  selectedCombination: PackageCombination | null
  selectedPayload: PackageQuotePayload | undefined
  selectedVisaPassengerCounts: VisaPassengerCounts
  passengerSummary: TravelPackageFolder['passenger_summary'] | undefined
  quoteTitle: string
  quoteDateRange: string
  quoteCustomerName: string
  quoteCustomerPhone: string
  quoteCustomerEmail: string
  quoteSelectionNote: string
  groupQuoteFamilies: Array<{ quoteId: string; familyLabel: string; customerName: string }>
  selectedGroupQuoteId: string
  onSelectGroupQuote: (quoteId: string) => void
  packageFolder: TravelPackageFolder
  showInvoicePreview: boolean
  setShowInvoicePreview: Dispatch<SetStateAction<boolean>>
  invoice: TravelPackageInvoice | null
  invoicePreviewLines: TravelPackageInvoiceLine[]
  invoicePreviewDueDate: string
  invoiceCurrency: string
  invoiceSubtotalSold: number
  invoiceDiscountTotal: number
  invoiceTotalSold: number
  invoiceTotalPaid: number
  invoiceBalanceDue: number
  invoiceForm: InvoiceFormState
  photoLinkDocument: TravelPackageDocument | null
  setPhotoLinkDocument: Dispatch<SetStateAction<TravelPackageDocument | null>>
  savingDocument: boolean
  draggingDocumentCategory: TravelPackageDocumentCategory | null
  setDraggingDocumentCategory: Dispatch<SetStateAction<TravelPackageDocumentCategory | null>>
  uploadVisaPhotoFiles: (
    files: FileList | File[],
    linkedTravelDocument?: TravelPackageDocument,
  ) => Promise<void>
  visaPhotosByTravelDocumentId: Record<string, TravelPackageDocument[]>
  previewDocument: TravelPackageDocument | null
  setPreviewDocument: Dispatch<SetStateAction<TravelPackageDocument | null>>
  previewDocumentUrl: string
  setPreviewDocumentUrl: Dispatch<SetStateAction<string>>
  previewDocumentLoading: boolean
  previewDocumentIsImage: boolean
  previewDocumentIsPdf: boolean
}

export default function PackageOverviewDialogs({
  showAccessVoucher,
  setShowAccessVoucher,
  accessVoucherQr,
  accessVoucherCopyMessage,
  accessVoucherDetailsText,
  copyAccessVoucherText,
  printStandaloneAccessVoucher,
  quoteCustomerFirstName,
  quoteCustomerLastName,
  showQuoteSnapshot,
  setShowQuoteSnapshot,
  selectedCombination,
  selectedPayload,
  selectedVisaPassengerCounts,
  passengerSummary,
  quoteTitle,
  quoteDateRange,
  quoteCustomerName,
  quoteCustomerPhone,
  quoteCustomerEmail,
  quoteSelectionNote,
  groupQuoteFamilies,
  selectedGroupQuoteId,
  onSelectGroupQuote,
  packageFolder,
  showInvoicePreview,
  setShowInvoicePreview,
  invoice,
  invoicePreviewLines,
  invoicePreviewDueDate,
  invoiceCurrency,
  invoiceSubtotalSold,
  invoiceDiscountTotal,
  invoiceTotalSold,
  invoiceTotalPaid,
  invoiceBalanceDue,
  invoiceForm,
  photoLinkDocument,
  setPhotoLinkDocument,
  savingDocument,
  draggingDocumentCategory,
  setDraggingDocumentCategory,
  uploadVisaPhotoFiles,
  visaPhotosByTravelDocumentId,
  previewDocument,
  setPreviewDocument,
  previewDocumentUrl,
  setPreviewDocumentUrl,
  previewDocumentLoading,
  previewDocumentIsImage,
  previewDocumentIsPdf,
}: PackageOverviewDialogsProps) {
  return (
    <>
      {showAccessVoucher && (
        <DialogSurface
          label="Share customer access"
          onClose={() => setShowAccessVoucher(false)}
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          surfaceClassName="relative w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
        >
          <button
            type="button"
            onClick={() => setShowAccessVoucher(false)}
            className="absolute right-4 top-4 text-slate-400 transition hover:text-slate-800"
            aria-label="Close access voucher"
          >
            <X className="h-6 w-6" />
          </button>
          <h2 className="text-2xl font-black text-slate-950">Share Customer Access</h2>
          <p className="mt-2 text-sm text-slate-500">
            Share these details with your customer to access their portal.
          </p>

          <div className="mt-6 grid gap-5 rounded-lg border border-slate-200 bg-slate-50 p-6 md:grid-cols-[1fr_1.35fr_1fr] md:items-center">
            <div className="flex items-center justify-center md:border-r md:border-slate-200 md:pr-6">
              <Image
                src="/logo.png"
                alt="Piyam Travel Logo"
                width={128}
                height={64}
                className="h-auto w-32 object-contain"
              />
            </div>

            <div className="text-center md:border-r md:border-slate-200 md:px-6">
              <p className="text-sm text-slate-500">Customer</p>
              <p className="text-xl font-black text-slate-950">
                {quoteCustomerFirstName} {quoteCustomerLastName}
              </p>
              <p className="mt-4 text-sm text-slate-500">Reference Number</p>
              <p className="inline-block rounded-md border border-red-200 bg-red-50 px-2 py-1 font-mono text-xl text-[#8b1e2d]">
                {packageFolder.package_reference}
              </p>
              <p className="mt-4 text-sm text-slate-500">Login Website</p>
              <p className="text-lg font-black text-slate-950">
                {CUSTOMER_PORTAL_URL.replace('https://', '')}
              </p>
            </div>

            <div className="flex items-center justify-center">
              <div className="rounded-md border bg-white p-2 shadow-sm">
                {accessVoucherQr ? (
                  <Image
                    src={accessVoucherQr}
                    alt="Customer portal QR code"
                    width={128}
                    height={128}
                    unoptimized
                    className="h-32 w-32"
                  />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center text-xs font-bold text-slate-500">
                    QR loading
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <button
              type="button"
              onClick={printStandaloneAccessVoucher}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#8b1e2d] bg-white px-4 text-sm font-black text-[#8b1e2d] transition hover:bg-red-50"
            >
              <Printer className="h-5 w-5" />
              Print Access Voucher
            </button>
            <button
              type="button"
              onClick={() => void copyAccessVoucherText(CUSTOMER_PORTAL_URL, 'Link copied')}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-200 px-4 text-sm font-black text-slate-800 transition hover:bg-slate-300"
            >
              <Link2 className="h-5 w-5" />
              Copy Link
            </button>
            <button
              type="button"
              onClick={() => void copyAccessVoucherText(accessVoucherDetailsText, 'Details copied')}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#a1171d] px-4 text-sm font-black text-white shadow-md transition hover:bg-[#861116]"
            >
              <Copy className="h-5 w-5" />
              Copy Details as Text
            </button>
          </div>

          {accessVoucherCopyMessage && (
            <p className="mt-4 text-center text-sm font-black text-emerald-600">
              {accessVoucherCopyMessage}
            </p>
          )}
        </DialogSurface>
      )}

      {showQuoteSnapshot && selectedCombination && (
        <DialogSurface
          label={`Final quotation: ${quoteTitle}`}
          onClose={() => setShowQuoteSnapshot(false)}
          overlayClassName="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4"
          surfaceClassName="my-8 w-full max-w-4xl rounded-xl bg-white shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Final quotation</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">{quoteTitle}</h2>
              <p className="mt-1 text-sm font-bold text-slate-600">
                {packageFolder.package_reference} · {quoteDateRange}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowQuoteSnapshot(false)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
              aria-label="Close final quotation snapshot"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-5 p-5">
            {groupQuoteFamilies.length > 0 && (
              <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3">
                <p className="text-xs font-black uppercase text-cyan-900">Family quotation</p>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {groupQuoteFamilies.map((family) => (
                    <button
                      key={family.quoteId}
                      type="button"
                      onClick={() => onSelectGroupQuote(family.quoteId)}
                      className={`min-h-10 shrink-0 rounded-lg px-4 text-sm font-black transition ${
                        selectedGroupQuoteId === family.quoteId
                          ? 'bg-cyan-900 text-white'
                          : 'border border-cyan-200 bg-white text-cyan-900 hover:bg-cyan-100'
                      }`}
                    >
                      {family.familyLabel}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase text-slate-500">Customer</p>
                <p className="mt-1 text-sm font-black text-slate-950">{quoteCustomerName}</p>
                <p className="mt-1 text-xs text-slate-500">{quoteCustomerPhone}</p>
                <p className="mt-1 break-all text-xs text-slate-500">{quoteCustomerEmail}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase text-slate-500">Passengers</p>
                <p className="mt-1 text-sm font-black text-slate-950">
                  {passengerSummary?.totalPassengers ?? selectedCombination.servicePassengers} total
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {passengerSummary?.adults ?? selectedPayload?.adults ?? 0} adults ·{' '}
                  {passengerSummary?.childrenPaying ?? selectedPayload?.childrenPaying ?? 0}{' '}
                  children 5+ ·{' '}
                  {passengerSummary?.childrenFree ?? selectedPayload?.childrenFree ?? 0} children
                  2-5 · {passengerSummary?.infants ?? selectedPayload?.infants ?? 0} infants under 2
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase text-slate-500">Final sold total</p>
                <p className="mt-1 text-sm font-black text-slate-950">
                  {formatMoney(selectedCombination.totalPrice, selectedCombination.currency)}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {formatPaymentMethod(selectedCombination.paymentMethod)}
                  {selectedCombination.paymentSurchargeTotal > 0
                    ? ` · ${formatMoney(
                        selectedCombination.paymentSurchargeTotal,
                        selectedCombination.currency,
                      )} processing fee`
                    : ''}
                </p>
                <p className="mt-1 text-xs font-bold text-[#8b1e2d]">
                  {formatMoney(selectedCombination.perPersonPrice, selectedCombination.currency)}{' '}
                  avg hotel payer
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {selectedCombination.flightOption && (
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Flight</p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {selectedCombination.flightOption.title}
                  </p>
                  {selectedCombination.flightOption.summary && (
                    <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">
                      {selectedCombination.flightOption.summary}
                    </p>
                  )}
                </div>
              )}
              {selectedCombination.visaOptions.length > 0 && (
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Visa</p>
                  <div className="mt-1 space-y-2">
                    {selectedCombination.visaOptions.map((option) => (
                      <div key={option.id}>
                        <p className="text-sm font-black text-slate-950">
                          {getVisaQuantity(option, selectedVisaPassengerCounts)} x{' '}
                          {getVisaPassengerCategoryLabel(option.visaPassengerCategory)}{' '}
                          {option.title}
                        </p>
                        {option.summary && (
                          <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">
                            {option.summary}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedCombination.transportOption && (
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Transport</p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {selectedCombination.transportOption.title}
                  </p>
                  {selectedCombination.transportOption.summary && (
                    <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">
                      {selectedCombination.transportOption.summary}
                    </p>
                  )}
                </div>
              )}
              {selectedCombination.staySelections.map((stay) => (
                <div key={stay.groupId} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">{stay.groupLabel}</p>
                  <p className="mt-1 text-sm font-black text-slate-950">{stay.option.title}</p>
                  {stay.option.summary && (
                    <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">
                      {stay.option.summary}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {selectedCombination.offerDiscountTotal > 0 && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                Discount applied:{' '}
                {formatMoney(selectedCombination.offerDiscountTotal, selectedCombination.currency)}
              </p>
            )}

            {quoteSelectionNote && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600">
                <span className="font-black text-slate-800">Selection note:</span>{' '}
                {quoteSelectionNote}
              </p>
            )}
          </div>

          {packageFolder.source_quote_id && (
            <div className="flex flex-col gap-2 border-t border-slate-200 p-5 sm:flex-row sm:justify-end">
              <Link
                href={`/dashboard/packages/quotations/${packageFolder.source_quote_id}/edit`}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-100"
              >
                <Pencil className="h-4 w-4" />
                Edit Quote
              </Link>
              <Link
                href={`/dashboard/packages/quotations/${packageFolder.source_quote_id}/sales`}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-black text-white transition hover:bg-slate-800"
              >
                <PackageCheck className="h-4 w-4" />
                Sales Mode
              </Link>
            </div>
          )}
        </DialogSurface>
      )}

      {showInvoicePreview && invoice && (
        <DialogSurface
          label={`Customer invoice preview: ${invoice.invoice_number}`}
          onClose={() => setShowInvoicePreview(false)}
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
          surfaceClassName="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        >
          <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Customer invoice preview</p>
              <h3 className="mt-1 text-xl font-black text-slate-950">{invoice.invoice_number}</h3>
              <p className="mt-1 text-sm font-bold text-slate-500">
                Preview only. Internal costs, margin, and commission are hidden.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowInvoicePreview(false)}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-black text-white transition hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
              Close
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-4">
            <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500">Bill to</p>
                  <p className="mt-1 text-lg font-black text-slate-950">{quoteCustomerName}</p>
                  {packageFolder.customer_email && (
                    <p className="mt-1 text-sm font-bold text-slate-500">
                      {packageFolder.customer_email}
                    </p>
                  )}
                  {packageFolder.customer_phone && (
                    <p className="mt-1 text-sm font-bold text-slate-500">
                      {packageFolder.customer_phone}
                    </p>
                  )}
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xs font-bold uppercase text-slate-500">Package reference</p>
                  <p className="mt-1 text-lg font-black text-[#8b1e2d]">
                    {packageFolder.package_reference}
                  </p>
                  <p className="mt-2 text-xs font-bold uppercase text-slate-500">Due</p>
                  <p className="mt-1 text-sm font-black text-slate-950">{invoicePreviewDueDate}</p>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
                <div className="grid grid-cols-[minmax(0,1fr)_7rem_8rem] gap-3 bg-slate-900 px-4 py-3 text-xs font-black uppercase text-white">
                  <span>Description</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Amount</span>
                </div>
                {invoicePreviewLines.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {invoicePreviewLines.map((line) => (
                      <div
                        key={line.id}
                        className="grid grid-cols-[minmax(0,1fr)_7rem_8rem] gap-3 px-4 py-3 text-sm text-slate-700"
                      >
                        <div className="min-w-0">
                          <p className="font-black text-slate-950">{line.description}</p>
                          <p className="mt-1 text-xs font-bold capitalize text-slate-500">
                            {line.line_type}
                          </p>
                        </div>
                        <p className="text-right font-bold">
                          {Number(line.quantity || 0).toLocaleString('en-GB')}
                        </p>
                        <div className="text-right">
                          <p className="font-black text-slate-950">
                            {formatMoney(
                              line.total_sold_price - line.discount_amount,
                              invoiceCurrency,
                            )}
                          </p>
                          {line.discount_amount > 0 && (
                            <p className="mt-1 text-xs font-bold text-emerald-700">
                              Discount {formatMoney(line.discount_amount, invoiceCurrency)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 py-6 text-center text-sm font-bold text-slate-500">
                    No customer-visible invoice lines yet.
                  </p>
                )}
              </div>

              <div className="mt-5 ml-auto max-w-sm space-y-2 rounded-lg bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-bold text-slate-500">Subtotal</span>
                  <span className="font-black text-slate-950">
                    {formatMoney(invoiceSubtotalSold, invoiceCurrency)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-bold text-slate-500">Discount</span>
                  <span className="font-black text-emerald-700">
                    -{formatMoney(invoiceDiscountTotal, invoiceCurrency)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-2 text-base">
                  <span className="font-black text-slate-950">Total</span>
                  <span className="font-black text-slate-950">
                    {formatMoney(invoiceTotalSold, invoiceCurrency)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-bold text-slate-500">Paid</span>
                  <span className="font-black text-slate-950">
                    {formatMoney(invoiceTotalPaid, invoiceCurrency)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-lg bg-[#8b1e2d] px-3 py-2 text-base text-white">
                  <span className="font-black">Balance due</span>
                  <span className="font-black">
                    {formatMoney(invoiceBalanceDue, invoiceCurrency)}
                  </span>
                </div>
              </div>

              {invoiceForm.customerTerms.trim() && (
                <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold uppercase text-slate-500">Terms</p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
                    {invoiceForm.customerTerms}
                  </p>
                </div>
              )}
            </div>
          </div>
        </DialogSurface>
      )}

      {photoLinkDocument && (
        <DialogSurface
          label={`Link visa photo: ${photoLinkDocument.title}`}
          onClose={() => setPhotoLinkDocument(null)}
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
          surfaceClassName="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-slate-500">Link visa photo</p>
              <h3 className="mt-1 truncate text-lg font-black text-slate-950">
                {photoLinkDocument.title}
              </h3>
              <p className="mt-1 break-all text-xs font-bold text-slate-500">
                Photos uploaded here stay in Travel Documents and link back to this file.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPhotoLinkDocument(null)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200"
              aria-label="Close photo upload"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4">
            <label
              onDragOver={(event) => {
                event.preventDefault()
                setDraggingDocumentCategory('travel_documents')
              }}
              onDragLeave={() => setDraggingDocumentCategory(null)}
              onDrop={(event) => {
                event.preventDefault()
                setDraggingDocumentCategory(null)
                const files = event.dataTransfer.files
                if (files?.length) {
                  void uploadVisaPhotoFiles(files, photoLinkDocument)
                }
              }}
              className={`flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition ${
                draggingDocumentCategory === 'travel_documents'
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-indigo-200 bg-indigo-50/60 hover:border-indigo-400'
              }`}
            >
              <input
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp"
                className="sr-only"
                disabled={savingDocument}
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files || [])
                  event.currentTarget.value = ''
                  if (files.length) {
                    void uploadVisaPhotoFiles(files, photoLinkDocument)
                  }
                }}
              />
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-900 text-white">
                {savingDocument ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <FileImage className="h-5 w-5" />
                )}
              </span>
              <span className="mt-3 block text-sm font-black text-slate-950">
                Upload photo for this travel document
              </span>
              <span className="mt-1 block text-xs font-semibold leading-5 text-slate-600">
                Drop image files here or click to select photos.
              </span>
            </label>
            {(visaPhotosByTravelDocumentId[photoLinkDocument.id] || []).length > 0 && (
              <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
                <p className="text-xs font-black uppercase text-indigo-700">Already linked</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(visaPhotosByTravelDocumentId[photoLinkDocument.id] || []).map((photo) => (
                    <div key={photo.id} className="min-w-0 rounded-lg bg-white px-3 py-2">
                      <p
                        className="truncate text-xs font-black text-indigo-950"
                        title={photo.title}
                      >
                        {photo.title}
                      </p>
                      <p
                        className="mt-0.5 truncate text-[11px] font-bold text-indigo-700"
                        title={photo.file_name}
                      >
                        {photo.file_name}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogSurface>
      )}

      {previewDocument && (
        <DialogSurface
          label={`Document preview: ${previewDocument.title}`}
          onClose={() => {
            setPreviewDocument(null)
            setPreviewDocumentUrl('')
          }}
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
          surfaceClassName="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        >
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-slate-500">Document preview</p>
              <h3 className="mt-1 truncate text-lg font-black text-slate-950">
                {previewDocument.title}
              </h3>
              <p className="mt-1 break-all text-xs font-bold text-slate-500">
                {previewDocument.file_name} · {formatFileSize(previewDocument.file_size)}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {previewDocumentUrl && (
                <button
                  type="button"
                  onClick={() => window.open(previewDocumentUrl, '_blank', 'noopener,noreferrer')}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                >
                  <Download className="h-4 w-4" />
                  Open
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setPreviewDocument(null)
                  setPreviewDocumentUrl('')
                }}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-black text-white transition hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
                Close
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden bg-slate-100 p-4">
            {previewDocumentLoading ? (
              <div className="flex h-full items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Preparing preview
              </div>
            ) : previewDocumentUrl && previewDocumentIsImage ? (
              <div className="flex h-full items-center justify-center rounded-xl border border-slate-200 bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewDocumentUrl}
                  alt={previewDocument.title}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : previewDocumentUrl && previewDocumentIsPdf ? (
              <iframe
                title={`Preview ${previewDocument.title}`}
                src={previewDocumentUrl}
                className="h-full w-full rounded-xl border border-slate-200 bg-white"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
                <FileText className="h-10 w-10 text-slate-400" />
                <p className="mt-3 text-sm font-black text-slate-900">
                  Preview is not available for this file type.
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Use Open to view or download the document.
                </p>
              </div>
            )}
          </div>
        </DialogSurface>
      )}
    </>
  )
}
