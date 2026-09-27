/**
 * Scan Success Popup
 * Transient feedback popup shown after a successful timeclock scan.
 *
 * @module app/dashboard/timeclock/components/ScanSuccessPopup
 */

type ScanResult = {
  message?: string
  eventType?: string
  punchType?: string
  scannedAt?: string
}

type ScanSuccessPopupProps = {
  show: boolean
  result: ScanResult | null
  message: string
  isCooldownActive: boolean
  cooldownSeconds: number
  popupProgressPercent: number
  popupRemainingSeconds: number
  getPunchDirection: (value?: string, fallbackText?: string) => 'IN' | 'OUT' | null
  onClose: () => void
}

export function ScanSuccessPopup({
  show,
  result,
  message,
  isCooldownActive,
  cooldownSeconds,
  popupProgressPercent,
  popupRemainingSeconds,
  getPunchDirection,
  onClose,
}: ScanSuccessPopupProps) {
  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
      <div className="animate-enter-fade-up w-full max-w-sm space-y-5 rounded-[1.75rem] border border-white/70 bg-white p-7 text-center shadow-2xl">
        <div className="mx-auto flex h-20 w-20 motion-safe:animate-pulse items-center justify-center rounded-full bg-emerald-100">
          <svg
            className="w-10 h-10 text-emerald-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
            Punch recorded
          </p>
          <h2 className="mt-1 text-2xl font-black text-slate-900">
            {getPunchDirection(result?.punchType || result?.eventType, result?.message) === 'OUT'
              ? 'Clocked Out'
              : 'Clocked In'}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{result?.message || message}</p>
        </div>
        {result?.scannedAt && (
          <p className="text-xs font-bold text-slate-400">Recorded at {result.scannedAt}</p>
        )}
        {isCooldownActive && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
            Scan locked for {cooldownSeconds}s to prevent duplicates
          </p>
        )}
        <div className="space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-emerald-500 transition-[width] duration-100"
              style={{ width: `${popupProgressPercent}%` }}
            />
          </div>
          <p className="text-xs font-bold text-slate-500">Closing in {popupRemainingSeconds}s…</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ui-tap w-full rounded-xl bg-emerald-600 py-3 text-sm font-black text-white hover:bg-emerald-700 active:bg-emerald-800"
        >
          Done
        </button>
      </div>
    </div>
  )
}
