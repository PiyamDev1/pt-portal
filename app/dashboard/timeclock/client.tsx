/**
 * Timeclock Client
 * Camera-driven QR scanning interface for employee punch events,
 * with geolocation support and scanner fallback behavior.
 */
'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardPen, Info } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { ScanSuccessPopup } from './components/ScanSuccessPopup'
import { ScanSectionCard } from './components/ScanSectionCard'

type GeoPoint = {
  lat: number
  lng: number
  accuracy: number
}

type ScanResponse = {
  ok: boolean
  message: string
  eventId?: string
  eventType?: string
  punchType?: string
  scannedAt?: string
}

type BarcodeResult = { rawValue?: string }
type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<BarcodeResult[]>
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike
export default function TimeclockClient() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanTimerRef = useRef<number | null>(null)
  const submitLockRef = useRef(false)

  const [isScanning, setIsScanning] = useState(false)
  const [status, setStatus] = useState<'idle' | 'scanning' | 'submitting' | 'success' | 'error'>(
    'idle',
  )
  const [message, setMessage] = useState('')
  const [qrText, setQrText] = useState('')
  const [result, setResult] = useState<ScanResponse | null>(null)
  const [cameraError, setCameraError] = useState('')
  const [cameraPermission, setCameraPermission] = useState<
    'granted' | 'denied' | 'prompt' | 'unknown'
  >('unknown')
  const [scanCooldownUntil, setScanCooldownUntil] = useState(0)
  const [cooldownNow, setCooldownNow] = useState(Date.now())
  const [showSuccessPopup, setShowSuccessPopup] = useState(false)
  const [popupClosesAt, setPopupClosesAt] = useState(0)
  const [popupNow, setPopupNow] = useState(Date.now())

  const getPunchDirection = (value?: string, fallbackText?: string) => {
    const normalized = (value || '')
      .toString()
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_')
    if (['OUT', 'CLOCK_OUT', 'PUNCH_OUT', 'CHECK_OUT'].includes(normalized)) return 'OUT'
    if (['IN', 'CLOCK_IN', 'PUNCH_IN', 'CHECK_IN'].includes(normalized)) return 'IN'

    const text = (fallbackText || '').toUpperCase()
    if (text.includes('OUT')) return 'OUT'
    if (text.includes('IN')) return 'IN'

    return null
  }

  const cooldownSeconds = Math.max(0, Math.ceil((scanCooldownUntil - cooldownNow) / 1000))
  const isCooldownActive = scanCooldownUntil > cooldownNow
  const popupRemainingMs = Math.max(0, popupClosesAt - popupNow)
  const popupRemainingSeconds = Math.max(0, Math.ceil(popupRemainingMs / 1000))
  const popupProgressPercent = popupClosesAt
    ? Math.min(100, Math.max(0, (popupRemainingMs / 3000) * 100))
    : 0

  const detectorSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window
  const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

  const requestCameraPermission = async () => {
    setCameraError('')
    try {
      const constraints = isIOS
        ? {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          }
        : {
            video: { facingMode: 'environment' },
            audio: false,
          }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      stream.getTracks().forEach((track) => track.stop())
      setCameraPermission('granted')
    } catch (error: unknown) {
      setCameraPermission('denied')
      setCameraError(error instanceof Error ? error.message : 'Camera access denied.')
    }
  }

  const stopStream = useCallback(() => {
    if (scanTimerRef.current) {
      window.clearTimeout(scanTimerRef.current)
      scanTimerRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  const getGeo = async (): Promise<GeoPoint | null> => {
    if (!navigator.geolocation) return null

    return new Promise((resolve) => {
      let settled = false

      const timeoutId = window.setTimeout(() => {
        if (settled) return
        settled = true
        resolve(null)
      }, 8000)

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (settled) return
          settled = true
          window.clearTimeout(timeoutId)
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          })
        },
        () => {
          if (settled) return
          settled = true
          window.clearTimeout(timeoutId)
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 8000 },
      )
    })
  }

  const isManualCodeInput = (value: string) => {
    return /^[\d\s-]+$/.test(value) && value.replace(/\D/g, '').length === 8
  }

  const handleManualInputChange = (value: string) => {
    if (/^[\d\s-]*$/.test(value)) {
      const digits = value.replace(/\D/g, '').slice(0, 8)
      if (digits.length <= 4) {
        setQrText(digits)
        return
      }
      setQrText(`${digits.slice(0, 4)}-${digits.slice(4)}`)
      return
    }
    setQrText(value)
  }

  const handleSubmit = useCallback(
    async (rawValue?: string) => {
      if (submitLockRef.current || showSuccessPopup) return

      if (isCooldownActive) {
        setStatus('success')
        setMessage(`Already scanned. Please wait ${cooldownSeconds}s before scanning again.`)
        return
      }

      const payload = rawValue ?? qrText.trim()
      if (!payload) {
        setMessage('Enter a manual code or scan a QR code first.')
        setStatus('error')
        return
      }

      submitLockRef.current = true
      setIsScanning(false)
      stopStream()
      setStatus('submitting')
      setMessage('Submitting scan...')
      setResult(null)

      try {
        const geo = await getGeo()
        const manualCode = payload.replace(/\D/g, '')
        const isManualCode = isManualCodeInput(payload)

        const response = await fetch(
          isManualCode ? '/api/timeclock/manual-entry/submit' : '/api/timeclock/scan',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              isManualCode
                ? { code: manualCode }
                : {
                    qrText: payload,
                    geo,
                    clientTs: new Date().toISOString(),
                  },
            ),
          },
        )

        const data = await response.json()
        if (!response.ok) {
          setStatus('error')
          setMessage(data?.error || 'Clock-in failed.')
          return
        }

        setStatus('success')
        setScanCooldownUntil(Date.now() + 8000)
        setCooldownNow(Date.now())
        setMessage(data?.message || 'Clock-in recorded.')
        setPopupNow(Date.now())
        setPopupClosesAt(Date.now() + 3000)
        setShowSuccessPopup(true)
        setResult({
          ok: true,
          message: data?.message || 'Clock-in recorded.',
          eventId: data?.eventId,
          eventType: data?.eventType || 'PUNCH',
          punchType: data?.punchType,
          scannedAt: data?.scannedAt,
        })
      } catch (error: unknown) {
        setStatus('error')
        setMessage(error instanceof Error ? error.message : 'Clock-in failed.')
      } finally {
        submitLockRef.current = false
      }
    },
    [cooldownSeconds, isCooldownActive, qrText, showSuccessPopup, stopStream],
  )

  useEffect(() => {
    if (!isCooldownActive) return

    const timer = window.setInterval(() => {
      setCooldownNow(Date.now())
    }, 250)

    return () => window.clearInterval(timer)
  }, [isCooldownActive])

  useEffect(() => {
    if (!showSuccessPopup) return

    const tick = window.setInterval(() => {
      const now = Date.now()
      setPopupNow(now)
      if (now >= popupClosesAt) {
        setShowSuccessPopup(false)
      }
    }, 100)

    return () => window.clearInterval(tick)
  }, [showSuccessPopup, popupClosesAt])

  useEffect(() => {
    if (!showSuccessPopup) return
    setIsScanning(false)
    stopStream()
  }, [showSuccessPopup, stopStream])

  useEffect(() => {
    let isMounted = true

    const checkPermission = async () => {
      if (!navigator.permissions) return
      try {
        const status = await navigator.permissions.query({ name: 'camera' as PermissionName })
        if (!isMounted) return
        setCameraPermission(status.state)
        status.onchange = () => {
          setCameraPermission(status.state)
        }
      } catch {
        setCameraPermission('unknown')
      }
    }

    checkPermission()

    if (!isScanning) {
      stopStream()
      return
    }

    let isActive = true
    const startCamera = async () => {
      setCameraError('')
      setStatus('scanning')
      setMessage('Point your camera at the QR code.')

      try {
        const constraints = isIOS
          ? {
              video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: false,
            }
          : {
              video: { facingMode: 'environment' },
              audio: false,
            }

        const stream = await navigator.mediaDevices.getUserMedia(constraints)

        if (!isActive) return

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.playsInline = true
          videoRef.current.setAttribute('playsinline', 'true')
          videoRef.current.setAttribute('webkit-playsinline', 'true')
          await videoRef.current.play()
        }

        if (detectorSupported) {
          const detectorWindow = window as unknown as Window & {
            BarcodeDetector: BarcodeDetectorCtor
          }
          const detector = new detectorWindow.BarcodeDetector({ formats: ['qr_code'] })

          const scanLoop = async () => {
            if (!isActive || !videoRef.current) return

            try {
              const barcodes = await detector.detect(videoRef.current)
              if (barcodes?.length) {
                const rawValue = barcodes[0]?.rawValue || ''
                if (rawValue) {
                  await handleSubmit(rawValue)
                  return
                }
              }
            } catch (error: unknown) {
              setCameraError(error instanceof Error ? error.message : 'Unable to read QR code.')
            }

            scanTimerRef.current = window.setTimeout(scanLoop, 350)
          }

          scanLoop()
        } else {
          if (!canvasRef.current) {
            canvasRef.current = document.createElement('canvas')
          }

          const canvas = canvasRef.current
          const context = canvas.getContext('2d', { willReadFrequently: true })

          const scanLoopJsQR = () => {
            if (!isActive || !videoRef.current || !context) return

            const video = videoRef.current

            if (video.readyState !== video.HAVE_ENOUGH_DATA) {
              scanTimerRef.current = window.setTimeout(scanLoopJsQR, 100)
              return
            }

            canvas.width = video.videoWidth
            canvas.height = video.videoHeight

            if (canvas.width === 0 || canvas.height === 0) {
              scanTimerRef.current = window.setTimeout(scanLoopJsQR, 100)
              return
            }

            context.drawImage(video, 0, 0, canvas.width, canvas.height)
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height)

            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert',
            })

            if (code?.data) {
              void handleSubmit(code.data)
              return
            }

            scanTimerRef.current = window.setTimeout(scanLoopJsQR, 350)
          }

          scanLoopJsQR()
        }
      } catch (error: unknown) {
        setCameraError(error instanceof Error ? error.message : 'Camera access denied.')
        setStatus('error')
      }
    }

    void startCamera()

    return () => {
      isMounted = false
      isActive = false
      stopStream()
    }
  }, [detectorSupported, handleSubmit, isIOS, isScanning, stopStream])

  return (
    <div className="space-y-4 md:space-y-6">
      <ScanSuccessPopup
        show={showSuccessPopup}
        result={result}
        message={message}
        isCooldownActive={isCooldownActive}
        cooldownSeconds={cooldownSeconds}
        popupProgressPercent={popupProgressPercent}
        popupRemainingSeconds={popupRemainingSeconds}
        getPunchDirection={getPunchDirection}
        onClose={() => setShowSuccessPopup(false)}
      />
      <ScanSectionCard
        videoRef={videoRef}
        isIOS={isIOS}
        detectorSupported={detectorSupported}
        isScanning={isScanning}
        showSuccessPopup={showSuccessPopup}
        isCooldownActive={isCooldownActive}
        cooldownSeconds={cooldownSeconds}
        status={status}
        cameraPermission={cameraPermission}
        cameraError={cameraError}
        onStartCamera={() => setIsScanning(true)}
        onEnableCamera={requestCameraPermission}
        onStop={() => {
          setIsScanning(false)
          stopStream()
          setStatus('idle')
          setMessage('')
        }}
      />
      <div className="animate-enter-fade-up animate-enter-delay-1 space-y-4 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm md:rounded-[1.75rem] md:p-6">
        <div>
          <div className="flex items-center gap-2 text-[#8b1e2d]">
            <ClipboardPen className="h-4 w-4" />
            <p className="text-xs font-black uppercase tracking-[0.16em]">Fallback method</p>
          </div>
          <h2 className="mt-1 text-xl font-black text-slate-900">Enter a manual code</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Enter the 8-digit code from the device. Hyphens are added automatically.
          </p>
        </div>
        <input
          type="text"
          value={qrText}
          onChange={(event) => handleManualInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              handleSubmit()
            }
          }}
          maxLength={256}
          inputMode="numeric"
          className="timeclock-manual-code w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-lg font-black tracking-[0.2em] text-slate-700 outline-none transition focus:border-[#8b1e2d] focus:bg-white focus:ring-2 focus:ring-red-100 md:px-3 md:py-2 md:text-left md:text-sm md:tracking-normal"
          placeholder="1234-5678"
        />
        <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          You can still paste full QR payload text here if needed.
        </p>
        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={showSuccessPopup || isCooldownActive || status === 'submitting'}
          className={`ui-tap timeclock-manual-submit min-h-11 w-full rounded-xl px-4 py-2 text-sm font-black text-white md:w-auto ${showSuccessPopup || isCooldownActive || status === 'submitting' ? 'cursor-not-allowed bg-slate-400' : 'bg-slate-900 hover:bg-slate-800'}`}
        >
          {isCooldownActive ? `Wait ${cooldownSeconds}s` : 'Submit Code'}
        </button>
      </div>
      <div className="animate-enter-fade-up animate-enter-delay-2 space-y-3 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm md:rounded-[1.75rem] md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
              Live feedback
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-900">Punch status</h2>
          </div>
          {status === 'success' ? (
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          ) : status === 'error' ? (
            <AlertTriangle className="h-6 w-6 text-red-600" />
          ) : (
            <Info className="h-6 w-6 text-slate-400" />
          )}
        </div>
        <p
          className={`timeclock-status-message rounded-xl px-3 py-2.5 text-sm font-bold ${status === 'error' ? 'bg-red-50 text-red-700' : status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'}`}
        >
          {message || 'Waiting for scan.'}
        </p>
        {result && (
          <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            <p>Event ID: {result.eventId}</p>
            <p>Event: {result.eventType || 'PUNCH'}</p>
            <p>Recorded: {result.scannedAt}</p>
          </div>
        )}
        <Link
          href="/dashboard/timeclock/history"
          className="ui-tap inline-flex items-center gap-2 text-xs font-black text-[#8b1e2d] hover:text-[#5f111d]"
        >
          Review my punches <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}
