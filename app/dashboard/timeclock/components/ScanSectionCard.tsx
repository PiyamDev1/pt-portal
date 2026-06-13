/**
 * Scan Section Card
 * Main QR scanning surface for live timeclock camera scanning and status controls.
 *
 * @module app/dashboard/timeclock/components/ScanSectionCard
 */

type CameraPermission = 'granted' | 'denied' | 'prompt' | 'unknown'

type ScanSectionCardProps = {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>
  isIOS: boolean
  detectorSupported: boolean
  isScanning: boolean
  showSuccessPopup: boolean
  isCooldownActive: boolean
  cooldownSeconds: number
  status: 'idle' | 'scanning' | 'submitting' | 'success' | 'error'
  cameraPermission: CameraPermission
  cameraError: string
  onStartCamera: () => void
  onEnableCamera: () => void
  onStop: () => void
}

export function ScanSectionCard({
  videoRef,
  isIOS,
  detectorSupported,
  isScanning,
  showSuccessPopup,
  isCooldownActive,
  cooldownSeconds,
  status,
  cameraPermission,
  cameraError,
  onStartCamera,
  onEnableCamera,
  onStop,
}: ScanSectionCardProps) {
  const disabled = showSuccessPopup || isCooldownActive || status === 'submitting'

  return (
    <div className="space-y-4 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm md:rounded-2xl md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800 md:text-lg">Scan QR</h2>
          <p className="text-sm leading-5 text-slate-500">
            {isIOS
              ? 'Point your camera at the QR code (iOS compatible)'
              : 'Allow camera access to scan the device QR.'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex">
          <button
            type="button"
            onClick={onStartCamera}
            disabled={disabled}
            className={`col-span-2 min-h-11 rounded-xl px-4 py-2 text-sm font-semibold text-white md:col-span-1 md:min-h-0 md:rounded-lg ${disabled ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#8b1d2c] hover:bg-[#741725]'}`}
          >
            {isCooldownActive ? `Scanned (${cooldownSeconds}s)` : 'Start Camera'}
          </button>
          <button
            type="button"
            onClick={onEnableCamera}
            className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 md:min-h-0 md:rounded-lg"
          >
            Enable Camera
          </button>
          <button
            type="button"
            onClick={onStop}
            className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 md:min-h-0 md:rounded-lg"
          >
            Stop
          </button>
        </div>
      </div>

      {isIOS && !detectorSupported && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
          ℹ️ Using iOS-compatible QR scanner. Point camera directly at QR code for best results.
        </div>
      )}

      <div className="relative overflow-hidden rounded-[1.4rem] border border-slate-200 bg-slate-900 shadow-inner md:rounded-xl">
        <video
          ref={(node) => {
            videoRef.current = node
          }}
          className="h-[min(58vh,460px)] min-h-[280px] w-full object-cover md:h-64 md:min-h-0"
        />
        {!isScanning && (
          <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm font-medium text-slate-200">
            Tap Start Camera and hold the device QR inside this frame.
          </div>
        )}
      </div>

      {cameraPermission === 'denied' && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          Camera permission is blocked. Enable it in your browser settings for this site.
        </div>
      )}

      {cameraError && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          {cameraError}
        </div>
      )}
    </div>
  )
}
