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
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Generate new code on mount and every 30 seconds
  useEffect(() => {
    const generateCode = async () => {
      try {
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

        // Render QR code to canvas
        if (canvasRef.current && data.qrPayload) {
          try {
            console.log('Rendering QR code to canvas...')
            await QRCode.toCanvas(canvasRef.current, data.qrPayload, {
              width: 256,
              margin: 2,
              color: {
                dark: '#000000',
                light: '#FFFFFF',
              },
            })
            console.log('QR code rendered successfully')
          } catch (qrError) {
            console.error('QR generation error:', qrError)
            setError('Failed to generate QR code: ' + (qrError instanceof Error ? qrError.message : 'Unknown error'))
          }
        }
      } catch (err) {
        console.error('Code generation error:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    generateCode()
    const interval = setInterval(generateCode, 30000)
    return () => clearInterval(interval)
  }, [])

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

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Manual Punch Entry</h1>
      <p className="text-gray-600 mb-6">Display this code for staff to scan or enter manually</p>

      {loading && <div className="text-center py-8">Generating code...</div>}
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-800">{error}</div>}

      {payload && !loading && (
        <>
          {/* QR Code Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <div className="flex flex-col items-center">
              <p className="text-sm font-semibold text-gray-700 mb-4">Scan QR Code</p>
              <canvas 
                ref={canvasRef}
                className="border-2 border-gray-200 rounded-lg"
                style={{ display: 'block' }}
              />
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
