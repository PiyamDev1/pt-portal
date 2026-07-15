'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock3, Download, FileText, Loader2, ReceiptText, Route } from 'lucide-react'
import type { TravelPackageDocument, TravelPackageFolder } from '@/app/types/packages'
import {
  getPackageDocumentCategoryLabel,
  groupPackageDocumentsByCategory,
} from '@/lib/packageDocuments'
import { formatMoney } from '@/lib/packageQuote'

type PackageDocumentPortalClientProps = {
  token: string
}

type PortalResponse = {
  package?: TravelPackageFolder
  documents?: TravelPackageDocument[]
  releasedInvoice?: CustomerInvoiceSnapshot | null
  transportVoucher?: CustomerTransportVoucher | null
  error?: string
}

type CustomerInvoiceLine = {
  id: string
  line_type: string
  description: string
  quantity: number
  unit_sold_price: number
  total_sold_price: number
  discount_amount: number
}

type CustomerInvoiceSnapshot = {
  invoice_number: string
  currency: string
  subtotal_sold: number
  discount_total: number
  total_sold: number
  total_paid: number
  balance_due: number
  customer_terms?: string | null
  due_at?: string | null
  version: number
  lines?: CustomerInvoiceLine[]
}

type CustomerTransportVoucher = {
  id: string
  version: number
  released_at: string | null
  voucher_data: {
    arrivalAirport?: string
    arrivalAt?: string
    departureAirport?: string
    departureAt?: string
    routes?: string[]
    vehicleType?: string
    transportCompany?: string
    driverContact?: string
    groundManager?: string
    publicNotes?: string
    routeAssignments?: Array<{
      routeName?: string
      type?: string
      vehicleType?: string
      date?: string
      time?: string
    }>
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatFileSize(bytes: number) {
  if (!bytes) return 'Unknown size'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function publicKeyInformation(packageFolder: TravelPackageFolder | null) {
  const summary = packageFolder?.current_public_summary || {}
  const value = summary.keyInformation || summary.legacyKeyInformation
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => ['string', 'number'].includes(typeof item) && String(item).trim())
    .map(([key, item]) => ({
      label: key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' '),
      value: String(item),
    }))
    .slice(0, 12)
}

export default function PackageDocumentPortalClient({ token }: PackageDocumentPortalClientProps) {
  const [packageFolder, setPackageFolder] = useState<TravelPackageFolder | null>(null)
  const [documents, setDocuments] = useState<TravelPackageDocument[]>([])
  const [releasedInvoice, setReleasedInvoice] = useState<CustomerInvoiceSnapshot | null>(null)
  const [transportVoucher, setTransportVoucher] = useState<CustomerTransportVoucher | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadDocuments = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/package-documents/${encodeURIComponent(token)}`)
        const data = (await response.json()) as PortalResponse
        if (!response.ok || !data.package) {
          throw new Error(data.error || 'Package documents are not available')
        }
        setPackageFolder(data.package)
        setDocuments(data.documents || [])
        setReleasedInvoice(data.releasedInvoice || null)
        setTransportVoucher(data.transportVoucher || null)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load documents')
      } finally {
        setLoading(false)
      }
    }

    void loadDocuments()
  }, [token])

  const groupedDocuments = useMemo(() => groupPackageDocumentsByCategory(documents), [documents])
  const checklist = useMemo(() => {
    const releasedCategories = new Set(documents.map((document) => document.category))
    return [
      { label: 'Passport details supplied', done: packageFolder?.passport_status === 'ready' },
      { label: 'Flight documents released', done: releasedCategories.has('flight') },
      { label: 'Hotel documents released', done: releasedCategories.has('hotel') },
      { label: 'Visa documents released', done: releasedCategories.has('visa') },
      {
        label: 'Transport details released',
        done: releasedCategories.has('transport') || Boolean(transportVoucher),
      },
    ]
  }, [documents, packageFolder?.passport_status, transportVoucher])
  const keyInformation = useMemo(() => publicKeyInformation(packageFolder), [packageFolder])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-slate-700 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-bold">Loading package documents</span>
        </div>
      </main>
    )
  }

  if (error || !packageFolder) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <section className="max-w-lg rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <p className="text-lg font-black text-slate-950">Documents unavailable</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{error}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="bg-[#4b0f16] px-4 py-6 text-white">
        <div className="mx-auto flex max-w-5xl items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-red-100">Piyam Travel package documents</p>
            <h1 className="mt-2 text-3xl font-black">{packageFolder.package_reference}</h1>
            <p className="mt-2 text-sm font-semibold text-red-50">
              {packageFolder.customer_name || 'Customer'} ·{' '}
              {packageFolder.destination || packageFolder.package_type}
            </p>
          </div>
          <div className="shrink-0 rounded-xl bg-white p-2 shadow-sm">
            <Image
              src="/logo.png"
              alt="Piyam Travel"
              width={92}
              height={40}
              className="h-10 w-auto object-contain"
              priority
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-5 px-4 py-5">
        <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Departure</p>
            <p className="mt-1 text-sm font-black text-slate-950">
              {formatDate(packageFolder.departure_date)}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Return</p>
            <p className="mt-1 text-sm font-black text-slate-950">
              {formatDate(packageFolder.return_date)}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Released documents</p>
            <p className="mt-1 text-sm font-black text-slate-950">{documents.length}</p>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Package information</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {String(
                packageFolder.current_public_summary?.title ||
                  `${packageFolder.package_type} package`,
              )}
            </p>
            <p className="mt-3 text-xs font-semibold text-slate-500">
              Access available until {formatDate(packageFolder.document_access_expires_at)}
            </p>
            {keyInformation.length > 0 && (
              <dl className="mt-4 grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
                {keyInformation.map((item) => (
                  <div key={item.label}>
                    <dt className="text-xs font-bold capitalize text-slate-500">{item.label}</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-slate-800">{item.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <div className="border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-black text-slate-950">Travel checklist</h2>
            <div className="mt-3 space-y-2">
              {checklist.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2 text-xs font-semibold text-slate-600"
                >
                  {item.done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Clock3 className="h-4 w-4 shrink-0 text-amber-500" />
                  )}
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {documents.length === 0 ? (
          <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <FileText className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm font-black text-slate-950">No documents released yet</p>
            <p className="mt-1 text-sm text-slate-600">
              Your agent will release flight, hotel, visa, and transport documents when they are
              ready.
            </p>
          </section>
        ) : (
          groupedDocuments.map((group) => (
            <section
              key={group.value}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <h2 className="text-lg font-black text-slate-950">{group.label}</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {group.documents.map((document) => (
                  <article key={document.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-950">
                          {document.title || document.file_name}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {getPackageDocumentCategoryLabel(document.category)} ·{' '}
                          {formatFileSize(document.file_size)}
                        </p>
                      </div>
                      {document.signed_url && (
                        <a
                          href={document.signed_url}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
                          title="Download document"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                    {document.public_notes && (
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {document.public_notes}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-slate-400">
                      Released {formatDate(document.released_at || document.created_at)}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}

        {transportVoucher && (
          <section className="border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Route className="h-5 w-5 text-[#8b1e2d]" />
              <h2 className="text-lg font-black text-slate-950">Transport voucher</h2>
              <span className="ml-auto text-xs font-bold text-slate-500">
                Version {transportVoucher.version}
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="border border-slate-200 p-3">
                <p className="text-xs font-bold uppercase text-slate-500">Arrival</p>
                <p className="mt-1 text-sm font-black text-slate-950">
                  {transportVoucher.voucher_data.arrivalAirport || 'To be confirmed'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDate(transportVoucher.voucher_data.arrivalAt)}
                </p>
              </div>
              <div className="border border-slate-200 p-3">
                <p className="text-xs font-bold uppercase text-slate-500">Departure</p>
                <p className="mt-1 text-sm font-black text-slate-950">
                  {transportVoucher.voucher_data.departureAirport || 'To be confirmed'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDate(transportVoucher.voucher_data.departureAt)}
                </p>
              </div>
            </div>
            <div className="mt-3 border border-slate-200 p-3 text-sm text-slate-600">
              <p>
                <strong className="text-slate-900">Vehicle:</strong>{' '}
                {transportVoucher.voucher_data.vehicleType || 'To be confirmed'}
              </p>
              <p className="mt-1">
                <strong className="text-slate-900">Driver:</strong>{' '}
                {transportVoucher.voucher_data.driverContact || 'To be confirmed'}
              </p>
              {transportVoucher.voucher_data.routes?.length ||
              transportVoucher.voucher_data.routeAssignments?.length ? (
                <ul className="mt-3 list-disc space-y-1 pl-5">
                  {(transportVoucher.voucher_data.routeAssignments?.length
                    ? transportVoucher.voucher_data.routeAssignments.map((route) => ({
                        route: route.routeName || 'Route to be confirmed',
                        detail: [route.type, route.vehicleType].filter(Boolean).join(' · '),
                      }))
                    : (transportVoucher.voucher_data.routes || []).map((route) => ({
                        route,
                        detail: '',
                      }))
                  ).map((route) => (
                    <li key={route.route}>
                      <span>{route.route}</span>
                      {route.detail && (
                        <span className="block text-xs font-semibold text-slate-500">
                          {route.detail}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
              {transportVoucher.voucher_data.publicNotes && (
                <p className="mt-3 whitespace-pre-wrap">
                  {transportVoucher.voucher_data.publicNotes}
                </p>
              )}
            </div>
          </section>
        )}

        {releasedInvoice && (
          <section className="border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <ReceiptText className="h-5 w-5 text-[#8b1e2d]" />
              <h2 className="text-lg font-black text-slate-950">Released invoice</h2>
              <span className="ml-auto text-xs font-bold text-slate-500">
                {releasedInvoice.invoice_number} · Version {releasedInvoice.version}
              </span>
            </div>
            <div className="mt-4 overflow-x-auto border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(releasedInvoice.lines || []).map((line) => (
                    <tr key={line.id}>
                      <td className="px-3 py-2 font-semibold text-slate-800">{line.description}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{line.quantity}</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-900">
                        {formatMoney(
                          line.total_sold_price - line.discount_amount,
                          releasedInvoice.currency,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 ml-auto grid max-w-sm gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Package total</span>
                <strong>{formatMoney(releasedInvoice.total_sold, releasedInvoice.currency)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Paid</span>
                <strong>{formatMoney(releasedInvoice.total_paid, releasedInvoice.currency)}</strong>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base">
                <span className="font-black">Balance due</span>
                <strong className="text-[#8b1e2d]">
                  {formatMoney(releasedInvoice.balance_due, releasedInvoice.currency)}
                </strong>
              </div>
              {releasedInvoice.due_at && (
                <p className="text-right text-xs text-slate-500">
                  Due {formatDate(releasedInvoice.due_at)}
                </p>
              )}
            </div>
            {releasedInvoice.customer_terms && (
              <p className="mt-4 whitespace-pre-wrap border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">
                {releasedInvoice.customer_terms}
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  )
}
