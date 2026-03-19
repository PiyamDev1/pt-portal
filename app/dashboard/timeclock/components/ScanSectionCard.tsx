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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Scan QR</h2>
          <p className="text-sm text-slate-500">
            {isIOS
              ? 'Point your camera at the QR code (iOS compatible)'
              : 'Allow camera access to scan the device QR.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onStartCamera}
            disabled={disabled}
            className={`px-4 py-2 rounded-lg text-white text-sm font-semibold ${disabled ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {isCooldownActive ? `Scanned (${cooldownSeconds}s)` : 'Start Camera'}
          </button>
          <button
            type="button"
            onClick={onEnableCamera}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50"
          >
            Enable Camera
          </button>
          <button
            type="button"
            onClick={onStop}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50"
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

      <div className="relative rounded-xl border border-slate-200 bg-slate-900 overflow-hidden">
        <video
          ref={(node) => {
            videoRef.current = node
          }}
          className="w-full h-64 object-cover"
        />
        {!isScanning && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-200 text-sm">
            Camera preview will appear here.
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
