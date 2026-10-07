import Link from 'next/link'
import { ArrowLeft, Link2, Loader2, RotateCcw } from 'lucide-react'

type PackageOverviewHeaderProps = {
  packageReference: string
  customerName: string | null
  packageType: string
  hasSelectedQuote: boolean
  syncingQuote: boolean
  onViewFinalQuotation: () => void
  onSyncQuotation: () => void
  onGenerateAccessVoucher: () => void
  onTogglePackageGroup: () => void
}

export default function PackageOverviewHeader({
  packageReference,
  customerName,
  packageType,
  hasSelectedQuote,
  syncingQuote,
  onViewFinalQuotation,
  onSyncQuotation,
  onGenerateAccessVoucher,
  onTogglePackageGroup,
}: PackageOverviewHeaderProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <Link
        href="/dashboard/packages"
        className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-950"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Packages
      </Link>
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Package folder</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">{packageReference}</h1>
          <p className="mt-1 text-sm font-bold text-slate-700">
            {customerName || 'No customer'} · {packageType}
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Manage the package from final quotation through reservations, payments, released
            documents, travel, return, and final earned closure.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          {hasSelectedQuote && (
            <>
              <button
                type="button"
                onClick={onViewFinalQuotation}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-100"
              >
                View Final Quotation
              </button>
              <button
                type="button"
                onClick={onSyncQuotation}
                disabled={syncingQuote}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 text-sm font-black text-amber-950 transition hover:bg-amber-100 disabled:opacity-60"
              >
                {syncingQuote ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Sync quotation changes
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onGenerateAccessVoucher}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#8b1e2d] px-4 text-sm font-black text-white transition hover:bg-[#6f1422]"
          >
            Generate Access Voucher
          </button>
          <button
            type="button"
            onClick={onTogglePackageGroup}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-cyan-900 px-4 text-sm font-black text-white transition hover:bg-cyan-800"
          >
            <Link2 className="h-4 w-4" />
            Add Package Link
          </button>
        </div>
      </div>
    </section>
  )
}
