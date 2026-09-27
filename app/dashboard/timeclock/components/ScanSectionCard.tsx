/**
 * Scan Section Card
 * Main QR scanning surface for live timeclock camera scanning and status controls.
 *
 * @module app/dashboard/timeclock/components/ScanSectionCard
 */

import { Camera, CheckCircle2, ScanLine, ShieldCheck, Square } from 'lucide-react'

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
    <div className="timeclock-scan-card animate-enter-fade-up space-y-5 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm md:rounded-[1.75rem] md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[#8b1e2d]">
            <ScanLine className="h-4 w-4" />
            <p className="text-xs font-black uppercase tracking-[0.16em]">Primary punch method</p>
          </div>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900 md:text-xl">
            Scan the device QR
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {isIOS
              ? 'Point your camera at the QR code (iOS compatible)'
              : 'Allow camera access to scan the device QR.'}
          </p>
        </div>
        <div className="timeclock-camera-actions grid grid-cols-2 gap-2 md:flex">
          <button
            type="button"
            onClick={onStartCamera}
            disabled={disabled}
            className={`ui-tap col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-black text-white md:col-span-1 md:min-h-0 ${disabled ? 'cursor-not-allowed bg-slate-400' : 'bg-[#8b1d2c] hover:bg-[#741725]'}`}
          >
            <Camera className="h-4 w-4" />
            {isCooldownActive ? `Scanned (${cooldownSeconds}s)` : 'Start camera'}
          </button>
          <button
            type="button"
            onClick={onEnableCamera}
            className="ui-tap inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 md:min-h-0"
          >
            <ShieldCheck className="h-4 w-4" /> Enable camera
          </button>
          <button
            type="button"
            onClick={onStop}
            className="ui-tap inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 md:min-h-0"
          >
            <Square className="h-3.5 w-3.5 fill-current" /> Stop
          </button>
        </div>
      </div>

      {isIOS && !detectorSupported && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
          ℹ️ Using iOS-compatible QR scanner. Point camera directly at QR code for best results.
        </div>
      )}

      <div className="relative overflow-hidden rounded-[1.4rem] border border-slate-200 bg-slate-950 shadow-inner md:rounded-2xl">
        <video
          ref={(node) => {
            videoRef.current = node
          }}
          className="timeclock-camera-preview h-[min(58vh,460px)] min-h-[280px] w-full object-cover opacity-90 md:h-72 md:min-h-0"
        />
        {isScanning && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-44 w-64 rounded-3xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(2,6,23,0.38)] sm:h-52 sm:w-80">
              <span className="absolute inset-x-4 top-1/2 h-0.5 motion-safe:animate-pulse bg-red-300 shadow-[0_0_18px_rgba(252,165,165,0.95)]" />
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-900 shadow-sm">
                Scanning live
              </span>
            </div>
          </div>
        )}
        {!isScanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center text-sm font-medium text-slate-200">
            <Camera className="mb-3 h-8 w-8 text-white/70" />
            <span>Tap Start camera and hold the device QR inside this frame.</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> One scan per punch
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5">
          Camera stops after submit
        </span>
      </div>

      {cameraPermission === 'denied' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Camera permission is blocked. Enable it in your browser settings for this site.
        </div>
      )}

      {cameraError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {cameraError}
        </div>
      )}
    </div>
  )
}
