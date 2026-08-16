/**
 * Login Page
 * Primary authentication entrypoint with branch and credential validation.
 *
 * @module app/login/page
 */

'use client'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
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
import { getBrowserSupabaseClient } from '@/lib/auth/browserSupabase'
import { getPortalSessionAssurance, signInWithPasskey } from '@/lib/auth/passkeyClientActions'
import {
  getMobilePlatformLabel,
  isConditionalPasskeySupported,
  isWebAuthnSupported,
} from '@/lib/auth/webauthnClient'

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [branchCode, setBranchCode] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [passkeySupported, setPasskeySupported] = useState(false)
  const [checkingExistingSession, setCheckingExistingSession] = useState(true)
  const [freshLaunch, setFreshLaunch] = useState(false)
  const [freshLaunchResolved, setFreshLaunchResolved] = useState(false)
  const conditionalPasskeyStarted = useRef(false)
  const conditionalPasskeyAbort = useRef<AbortController | null>(null)
  const existingSessionFound = useRef(false)

  const router = useRouter()
  const supabase = getBrowserSupabaseClient()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setFreshLaunch(params.get('fresh') === '1')
    setFreshLaunchResolved(true)
  }, [])

  // --- LOGIC: Validate Branch, Password Status & Redirect ---
  const postLoginChecks = async (userId: string, accessToken?: string) => {
    // 1. Check database for Account Status, Branch Code match AND Temporary Password Flag
    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('is_active, is_temporary_password, locations(branch_code)')
      .eq('id', userId)
      .single()

    if (employeeError || !employee) {
      await supabase.auth.signOut()
      throw new Error('Your staff account could not be verified. Contact your administrator.')
    }

    // --- CHECK: Account Active Status ---
    if (employee?.is_active === false) {
      await supabase.auth.signOut()
      throw new Error('Your account has been disabled. Contact your administrator for access.')
    }
    // ----------------------------------------

    // --- FORCE PASSWORD CHANGE CHECK ---
    if (employee?.is_temporary_password) {
      router.replace('/auth/new-password')
      return
    }
    // ----------------------------------------

    const assignedLocation = employee?.locations
    const assignedCode = Array.isArray(assignedLocation)
      ? assignedLocation[0]?.branch_code
      : (assignedLocation as { branch_code?: string | null } | null | undefined)?.branch_code

    // If a branch code was typed, it MUST match the user's assigned location
    if (branchCode && assignedCode !== branchCode) {
      await supabase.auth.signOut()
      throw new Error(`Access Denied: You are not authorized for branch ${branchCode}`)
    }

    const token = accessToken || (await supabase.auth.getSession()).data.session?.access_token || ''
    const assurance = token ? await getPortalSessionAssurance(supabase, token) : 'aal1'
    if (assurance === 'passkey' || assurance === 'aal2') {
      router.replace('/dashboard')
      return
    }

    // 2. Check 2FA Status
    const { data: mfa } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

    if (mfa?.nextLevel === 'aal2') {
      router.replace('/login/verify-2fa')
    } else {
      router.replace('/login/setup-2fa')
    }
  }

  useEffect(() => {
    if (!freshLaunchResolved) return

    let cancelled = false

    setPasskeySupported(isWebAuthnSupported())

    const resumeExistingSession = async () => {
      if (freshLaunch) {
        if (!cancelled) setCheckingExistingSession(false)
        return
      }

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (cancelled) return
        if (session?.user) {
          existingSessionFound.current = true
          await postLoginChecks(session.user.id, session.access_token)
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
  }, [freshLaunchResolved, freshLaunch])

  useEffect(() => {
    if (!freshLaunchResolved || checkingExistingSession || !passkeySupported) return
    if (existingSessionFound.current) return
    if (conditionalPasskeyStarted.current) return
    conditionalPasskeyStarted.current = true

    const controller = new AbortController()
    conditionalPasskeyAbort.current = controller

    const beginConditionalSignIn = async () => {
      if (!(await isConditionalPasskeySupported())) return
      let result: Awaited<ReturnType<typeof signInWithPasskey>>
      try {
        result = await signInWithPasskey({ conditional: true, signal: controller.signal })
      } catch {
        // Cancellation, no matching passkey, and choosing password login are
        // all expected outcomes for conditional mediation.
        return
      }

      await fetch('/api/auth/security-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'passkey_login',
          status: 'success',
          metadata: { flow: 'conditional' },
        }),
      }).catch(() => undefined)

      try {
        await postLoginChecks(result.user.id, result.session.access_token)
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          setErrorMsg(getErrorMessage(error, 'Unable to verify your staff account'))
        }
      }
    }

    void beginConditionalSignIn()
    return () => controller.abort()
    // Start conditional mediation once after the existing-session check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshLaunchResolved, checkingExistingSession, passkeySupported])

  // --- HANDLER: Standard Login ---
  const handleStandardLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    conditionalPasskeyAbort.current?.abort()
    setLoading(true)
    setErrorMsg('')
    const loginEmail = email.trim().toLowerCase()

    try {
      const response = await fetch('/api/auth/password-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ email: loginEmail, password }),
      })
      const result = (await response.json().catch(() => ({}))) as {
        accessToken?: string
        refreshToken?: string
        error?: string
        remainingSeconds?: number
      }
      if (!response.ok || !result.accessToken || !result.refreshToken) {
        if (response.status === 429 && result.remainingSeconds) {
          const minutes = Math.max(1, Math.ceil(result.remainingSeconds / 60))
          throw new Error(`Too many failed attempts. Try again in about ${minutes} minute(s).`)
        }
        throw new Error(result.error || 'Login failed')
      }

      const { data, error } = await supabase.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      })
      if (error || !data.user) throw error || new Error('Unable to establish your login session')

      await postLoginChecks(data.user.id, data.session?.access_token)
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, 'Login failed'))
      setLoading(false)
    }
  }

  const handlePasskeyLogin = async () => {
    if (!passkeySupported) {
      setErrorMsg('This browser does not support passkeys.')
      return
    }

    conditionalPasskeyAbort.current?.abort()
    setPasskeyLoading(true)
    setErrorMsg('')

    try {
      const result = await signInWithPasskey()
      await fetch('/api/auth/security-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'passkey_login',
          status: 'success',
          metadata: { flow: 'explicit' },
        }),
      }).catch(() => undefined)
      await postLoginChecks(result.user.id, result.session.access_token)
    } catch (err: unknown) {
      await fetch('/api/auth/security-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'passkey_login',
          status: 'failed',
          metadata: { flow: 'explicit' },
        }),
      }).catch(() => undefined)
      setErrorMsg(getErrorMessage(err, 'Passkey sign-in failed'))
      setPasskeyLoading(false)
    }
  }

  // --- HANDLER: Microsoft SSO ---
  const handleMicrosoftLogin = async () => {
    conditionalPasskeyAbort.current?.abort()
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/login`,
        scopes: 'email',
      },
    })
  }

  return (
    <>
      <main className="mobile-auth-flow platform-mobile-flex min-h-[100dvh] flex-col overflow-hidden bg-white text-slate-950">
        <header className="relative overflow-hidden rounded-b-[2rem] bg-[#4b0f16] px-5 pb-10 pt-[calc(1.25rem+env(safe-area-inset-top))] text-white shadow-xl shadow-red-950/20">
          <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="rounded-2xl bg-white px-3 py-2 shadow-lg">
              <Image
                src="/logo.png"
                alt="Piyam Travels"
                width={797}
                height={313}
                className="h-9 w-auto object-contain"
                priority
              />
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-red-50 ring-1 ring-white/15">
              <ShieldCheck className="h-4 w-4" />
              Secure access
            </div>
          </div>
          <div className="relative mt-8">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-red-100">
              Staff portal
            </p>
            <h1 className="mt-2 text-[2rem] font-black leading-tight">Welcome back</h1>
            <p className="mt-3 max-w-sm text-base leading-6 text-red-50/85">
              Sign in to continue to today&apos;s applications, bookings, and staff tools.
            </p>
          </div>
        </header>

        <section className="relative -mt-5 flex-1 rounded-t-[2rem] bg-white px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-7">
          {checkingExistingSession && (
            <div className="mb-4 flex min-h-12 items-center gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-[#4b0f16]">
              <Loader2 className="h-5 w-5 animate-spin" />
              Checking your secure session
            </div>
          )}

          {errorMsg && (
            <div
              className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-5 text-red-700"
              role="alert"
            >
              {errorMsg}
            </div>
          )}

          <div className="space-y-3">
            {passkeySupported && (
              <button
                type="button"
                onClick={() => void handlePasskeyLogin()}
                disabled={passkeyLoading || checkingExistingSession}
                className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#4b0f16] px-5 py-3 text-base font-black text-white shadow-lg shadow-red-950/15 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {passkeyLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <FingerprintPattern className="h-6 w-6" />
                )}
                {passkeyLoading
                  ? 'Checking passkey...'
                  : `Sign in with ${getMobilePlatformLabel()}`}
              </button>
            )}

            <button
              type="button"
              onClick={handleMicrosoftLogin}
              className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl border-2 border-slate-200 bg-white px-5 py-3 text-base font-black text-slate-900 transition active:bg-slate-50"
            >
              Sign in with Microsoft
            </button>
          </div>

          <div className="my-6 flex items-center gap-3" aria-hidden="true">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-black uppercase tracking-[0.15em] text-slate-400">
              Branch credentials
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={handleStandardLogin} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-black text-slate-800">Email</span>
              <span className="relative block">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  autoComplete="username webauthn"
                  inputMode="email"
                  className="min-h-14 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-base text-slate-950 outline-none transition focus:border-[#8b1e2d] focus:bg-white focus:ring-4 focus:ring-red-100"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-black text-slate-800">Password</span>
              <span className="relative block">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  className="min-h-14 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-base text-slate-950 outline-none transition focus:border-[#8b1e2d] focus:bg-white focus:ring-4 focus:ring-red-100"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-black text-slate-800">Branch code</span>
              <span className="relative block">
                <MapPin className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  autoComplete="organization"
                  autoCapitalize="characters"
                  placeholder="e.g. HQ-001"
                  className="min-h-14 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-base uppercase tracking-wide text-slate-950 outline-none transition placeholder:normal-case placeholder:tracking-normal focus:border-[#8b1e2d] focus:bg-white focus:ring-4 focus:ring-red-100"
                  value={branchCode}
                  onChange={(event) => setBranchCode(event.target.value.toUpperCase())}
                />
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || checkingExistingSession}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-base font-black text-white shadow-lg transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
              {loading ? 'Verifying access…' : 'Continue securely'}
            </button>
          </form>
        </section>
      </main>

      <main className="platform-desktop-only relative min-h-screen overflow-hidden bg-[#f5f5f5] text-slate-950">
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
                Authenticate with branch credentials, passkeys, or Microsoft SSO to get to HRMS,
                bookings, applications, and finance workflows.
              </p>
            </div>

            <div className="mt-10 grid gap-4">
              {[
                {
                  label: 'Fast branch validation',
                  description:
                    'Branch code verification keeps access restricted to assigned locations.',
                },
                {
                  label: 'Passkey ready',
                  description:
                    'Passkeys are supported for faster, password-free login on modern devices.',
                },
                {
                  label: '2FA enforced',
                  description:
                    'Multi-factor security helps protect your IMS session and HRMS handoff.',
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
                  Authenticate once to continue to your dashboard, HRMS handoff, and staff
                  workflows.
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
                onClick={() => void handlePasskeyLogin()}
                disabled={passkeyLoading || checkingExistingSession}
                className="mb-4 flex w-full items-center justify-center gap-3 rounded-[1.75rem] bg-[#4b0f16] px-5 py-4 font-bold text-white shadow-xl shadow-emerald-900/15 transition hover:bg-[#6f1422] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {passkeyLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <FingerprintPattern className="h-5 w-5" />
                )}
                <span>
                  {passkeyLoading
                    ? 'Checking passkey...'
                    : `Sign in with ${getMobilePlatformLabel()}`}
                </span>
              </button>
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
                    autoComplete="username webauthn"
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
    </>
  )
}
