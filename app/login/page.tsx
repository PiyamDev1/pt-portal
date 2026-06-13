/**
 * Login Page
 * Primary authentication entrypoint with branch and credential validation.
 *
 * @module app/login/page
 */

'use client'
import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import {
  Building2,
  FingerprintPattern,
  Loader2,
  LockKeyhole,
  Mail,
  MapPin,
  ShieldCheck,
} from 'lucide-react'
import {
  getPasskeyLastEmail,
  getMobilePlatformLabel,
  hasPasskeyEnabledHint,
  isWebAuthnSupported,
  preparePublicKeyRequestOptions,
  serializeAuthenticationCredential,
  setPasskeyLastEmail,
} from '@/lib/auth/webauthnClient'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [branchCode, setBranchCode] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)
  const [passkeySupported, setPasskeySupported] = useState(false)
  const [passkeyHint, setPasskeyHint] = useState(false)
  const [checkingExistingSession, setCheckingExistingSession] = useState(true)

  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const recordClientSecurityEvent = async (
    status: 'started' | 'success' | 'failed' | 'blocked',
    eventEmail = email,
    metadata: Record<string, unknown> = {},
  ) => {
    await fetch('/api/auth/security-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'password_login',
        status,
        email: eventEmail,
        metadata,
      }),
    }).catch(() => undefined)
  }

  const assertLoginAllowed = async (loginEmail: string) => {
    const response = await fetch('/api/auth/login-guard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginEmail }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) return
    if (data.locked) {
      const minutes = Math.max(1, Math.ceil(Number(data.remainingSeconds || 0) / 60))
      throw new Error(`Too many failed attempts. Try again in about ${minutes} minute(s).`)
    }
  }

  // --- LOGIC: Validate Branch, Password Status & Redirect ---
  const postLoginChecks = async (userId: string, options: { skipMfa?: boolean } = {}) => {
    // 1. Check database for Account Status, Branch Code match AND Temporary Password Flag
    const { data: employee } = await supabase
      .from('employees')
      .select('is_active, is_temporary_password, locations(branch_code)')
      .eq('id', userId)
      .single()

    // --- CHECK: Account Active Status ---
    if (employee?.is_active === false) {
      await supabase.auth.signOut()
      throw new Error('Your account has been disabled. Contact your administrator for access.')
    }
    // ----------------------------------------

    // --- FORCE PASSWORD CHANGE CHECK ---
    if (employee?.is_temporary_password) {
      router.push('/auth/new-password')
      return
    }
    // ----------------------------------------

    // @ts-ignore
    const assignedCode = employee?.locations?.branch_code

    // If a branch code was typed, it MUST match the user's assigned location
    if (branchCode && assignedCode !== branchCode) {
      await supabase.auth.signOut()
      throw new Error(`Access Denied: You are not authorized for branch ${branchCode}`)
    }

    if (options.skipMfa) {
      router.push('/dashboard')
      return
    }

    // 2. Check 2FA Status
    const { data: mfa } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

    if (mfa?.nextLevel === 'aal2') {
      router.push('/login/verify-2fa')
    } else {
      router.push('/login/setup-2fa')
    }
  }

  useEffect(() => {
    let cancelled = false

    setPasskeySupported(isWebAuthnSupported())
    setPasskeyHint(hasPasskeyEnabledHint())
    setEmail((current) => current || getPasskeyLastEmail())

    const resumeExistingSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (cancelled) return
        if (session?.user) {
          await postLoginChecks(session.user.id)
          return
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setErrorMsg(error instanceof Error ? error.message : 'Unable to resume your session')
        }
      } finally {
        if (!cancelled) setCheckingExistingSession(false)
      }
    }

    void resumeExistingSession()

    return () => {
      cancelled = true
    }
    // This is intentionally a mount-only resume check for installed/PWA launches.
    // Re-running while the user types would make the login form feel jumpy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- HANDLER: Standard Login ---
  const handleStandardLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    const loginEmail = email.trim().toLowerCase()

    try {
      await assertLoginAllowed(loginEmail)
      await recordClientSecurityEvent('started', loginEmail)
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      })
      if (error) throw error
      setPasskeyLastEmail(data.user.email || email)
      await recordClientSecurityEvent('success', data.user.email || loginEmail, {
        userId: data.user.id,
      })
      await postLoginChecks(data.user.id)
    } catch (err: any) {
      await recordClientSecurityEvent(
        err?.message?.startsWith('Too many failed attempts') ? 'blocked' : 'failed',
        loginEmail,
        { reason: err?.message || 'Login failed' },
      )
      setErrorMsg(err.message || 'Login failed')
      setLoading(false)
    }
  }

  const handleBiometricLogin = async () => {
    const loginEmail = (email.trim() || getPasskeyLastEmail()).toLowerCase()
    if (!passkeySupported) {
      setErrorMsg('This browser does not support biometric passkeys.')
      return
    }
    if (!loginEmail) {
      setErrorMsg('Enter your email once, then use biometric login on this device.')
      return
    }

    setBiometricLoading(true)
    setErrorMsg('')

    try {
      const optionsResponse = await fetch('/api/auth/passkeys/authenticate/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginEmail ? { email: loginEmail } : {}),
      })
      const optionsData = await optionsResponse.json()
      if (!optionsResponse.ok) {
        throw new Error(optionsData.error || 'Unable to start biometric login')
      }

      const credential = await navigator.credentials.get({
        publicKey: preparePublicKeyRequestOptions(optionsData.publicKey),
      })
      if (!credential || credential.type !== 'public-key') {
        throw new Error('Biometric login was cancelled')
      }

      const verifyResponse = await fetch('/api/auth/passkeys/authenticate/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge: optionsData.publicKey.challenge,
          credential: serializeAuthenticationCredential(credential as PublicKeyCredential),
        }),
      })
      const verifyData = await verifyResponse.json()
      if (!verifyResponse.ok) {
        throw new Error(verifyData.error || 'Unable to verify biometric login')
      }

      const { data, error } = await supabase.auth.verifyOtp({
        type: 'magiclink',
        token_hash: verifyData.token_hash,
      })
      if (error) throw error

      setPasskeyLastEmail(verifyData.email || loginEmail)
      await postLoginChecks(data.user?.id || verifyData.user_id, { skipMfa: true })
    } catch (err: any) {
      setErrorMsg(err.message || 'Biometric login failed')
      setBiometricLoading(false)
    }
  }

  // --- HANDLER: Microsoft SSO ---
  const handleMicrosoftLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'email',
      },
    })
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5f5f5] text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(139,30,45,0.18),_transparent_34%),linear-gradient(135deg,_#f7fbf7_0%,_#f1e7e9_45%,_#f8fafc_100%)]" />
      <div className="pointer-events-none absolute right-[-10rem] top-[-12rem] h-96 w-96 rounded-full bg-red-200/30 blur-3xl" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[1.1fr_0.95fr] lg:px-8">
        <section className="hidden rounded-[2rem] border border-red-100 bg-white/90 p-10 shadow-2xl shadow-red-950/10 backdrop-blur lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 shadow-sm">
            <ShieldCheck className="h-4 w-4" />
            Secure IMS authentication
          </div>

          <div className="mt-10 space-y-6">
            <h1 className="text-5xl font-black leading-tight text-slate-950">
              One secure entrance for PT Portal staff.
            </h1>
            <p className="max-w-lg text-lg leading-8 text-slate-700">
              Authenticate with branch credentials, passkeys, or Microsoft SSO to get to HRMS, bookings, applications, and finance workflows.
            </p>
          </div>

          <div className="mt-10 grid gap-4">
            {[
              {
                label: 'Fast branch validation',
                description: 'Branch code verification keeps access restricted to assigned locations.',
              },
              {
                label: 'Biometric ready',
                description: 'Passkeys are supported for faster, password-free login on modern devices.',
              },
              {
                label: '2FA enforced',
                description: 'Multi-factor security helps protect your IMS session and HRMS handoff.',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 shadow-sm"
              >
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  {item.label}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/80 bg-white/95 p-8 shadow-2xl shadow-slate-900/10 backdrop-blur md:p-10">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-3xl bg-[#4b0f16] text-white shadow-lg shadow-emerald-900/15">
                <Building2 className="h-6 w-6" />
              </div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#8b1e2d]">
                IMS access
              </p>
              <h2 className="mt-3 text-3xl font-black text-slate-950">Welcome back</h2>
              <p className="mt-2 text-sm text-slate-600">
                Authenticate once to continue to your dashboard, HRMS handoff, and staff workflows.
              </p>
            </div>
            <div className="rounded-3xl bg-red-50 px-4 py-3 text-sm font-semibold text-[#7f1d1d] shadow-sm">
              Live secure portal
            </div>
          </div>

          {checkingExistingSession && (
            <div className="mb-5 flex items-center gap-3 rounded-3xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-[#4b0f16] shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking your secure IMS session
            </div>
          )}

          {errorMsg && (
            <div className="mb-5 rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {errorMsg}
            </div>
          )}

          {passkeySupported && (
            <button
              onClick={() => void handleBiometricLogin()}
              disabled={biometricLoading || checkingExistingSession}
              className="mb-4 flex w-full items-center justify-center gap-3 rounded-[1.75rem] bg-[#4b0f16] px-5 py-4 font-bold text-white shadow-xl shadow-emerald-900/15 transition hover:bg-[#6f1422] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {biometricLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <FingerprintPattern className="h-5 w-5" />
              )}
              <span>
                {biometricLoading
                  ? 'Checking biometrics...'
                  : `Unlock with ${getMobilePlatformLabel()}`}
              </span>
            </button>
          )}

          {passkeySupported && passkeyHint && !checkingExistingSession && (
            <p className="mb-5 rounded-3xl bg-red-50 px-3 py-2 text-xs font-semibold text-[#7f1d1d]">
              Biometric login will use the remembered email on this device.
            </p>
          )}

          <button
            onClick={handleMicrosoftLogin}
            className="mb-6 flex w-full items-center justify-center gap-3 rounded-[1.75rem] border border-slate-200 bg-white px-4 py-4 font-bold text-slate-800 transition hover:border-red-200 hover:bg-red-50"
          >
            Sign in with Microsoft
          </button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              <span className="bg-white px-3">Branch credentials</span>
            </div>
          </div>

          <form onSubmit={handleStandardLogin} className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">Email</span>
              <span className="relative block">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  className="w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-slate-950 outline-none transition focus:border-[#8b1e2d] focus:bg-white focus:ring-4 focus:ring-red-100"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">Password</span>
              <span className="relative block">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-slate-950 outline-none transition focus:border-[#8b1e2d] focus:bg-white focus:ring-4 focus:ring-red-100"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">Branch code</span>
              <span className="relative block">
                <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  autoComplete="organization"
                  placeholder="e.g. HQ-001"
                  className="w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 uppercase tracking-wide text-slate-950 outline-none transition placeholder:normal-case placeholder:tracking-normal focus:border-[#8b1e2d] focus:bg-white focus:ring-4 focus:ring-red-100"
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                />
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || checkingExistingSession}
              className="flex w-full items-center justify-center gap-2 rounded-[1.75rem] bg-slate-950 px-5 py-4 text-sm font-black uppercase tracking-[0.12em] text-white shadow-xl shadow-slate-900/10 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
              {loading ? 'Verifying access…' : 'Continue securely'}
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}
