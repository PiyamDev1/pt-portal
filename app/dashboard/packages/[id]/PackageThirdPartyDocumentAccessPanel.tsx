'use client'

import { Copy, Link2, Loader2, X } from 'lucide-react'
import type {
  TravelPackageDocumentCategory,
  TravelPackageThirdPartyDocumentShare,
} from '@/app/types/packages'
import {
  THIRD_PARTY_PACKAGE_DOCUMENT_CATEGORIES,
  getPackageDocumentCategoryLabel,
} from '@/lib/packageDocuments'
import type { ThirdPartyShareFormState } from './packageOverviewTypes'
import { formatDateTime } from './packageOverviewModel'

type TextField = 'label' | 'recipientName' | 'purpose' | 'expiresAt'

type GeneratedShare = {
  shareUrl: string
  accessCode: string
  recipientName: string
}

type PackageThirdPartyDocumentAccessPanelProps = {
  form: ThirdPartyShareFormState
  saving: boolean
  generatedShare: GeneratedShare | null
  shares: TravelPackageThirdPartyDocumentShare[]
  onFieldChange: (field: TextField, value: string) => void
  onToggleCategory: (category: TravelPackageDocumentCategory) => void
  onCreateShare: () => void | Promise<void>
  onCopyShareInfo: () => void
  onRevokeShare: (share: TravelPackageThirdPartyDocumentShare) => void | Promise<void>
}

export function PackageThirdPartyDocumentAccessPanel({
  form,
  saving,
  generatedShare,
  shares,
  onFieldChange,
  onToggleCategory,
  onCreateShare,
  onCopyShareInfo,
  onRevokeShare,
}: PackageThirdPartyDocumentAccessPanelProps) {
  return (
    <section className="order-3 rounded-xl border border-cyan-200 bg-cyan-50/70 p-4 xl:col-start-2 xl:row-span-2 xl:row-start-1">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-700 text-white">
          <Link2 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-950">Third-party document access</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
            Generate a coded link for suppliers or partners. They must enter the code and accept the
            data-handling responsibility before viewing files.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-xs font-bold uppercase text-slate-500">Label</span>
          <input
            value={form.label}
            onChange={(event) => onFieldChange('label', event.target.value)}
            placeholder="Third-party document access"
            className="mt-1 w-full rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-cyan-500"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase text-slate-500">Recipient</span>
          <input
            value={form.recipientName}
            onChange={(event) => onFieldChange('recipientName', event.target.value)}
            placeholder="Supplier or company"
            className="mt-1 w-full rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-cyan-500"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase text-slate-500">Purpose</span>
          <input
            value={form.purpose}
            onChange={(event) => onFieldChange('purpose', event.target.value)}
            placeholder="Reservation handling, ticketing, supplier verification"
            className="mt-1 w-full rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-cyan-500"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase text-slate-500">Expires</span>
          <input
            type="datetime-local"
            value={form.expiresAt}
            onChange={(event) => onFieldChange('expiresAt', event.target.value)}
            className="mt-1 w-full rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-cyan-500"
          />
        </label>

        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Allowed documents</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {THIRD_PARTY_PACKAGE_DOCUMENT_CATEGORIES.map((category) => {
              const active = form.allowedCategories.includes(category)
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => onToggleCategory(category)}
                  className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                    active
                      ? 'bg-cyan-700 text-white'
                      : 'bg-white text-slate-600 ring-1 ring-cyan-200 hover:bg-cyan-100'
                  }`}
                >
                  {getPackageDocumentCategoryLabel(category)}
                </button>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void onCreateShare()}
          disabled={saving}
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Generate link/code
        </button>
      </div>

      {generatedShare && (
        <div className="mt-4 rounded-lg border border-cyan-200 bg-white p-3">
          <p className="text-xs font-black uppercase text-cyan-700">Ready to share</p>
          <p className="mt-2 break-all text-xs font-bold text-slate-600">
            {generatedShare.shareUrl}
          </p>
          <p className="mt-2 text-sm font-black text-slate-950">
            Code: {generatedShare.accessCode}
          </p>
          <button
            type="button"
            onClick={onCopyShareInfo}
            className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 text-xs font-black text-cyan-800 transition hover:bg-cyan-100"
          >
            <Copy className="h-4 w-4" />
            Copy share info
          </button>
        </div>
      )}

      {shares.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-black uppercase text-slate-500">Recent shares</p>
          {shares.slice(0, 4).map((share) => (
            <div key={share.id} className="rounded-lg border border-cyan-100 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">{share.label}</p>
                  <p className="mt-1 truncate text-xs font-bold text-slate-500">
                    {share.recipient_name || 'No recipient'} · expires{' '}
                    {formatDateTime(share.expires_at)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black uppercase ${
                    share.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {share.status}
                </span>
              </div>
              {share.status === 'active' && (
                <button
                  type="button"
                  onClick={() => void onRevokeShare(share)}
                  disabled={saving}
                  className="mt-2 inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-rose-200 bg-white px-2 text-xs font-black text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-rose-300"
                >
                  <X className="h-3 w-3" />
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
