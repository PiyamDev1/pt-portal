'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Copy, CopyPlus, ExternalLink, FolderKanban, PackageCheck, Pencil } from 'lucide-react'

import type { TravelPackageGroup, TravelPackageQuote } from '@/app/types/packages'
import { formatMoney, isPackageQuoteExpired } from '@/lib/packageQuote'
import {
  buildPackageShareUrl,
  filterPackageQuotes,
  formatPackageExpiry,
  getPackageQuoteStartingPrice,
  PACKAGE_QUOTE_FILTERS,
  type PackageQuoteFilter,
} from './packageQuoteBrowserModel'
import { PackageSectionHeader } from './PackageSectionHeader'

export interface PackageQuoteBrowserModel {
  quotes: TravelPackageQuote[]
  packageGroups: TravelPackageGroup[]
  activeQuoteId: string | null
  loading: boolean
  saving: boolean
  onOpenQuote: (quote: TravelPackageQuote) => void
  onDuplicateQuote: (quote: TravelPackageQuote) => Promise<void> | void
  onCopyShareLink: (quote: TravelPackageQuote) => Promise<void> | void
}

export function PackageQuoteBrowser({ model }: { model: PackageQuoteBrowserModel }) {
  const [filter, setFilter] = useState<PackageQuoteFilter>('all')
  const filteredQuotes = useMemo(
    () => filterPackageQuotes(model.quotes, model.packageGroups, filter),
    [filter, model.packageGroups, model.quotes],
  )

  return (
    <>
      <Link
        href="/dashboard/packages/groups"
        className="sticky top-2 z-20 flex min-h-14 items-center justify-between gap-4 border-y-4 border-cyan-900 bg-white px-4 py-3 shadow-lg transition hover:bg-cyan-50 sm:rounded-xl sm:border-x"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-900 text-white">
            <FolderKanban className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black text-cyan-950">See Group Packages</span>
            <span className="block truncate text-xs font-semibold text-slate-600">
              Linked quotations are managed together in the group folder
            </span>
          </span>
        </span>
        <ExternalLink className="h-4 w-4 shrink-0 text-cyan-900" />
      </Link>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <PackageSectionHeader icon={PackageCheck} title="Package quote table" />
          <div className="flex flex-wrap gap-2">
            {PACKAGE_QUOTE_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={`min-h-9 rounded-lg px-3 text-xs font-black transition ${
                  filter === option.value
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {model.loading ? (
          <p className="mt-3 text-sm text-slate-500">Loading package quotes...</p>
        ) : filteredQuotes.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No package quotes match this view.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs font-black uppercase text-slate-500">
                  <th className="border-b border-slate-200 px-3 py-2">Quote</th>
                  <th className="border-b border-slate-200 px-3 py-2">Customer</th>
                  <th className="border-b border-slate-200 px-3 py-2">Status</th>
                  <th className="border-b border-slate-200 px-3 py-2">Expires</th>
                  <th className="border-b border-slate-200 px-3 py-2">From</th>
                  <th className="border-b border-slate-200 px-3 py-2">Selection</th>
                  <th className="border-b border-slate-200 px-3 py-2">Live Link</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotes.map((quote) => {
                  const startingPrice = getPackageQuoteStartingPrice(quote)
                  const expired = isPackageQuoteExpired(quote.expires_at)
                  const binned = quote.status === 'archived'
                  const live = quote.share_enabled && quote.status === 'shared' && !expired
                  const quoteShareUrl = buildPackageShareUrl(quote.share_token)

                  return (
                    <tr
                      key={quote.id}
                      className={`align-top ${
                        model.activeQuoteId === quote.id ? 'bg-red-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="border-b border-slate-100 px-3 py-3">
                        <p className="max-w-[16rem] truncate font-black text-slate-950">
                          {quote.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {quote.package_type} ·{' '}
                          {new Date(quote.created_at).toLocaleDateString('en-GB')}
                        </p>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <p className="font-bold text-slate-800">
                          {quote.customer_name || 'No customer'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {quote.customer_phone || quote.customer_email || ''}
                        </p>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <span
                          className={`inline-flex rounded-lg px-2 py-1 text-xs font-black ${
                            binned
                              ? 'bg-slate-100 text-slate-600'
                              : expired
                                ? 'bg-red-50 text-red-700'
                                : live
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : quote.status === 'draft'
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {binned ? 'Bin' : expired ? 'Expired' : live ? 'Live' : quote.status}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <p
                          className={`text-xs font-bold ${
                            expired ? 'text-red-700' : 'text-slate-700'
                          }`}
                        >
                          {formatPackageExpiry(quote.expires_at)}
                        </p>
                        {quote.share_enabled && (
                          <p className="mt-1 text-[11px] text-slate-500">
                            {binned ? 'Moved to bin' : expired ? 'Link closed' : 'Link open'}
                          </p>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        {startingPrice ? (
                          <div>
                            <p className="font-black text-slate-950">
                              {formatMoney(startingPrice.totalPrice, startingPrice.currency)}
                            </p>
                            <p className="text-xs font-bold text-[#8b1e2d]">
                              {formatMoney(startingPrice.perPersonPrice, startingPrice.currency)}{' '}
                              avg hotel payer
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">Incomplete</span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        {quote.selected_at ? (
                          <div>
                            <p className="text-xs font-black text-emerald-700">Selected</p>
                            <p className="text-xs text-slate-500">
                              {new Date(quote.selected_at).toLocaleString('en-GB')}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">No reply yet</span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        {live ? (
                          <p className="max-w-[16rem] truncate text-xs font-semibold text-slate-600">
                            {quoteShareUrl}
                          </p>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">Not shared</span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => model.onOpenQuote(quote)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-100"
                            title="Open quote for editing"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void model.onDuplicateQuote(quote)}
                            disabled={model.saving}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-900 transition hover:bg-blue-100 disabled:opacity-50"
                            title="Duplicate quote as new draft"
                          >
                            <CopyPlus className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void model.onCopyShareLink(quote)}
                            disabled={!live}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
                            title="Copy customer link"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          {live ? (
                            <a
                              href={quoteShareUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
                              title="Open customer link"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : (
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                              <ExternalLink className="h-4 w-4" />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
