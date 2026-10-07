import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react'

export type PackageQuoteSyncState = {
  status?: 'synced' | 'review_required' | 'failed'
  message?: string
  conflicts?: Array<{ message?: string }>
}

type PackageQuoteReconciliationNoticeProps = {
  quoteSync?: PackageQuoteSyncState
  syncing: boolean
  onReconcile: () => void
}

export default function PackageQuoteReconciliationNotice({
  quoteSync,
  syncing,
  onReconcile,
}: PackageQuoteReconciliationNoticeProps) {
  if (quoteSync?.status !== 'review_required' && quoteSync?.status !== 'failed') return null

  const failed = quoteSync.status === 'failed'

  return (
    <section
      className={`flex flex-col gap-3 rounded-xl border px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between ${
        failed
          ? 'border-red-300 bg-red-50 text-red-950'
          : 'border-amber-300 bg-amber-50 text-amber-950'
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle
          className={`mt-0.5 h-5 w-5 shrink-0 ${failed ? 'text-red-700' : 'text-amber-700'}`}
        />
        <div>
          <p className="text-sm font-black">
            {failed ? 'Quotation reconciliation failed' : 'Quotation changes need an agent review'}
          </p>
          <p
            className={`mt-1 text-xs font-semibold leading-5 ${failed ? 'text-red-800' : 'text-amber-800'}`}
          >
            {failed
              ? quoteSync.message ||
                'The package may still contain figures from an earlier quotation version.'
              : `Package-owned figures were refreshed. ${
                  quoteSync.conflicts?.[0]?.message ||
                  'A progressed reservation, payment request, or invoice was preserved.'
                }`}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onReconcile}
        disabled={syncing}
        className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-xs font-black text-white disabled:opacity-60 ${
          failed ? 'bg-red-900' : 'bg-amber-900'
        }`}
      >
        {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        Reconcile again
      </button>
    </section>
  )
}
