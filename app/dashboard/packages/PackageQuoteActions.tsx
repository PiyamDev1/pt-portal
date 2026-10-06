'use client'

import Link from 'next/link'
import { ArrowLeft, CopyPlus, Link2, PackageCheck, RefreshCw, Save, Send } from 'lucide-react'
import type { TravelPackageQuote } from '@/app/types/packages'
import { isPackageQuoteExpired } from '@/lib/packageQuote'
import { formatPackageExpiry } from './packageQuoteBrowserModel'

type PackageQuoteActionsProps = {
  activeQuote: TravelPackageQuote | null
  saving: boolean
  shareUrl: string
  onStartNew: () => void
  onDuplicateQuote: (quote: TravelPackageQuote) => void | Promise<void>
  onSaveQuote: (share: boolean) => void | Promise<void>
  onCopyShareLink: () => void | Promise<void>
}

export function PackageQuoteActions({
  activeQuote,
  saving,
  shareUrl,
  onStartNew,
  onDuplicateQuote,
  onSaveQuote,
  onCopyShareLink,
}: PackageQuoteActionsProps) {
  const linkExpired = activeQuote ? isPackageQuoteExpired(activeQuote.expires_at) : false

  return (
    <>
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Link
            href="/dashboard/packages"
            className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-slate-950"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Packages
          </Link>
          <p className="text-xs font-bold text-slate-500">Package creator</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Holidays, ziyarat and umrah</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            Build hotel, flight and transport options, save the quote, then share a customer link
            where they can choose their preferred mix and see the live total.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onStartNew}
            className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
          >
            <RefreshCw className="h-4 w-4" />
            New
          </button>
          {activeQuote && (
            <button
              type="button"
              onClick={() => void onDuplicateQuote(activeQuote)}
              disabled={saving}
              className="flex min-h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-900 transition hover:bg-blue-100"
            >
              <CopyPlus className="h-4 w-4" />
              Duplicate
            </button>
          )}
          {activeQuote && (
            <a
              href={`/dashboard/packages/quotations/${activeQuote.id}/sales`}
              className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            >
              <PackageCheck className="h-4 w-4" />
              Sales Mode
            </a>
          )}
          <button
            type="button"
            onClick={() => void onSaveQuote(false)}
            disabled={saving}
            className="flex min-h-10 items-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-bold text-white transition hover:bg-black disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Save
          </button>
          <button
            type="button"
            onClick={() => void onSaveQuote(true)}
            disabled={saving}
            className="flex min-h-10 items-center gap-2 rounded-lg bg-[#8b1e2d] px-3 text-sm font-bold text-white transition hover:bg-[#6f1422] disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Save &amp; Share
          </button>
        </div>
      </div>

      {shareUrl && activeQuote?.share_enabled && (
        <div
          className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
            linkExpired ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'
          }`}
        >
          <div className="min-w-0">
            <p
              className={`text-sm font-black ${linkExpired ? 'text-red-900' : 'text-emerald-900'}`}
            >
              {linkExpired ? 'Customer link has expired' : 'Customer link is active'}
            </p>
            <p className={`truncate text-sm ${linkExpired ? 'text-red-800' : 'text-emerald-800'}`}>
              {shareUrl}
            </p>
            <p
              className={`mt-1 text-xs font-bold ${
                linkExpired ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              Expires {formatPackageExpiry(activeQuote.expires_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onCopyShareLink()}
            disabled={linkExpired}
            className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Link2 className="h-4 w-4" />
            Copy Link
          </button>
        </div>
      )}
    </>
  )
}
