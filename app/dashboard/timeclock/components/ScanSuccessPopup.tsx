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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8 space-y-5 text-center">
        <div className="mx-auto flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100">
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
          <h2 className="text-xl font-bold text-slate-900">
            {getPunchDirection(result?.punchType || result?.eventType, result?.message) === 'OUT'
              ? 'Clocked Out'
              : 'Clocked In'}
          </h2>
          <p className="mt-1 text-slate-600 text-sm">{result?.message || message}</p>
        </div>
        {result?.scannedAt && <p className="text-xs text-slate-400">Recorded at {result.scannedAt}</p>}
        {isCooldownActive && (
          <p className="text-xs font-medium text-amber-600">
            Scan locked for {cooldownSeconds}s to prevent duplicates
          </p>
        )}
        <div className="space-y-2">
          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-[width] duration-100"
              style={{ width: `${popupProgressPercent}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">Closing in {popupRemainingSeconds}s...</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 active:bg-emerald-800"
        >
          Done
        </button>
      </div>
    </div>
  )
}
