'use client'

import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'

type ManualPayload = {
  code: string // The 4-4 numeric code
  qrPayload: string // Full QR payload to display
  expiresAt: number // When this code expires
  codeDisplay: string // Formatted as XXXX-XXXX
}

export default function ManualEntryClient({ userId }: { userId: string }) {
  const [payload, setPayload] = useState<ManualPayload | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
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
          throw new Error('Failed to generate code')
        }
        const data = await response.json()
        setPayload(data)
        setTimeLeft(30)
        setManualCode('')

        // Render QR code to canvas
        if (canvasRef.current) {
          try {
            await QRCode.toCanvas(canvasRef.current, data.qrPayload, {
              width: 256,
              margin: 2,
              color: {
                dark: '#000000',
                light: '#FFFFFF',
              },
            })
          } catch (qrError) {
            console.error('QR generation error:', qrError)
          }
        }
      } catch (err) {
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

  const handleSubmitCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/timeclock/manual-entry/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: manualCode.replace(/-/g, '') }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to submit code')
      }

      const data = await response.json()
      setSuccess(`Punch recorded: ${data.punchType}`)
      setManualCode('')
      
      // Refresh the code after successful punch
      setTimeout(async () => {
        const genResponse = await fetch('/api/timeclock/manual-entry/generate', {
          method: 'POST',
        })
        if (genResponse.ok) {
          const newPayload = await genResponse.json()
          setPayload(newPayload)
          setTimeLeft(30)
        }
      }, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleManualCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '') // Only digits
    if (value.length <= 4) {
      setManualCode(value)
    } else if (value.length === 5) {
      setManualCode(value.slice(0, 4) + '-' + value.slice(4))
    } else {
      setManualCode(value.slice(0, 4) + '-' + value.slice(4, 8))
    }
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Manual Punch Entry</h1>
      <p className="text-gray-600 mb-6">For managers: Display QR code or use the numeric code for quick entry</p>

      {loading && <div className="text-center py-8">Generating code...</div>}
      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-800">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-green-800">{success}</div>}

      {payload && !loading && (
        <>
          {/* QR Code Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <div className="flex flex-col items-center">
              <canvas 
                ref={canvasRef}
                className="border border-gray-100 rounded-lg"
              />
              <p className="text-sm text-gray-600 mt-4 text-center">
                Expires in {timeLeft}s
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
          <form onSubmit={handleSubmitCode} className="bg-gray-50 rounded-lg border border-gray-200 p-6">
            <div className="mb-4">
              <p className="text-sm font-semibold text-gray-700 mb-2">Numeric Code</p>
              <div className="text-center font-mono text-2xl font-bold tracking-widest mb-4 text-blue-600">
                {payload.codeDisplay}
              </div>
              <p className="text-xs text-gray-600 text-center mb-4">
                Enter this code for manual punch entry
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter Code
              </label>
              <input
                type="text"
                value={manualCode}
                onChange={handleManualCodeChange}
                placeholder="XXXX-XXXX"
                maxLength={9}
                className="w-full px-4 py-2 text-center text-2xl font-mono tracking-widest border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={submitting || manualCode.replace(/-/g, '').length !== 8}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold py-2 rounded-lg transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Punch'}
            </button>
          </form>

          <p className="text-xs text-gray-500 text-center mt-4">
            Code refreshes every 30 seconds for security
          </p>
        </>
      )}
    </div>
  )
}
