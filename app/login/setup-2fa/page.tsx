'use client'
import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'

export default function Setup2FAPage() {
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [factorId, setFactorId] = useState('')
  const [error, setError] = useState('')

  const supabase = createClientComponentClient()
  const router = useRouter()

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error) return setError(error.message)
      setFactorId(data.id)
      QRCode.toDataURL(data.totp.uri).then(setQrCodeUrl)
    })()
  }, [])

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: verifyCode,
    })

    if (error) {
      setError('Incorrect code. Please try again.')
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-lg text-center">
        <h2 className="text-2xl font-bold text-blue-900 mb-2">Secure Your Account</h2>
        <p className="text-sm text-slate-500 mb-6">Scan with Google Authenticator to setup 2FA.</p>

        {qrCodeUrl ? (
          <div className="flex flex-col items-center space-y-4">
            <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48 border-4 border-white shadow-sm" />
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center">Loading QR...</div>
        )}

        <form onSubmit={handleVerify} className="mt-6 space-y-4">
          <input
            type="text" placeholder="Enter 6-digit code" maxLength={6}
            className="w-full text-center text-2xl tracking-[0.5em] p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-600 outline-none"
            value={verifyCode} onChange={e => setVerifyCode(e.target.value)}
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" className="w-full py-3 bg-green-700 text-white rounded-lg font-bold hover:bg-green-600 transition">
            Activate & Login
          </button>
        </form>
      </div>
    </div>
  )
}