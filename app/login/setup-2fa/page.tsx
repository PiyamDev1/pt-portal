'use client'
import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import QRCode from 'qrcode'

export default function Setup2FAPage() {
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [factorId, setFactorId] = useState('')
  const [error, setError] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [showKey, setShowKey] = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  useEffect(() => {
    (async () => {
      // Get current user info
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Not authenticated')
        return
      }

      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error) return setError(error.message)
      setFactorId(data.id)
      
      // Extract secret from the original URI (format: otpauth://totp/...?secret=XXXXX&...)
      const originalUri = data.totp.uri
      const secretMatch = originalUri.match(/secret=([^&]+)/)
      if (secretMatch) {
        setSecretKey(secretMatch[1])
        
        // Create custom TOTP URI with desired format:
        // otpauth://totp/IMS:Piyamtravel.com:username?secret=SECRET&issuer=IMS
        const issuer = 'IMS'
        const accountName = `Piyamtravel.com:${user.email}`
        const customUri = `otpauth://totp/${issuer}:${accountName}?secret=${secretMatch[1]}&issuer=${issuer}`
        
        QRCode.toDataURL(customUri).then(setQrCodeUrl)
      } else {
        // Fallback to original URI if we can't extract secret
        QRCode.toDataURL(originalUri).then(setQrCodeUrl)
      }
    })()
  }, [supabase])

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
      // Replace the history so back button doesn't go to 2FA
      window.history.replaceState(null, '', '/dashboard')
      router.push('/dashboard')
    }
  }

  const handleCopyKey = async () => {
    await navigator.clipboard.writeText(secretKey)
    alert('Secret key copied to clipboard!')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="absolute top-4 left-4">
        <Link href="/login" className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-medium">
          ← Back to Login
        </Link>
      </div>
      <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-lg text-center">
        <h2 className="text-2xl font-bold text-blue-900 mb-2">Secure Your Account</h2>
        <p className="text-sm text-slate-500 mb-6">Scan with Google Authenticator to setup 2FA.</p>

        {qrCodeUrl ? (
          <div className="flex flex-col items-center space-y-4">
            <div className="relative w-48 h-48 border-4 border-white shadow-sm">
              <Image src={qrCodeUrl} alt="QR Code" fill sizes="192px" className="object-contain" unoptimized />
            </div>
            
            <div className="w-full mt-6">
              <details className="text-left">
                <summary className="cursor-pointer text-sm text-blue-600 hover:underline mb-2 select-none">
                  📱 Having trouble scanning? Use manual setup instead
                </summary>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-3 text-left">
                  <p className="text-xs text-blue-900 font-medium mb-3">If you&apos;re setting up 2FA on the same device:</p>
                  <ol className="text-xs text-blue-800 space-y-2 list-decimal list-inside">
                    <li>Open your authenticator app (Google Authenticator, Microsoft Authenticator, etc.)</li>
                    <li>Select &quot;Add account&quot; or tap the &quot;+&quot; button</li>
                    <li>Choose &quot;Enter a setup key&quot; or &quot;Manual entry&quot;</li>
                    <li>Copy the key below and paste it into your authenticator app</li>
                    <li>Set the account name as &quot;IMS&quot; or &quot;Piyam Travels&quot;</li>
                  </ol>
                  
                  <div className="bg-white border border-blue-300 rounded-lg p-3 mt-4">
                    <p className="text-xs font-semibold text-slate-700 mb-2">Setup Key (Account Key):</p>
                    <div className="flex items-center justify-center gap-2">
                      <code className="bg-slate-100 px-3 py-2 rounded border border-slate-300 text-sm font-mono select-all break-all flex-1 text-center">
                        {secretKey}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyKey}
                        className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-medium whitespace-nowrap"
                        title="Copy to clipboard"
                      >
                        📋 Copy
                      </button>
                    </div>
                  </div>
                  
                  <p className="text-xs text-blue-700 mt-3 italic">After adding the key to your authenticator app, return here and enter the 6-digit code to confirm.</p>
                </div>
              </details>
            </div>
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