'use client'

import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'

type ManualPayload = {
  code: string // The 8-digit numeric code
  qrPayload: string // Full QR payload to display
  expiresAt: number // When this code expires
  codeDisplay: string // Formatted as XXXX-XXXX
}

export default function ManualEntryClient({ userId }: { userId: string }) {
  const [payload, setPayload] = useState<ManualPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState(30)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [isSuspended, setIsSuspended] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const suspendTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Generate new code on mount and every 30 seconds
  useEffect(() => {
    const generateCode = async () => {
      try {
        if (isSuspended) {
          return
        }
        setLoading(true)
        setError(null)
        const response = await fetch('/api/timeclock/manual-entry/generate', {
          method: 'POST',
        })
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to generate code')
        }
        const data = await response.json()
        console.log('Generated payload:', data)
        setPayload(data)
        setTimeLeft(30)
        setQrDataUrl(null)
      } catch (err) {
        console.error('Code generation error:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    generateCode()
    refreshIntervalRef.current = setInterval(generateCode, 30000)
    suspendTimerRef.current = setTimeout(() => {
      setIsSuspended(true)
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }, 120000)

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
      if (suspendTimerRef.current) {
        clearTimeout(suspendTimerRef.current)
      }
    }
  }, [isSuspended])

  // Count down timer
  useEffect(() => {
    if (!payload) return
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          return 30
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [payload])

  useEffect(() => {
    if (!payload?.qrPayload) return
    const renderQr = async () => {
      try {
        console.log('Rendering QR code to data URL...')
        const dataUrl = await QRCode.toDataURL(payload.qrPayload, {
          width: 256,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        })
        setQrDataUrl(dataUrl)
        console.log('QR code rendered successfully')
      } catch (qrError) {
        console.error('QR generation error:', qrError)
        setError(
          'Failed to generate QR code: ' +
            (qrError instanceof Error ? qrError.message : 'Unknown error')
        )
      }
    }

    renderQr()
  }, [payload])

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Manual Punch Entry</h1>
      <p className="text-gray-600 mb-6">Display this code for staff to scan or enter manually</p>

      {loading && <div className="text-center py-8">Generating code...</div>}
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-800">{error}</div>}
      {isSuspended && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-yellow-900">
          <p className="font-semibold mb-2">Session paused to reduce API usage</p>
          <p className="text-sm mb-4">This page auto-pauses after 2 minutes. Refresh to generate a new code.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="bg-yellow-600 hover:bg-yellow-700 text-white font-semibold px-4 py-2 rounded-lg"
          >
            Refresh Page
          </button>
        </div>
      )}

      {payload && !loading && !isSuspended && (
        <>
          {/* QR Code Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <div className="flex flex-col items-center">
              <p className="text-sm font-semibold text-gray-700 mb-4">Scan QR Code</p>
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Manual entry QR code"
                  className="border-2 border-gray-200 rounded-lg"
                  width={256}
                  height={256}
                />
              ) : (
                <div className="h-64 w-64 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-sm text-gray-500">
                  Generating QR...
                </div>
              )}
              <p className="text-sm text-gray-600 mt-4 text-center">
                Expires in <span className="font-semibold text-blue-600">{timeLeft}s</span>
              </p>
            </div>
          </div>

          {/* Or Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 border-t border-gray-300"></div>
            <span className="text-gray-600 font-medium">OR</span>
            <div className="flex-1 border-t border-gray-300"></div>
          </div>

          {/* Numeric Code Section */}
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
            <p className="text-sm font-semibold text-gray-700 mb-3 text-center">Manual Entry Code</p>
            <div className="text-center font-mono text-3xl font-bold tracking-widest mb-3 text-blue-600">
              {payload.codeDisplay}
            </div>
            <p className="text-xs text-gray-600 text-center">
              Staff can enter this code on their timeclock portal
            </p>
          </div>

          <p className="text-xs text-gray-500 text-center mt-6">
            Code refreshes every 30 seconds for security
          </p>
        </>
      )}
    </div>
  )
}
