'use client'

import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

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

export default function TimeclockClient() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanTimerRef = useRef<number | null>(null)
  const submitLockRef = useRef(false)

  const [isScanning, setIsScanning] = useState(false)
  const [status, setStatus] = useState<'idle' | 'scanning' | 'submitting' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [qrText, setQrText] = useState('')
  const [result, setResult] = useState<ScanResponse | null>(null)
  const [cameraError, setCameraError] = useState('')
  const [cameraPermission, setCameraPermission] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown')
  const [scanCooldownUntil, setScanCooldownUntil] = useState(0)
  const [cooldownNow, setCooldownNow] = useState(Date.now())
  const [showSuccessPopup, setShowSuccessPopup] = useState(false)
  const [popupClosesAt, setPopupClosesAt] = useState(0)
  const [popupNow, setPopupNow] = useState(Date.now())

  const getPunchDirection = (value?: string, fallbackText?: string) => {
    const normalized = (value || '').toString().trim().toUpperCase().replace(/[\s-]+/g, '_')
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
  }, [showSuccessPopup])

  const detectorSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window
  const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

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
        // Use iOS-optimized constraints for better compatibility
        const constraints = isIOS ? {
          video: { 
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false,
        } : {
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

        // Use BarcodeDetector if supported, otherwise use jsQR (for iOS)
        if (detectorSupported) {
          const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })

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
            } catch (error: any) {
              setCameraError(error?.message || 'Unable to read QR code.')
            }

            scanTimerRef.current = window.setTimeout(scanLoop, 350)
          }

          scanLoop()
        } else {
          // Fallback for iOS and browsers without BarcodeDetector
          if (!canvasRef.current) {
            canvasRef.current = document.createElement('canvas')
          }

          const canvas = canvasRef.current
          const context = canvas.getContext('2d', { willReadFrequently: true })

          const scanLoopJsQR = () => {
            if (!isActive || !videoRef.current || !context) return

            const video = videoRef.current
            
            // Wait for video to be ready
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
              handleSubmit(code.data)
              return
            }

            scanTimerRef.current = window.setTimeout(scanLoopJsQR, 350)
          }

          scanLoopJsQR()
        }
      } catch (error: any) {
        setCameraError(error?.message || 'Camera access denied.')
        setStatus('error')
      }
    }

    startCamera()

    return () => {
      isMounted = false
      isActive = false
      stopStream()
    }
  }, [isScanning, detectorSupported])

  const requestCameraPermission = async () => {
    setCameraError('')
    try {
      const constraints = isIOS ? {
        video: { 
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false,
      } : {
        video: { facingMode: 'environment' },
        audio: false,
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      stream.getTracks().forEach(track => track.stop())
      setCameraPermission('granted')
    } catch (error: any) {
      setCameraPermission('denied')
      setCameraError(error?.message || 'Camera access denied.')
    }
  }

  const stopStream = () => {
    if (scanTimerRef.current) {
      window.clearTimeout(scanTimerRef.current)
      scanTimerRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }

  const getGeo = async (): Promise<GeoPoint | null> => {
    if (!navigator.geolocation) return null

    return new Promise(resolve => {
      let settled = false

      const timeoutId = window.setTimeout(() => {
        if (settled) return
        settled = true
        resolve(null)
      }, 8000)

      navigator.geolocation.getCurrentPosition(
        position => {
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
        { enableHighAccuracy: true, timeout: 8000 }
      )
    })
  }

  const isManualCodeInput = (value: string) => {
    return /^[\d\s-]+$/.test(value) && value.replace(/\D/g, '').length === 8
  }

  const handleManualInputChange = (value: string) => {
    // Apply ####-#### masking for numeric/manual code input.
    if (/^[\d\s-]*$/.test(value)) {
      const digits = value.replace(/\D/g, '').slice(0, 8)
      if (digits.length <= 4) {
        setQrText(digits)
        return
      }
      setQrText(`${digits.slice(0, 4)}-${digits.slice(4)}`)
      return
    }

    // Keep non-numeric input unchanged so full QR payload paste still works.
    setQrText(value)
  }

  const handleSubmit = async (rawValue?: string) => {
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

      const response = await fetch(isManualCode ? '/api/timeclock/manual-entry/submit' : '/api/timeclock/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isManualCode
            ? { code: manualCode }
            : {
                qrText: payload,
                geo,
                clientTs: new Date().toISOString(),
              }
        ),
      })

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
    } catch (error: any) {
      setStatus('error')
      setMessage(error?.message || 'Clock-in failed.')
    } finally {
      submitLockRef.current = false
    }
  }

  return (
    <div className="space-y-6">
      {showSuccessPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8 space-y-5 text-center">
            <div className="mx-auto flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100">
              <svg className="w-10 h-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {getPunchDirection(result?.punchType || result?.eventType, result?.message) === 'OUT' ? 'Clocked Out' : 'Clocked In'}
              </h2>
              <p className="mt-1 text-slate-600 text-sm">{result?.message || message}</p>
            </div>
            {result?.scannedAt && (
              <p className="text-xs text-slate-400">Recorded at {result.scannedAt}</p>
            )}
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
              onClick={() => setShowSuccessPopup(false)}
              className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 active:bg-emerald-800"
            >
              Done
            </button>
          </div>
        </div>
      )}
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
              onClick={() => setIsScanning(true)}
              disabled={showSuccessPopup || isCooldownActive || status === 'submitting'}
              className={`px-4 py-2 rounded-lg text-white text-sm font-semibold ${showSuccessPopup || isCooldownActive || status === 'submitting' ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {isCooldownActive ? `Scanned (${cooldownSeconds}s)` : 'Start Camera'}
            </button>
            <button
              type="button"
              onClick={requestCameraPermission}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50"
            >
              Enable Camera
            </button>
            <button
              type="button"
              onClick={() => {
                setIsScanning(false)
                stopStream()
                setStatus('idle')
                setMessage('')
              }}
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
          <video ref={videoRef} className="w-full h-64 object-cover" />
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

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Manual Entry</h2>
          <p className="text-sm text-slate-500">Enter 8-digit code. Hyphen is added automatically.</p>
        </div>
        <input
          type="text"
          value={qrText}
          onChange={event => handleManualInputChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              handleSubmit()
            }
          }}
          maxLength={256}
          inputMode="numeric"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="1234-5678"
        />
        <p className="text-xs text-slate-500">You can still paste full QR payload text here if needed.</p>
        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={showSuccessPopup || isCooldownActive || status === 'submitting'}
          className={`px-4 py-2 rounded-lg text-white text-sm font-semibold ${showSuccessPopup || isCooldownActive || status === 'submitting' ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-900 hover:bg-slate-800'}`}
        >
          {isCooldownActive ? `Wait ${cooldownSeconds}s` : 'Submit Code'}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
        <h2 className="text-lg font-semibold text-slate-800">Status</h2>
        <p className={`text-sm ${status === 'error' ? 'text-red-600' : 'text-slate-600'}`}>
          {message || 'Waiting for scan.'}
        </p>
        {result && (
          <div className="text-xs text-slate-500 space-y-1">
            <p>Event ID: {result.eventId}</p>
            <p>Event: {result.eventType || 'PUNCH'}</p>
            <p>Recorded: {result.scannedAt}</p>
          </div>
        )}
      </div>
    </div>
  )
}
