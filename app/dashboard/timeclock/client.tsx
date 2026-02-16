'use client'

import { useEffect, useRef, useState } from 'react'

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
  scannedAt?: string
}

export default function TimeclockClient() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanTimerRef = useRef<number | null>(null)

  const [isScanning, setIsScanning] = useState(false)
  const [status, setStatus] = useState<'idle' | 'scanning' | 'submitting' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [qrText, setQrText] = useState('')
  const [result, setResult] = useState<ScanResponse | null>(null)
  const [cameraError, setCameraError] = useState('')

  const detectorSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window

  useEffect(() => {
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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })

        if (!isActive) return

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.playsInline = true
          await videoRef.current.play()
        }

        if (!detectorSupported) {
          setCameraError('QR scanning is not supported on this device. Use manual entry below.')
          return
        }

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
      } catch (error: any) {
        setCameraError(error?.message || 'Camera access denied.')
        setStatus('error')
      }
    }

    startCamera()

    return () => {
      isActive = false
      stopStream()
    }
  }, [isScanning, detectorSupported])

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

  const handleSubmit = async (rawValue?: string) => {
    const payload = rawValue ?? qrText.trim()
    if (!payload) {
      setMessage('Paste or scan a QR code first.')
      setStatus('error')
      return
    }

    setIsScanning(false)
    stopStream()
    setStatus('submitting')
    setMessage('Submitting scan...')
    setResult(null)

    try {
      const geo = await getGeo()
      const response = await fetch('/api/timeclock/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrText: payload,
          geo,
          clientTs: new Date().toISOString(),
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        setStatus('error')
        setMessage(data?.error || 'Clock-in failed.')
        return
      }

      setStatus('success')
      setMessage(data?.message || 'Clock-in recorded.')
      setResult(data)
    } catch (error: any) {
      setStatus('error')
      setMessage(error?.message || 'Clock-in failed.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Scan QR</h2>
            <p className="text-sm text-slate-500">Allow camera access to scan the device QR.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsScanning(true)}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
            >
              Start Camera
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

        <div className="relative rounded-xl border border-slate-200 bg-slate-900 overflow-hidden">
          <video ref={videoRef} className="w-full h-64 object-cover" />
          {!isScanning && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-200 text-sm">
              Camera preview will appear here.
            </div>
          )}
        </div>

        {cameraError && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
            {cameraError}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Manual Entry</h2>
          <p className="text-sm text-slate-500">If camera scanning is unavailable, paste the QR payload.</p>
        </div>
        <textarea
          value={qrText}
          onChange={event => setQrText(event.target.value)}
          rows={4}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Paste QR payload here (ptc1:... or raw JSON)"
        />
        <button
          type="button"
          onClick={() => handleSubmit()}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
        >
          Submit Code
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
