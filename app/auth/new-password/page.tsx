/**
 * New Password Page
 * Handles first-login or reset-password flow and then returns users to login.
 *
 * @module app/auth/new-password/page
 */

'use client'
import { useMemo, useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { ShieldCheck, LockKeyhole, Loader2, Shield } from 'lucide-react'
import { toast } from 'sonner'

export default function NewPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [loadingUser, setLoadingUser] = useState(true)
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  useEffect(() => {
    let active = true

    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!active) return
      if (user?.email) {
        setUserEmail(user.email)
      } else {
        router.push('/login')
      }
      setLoadingUser(false)
    }

    void getUser()
    return () => {
      active = false
    }
  }, [router, supabase])

  const requirements = useMemo(
    () => [
      { label: 'At least 8 characters', valid: password.length >= 8 },
      { label: 'One lowercase letter', valid: /[a-z]/.test(password) },
      { label: 'One uppercase letter', valid: /[A-Z]/.test(password) },
      { label: 'One number', valid: /[0-9]/.test(password) },
      {
        label: 'One special character',
        valid: /[!@#$%^&*(),.?":{}|<>\-_=+\\/\[\];']/.test(password),
      },
    ],
    [password],
  )

  const passwordStrength = useMemo(
    () => requirements.filter((requirement) => requirement.valid).length,
    [requirements],
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      toast.error('Passwords do not match')
      return
    }

    const missing = requirements.filter((requirement) => !requirement.valid)
    if (missing.length > 0) {
      toast.error('Complete all password requirements before continuing.')
      return
    }

    setLoading(true)
    const res = await fetch('/api/auth/update-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: password }),
    })

    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error || 'Unable to update password')
      setLoading(false)
      return
    }

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password,
    })

    if (loginError) {
      toast.warning('Password updated, but re-login failed. Please sign in again.')
      router.push('/login')
    } else {
      router.push('/login/setup-2fa')
    }
    setLoading(false)
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5f5f5] text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(139,30,45,0.18),_transparent_34%),linear-gradient(135deg,_#f7fbf7_0%,_#f1e7e9_45%,_#f8fafc_100%)]" />
      <div className="pointer-events-none absolute right-[-10rem] top-[-12rem] h-96 w-96 rounded-full bg-red-200/30 blur-3xl" />
      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-5 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
        <section className="hidden rounded-[2rem] border border-red-100 bg-white/90 p-10 shadow-2xl shadow-red-950/10 backdrop-blur lg:block">
          <div className="flex items-center gap-3 rounded-3xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-sm">
            <ShieldCheck className="h-4 w-4" />
            Secured by IMS portal design
          </div>
          <div className="mt-10">
            <h1 className="text-5xl font-black tracking-tight text-slate-950">Finish secure access</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              Your temporary password protects the first login. Create a strong new password now to continue into the IMS dashboard and keep your account secure.
            </p>
          </div>

          <div className="mt-10 grid gap-4 text-sm leading-6 text-slate-700">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">What happens next</p>
              <p className="mt-3 text-sm text-slate-600">
                Your new password will be applied immediately, and you will be returned to the authentication flow for secure two-factor verification.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Why strong passwords matter</p>
              <p className="mt-3 text-sm text-slate-600">
                Strong credentials reduce risk for your IMS account, protect HRMS handoff, and keep branch access secure.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/80 bg-white/95 p-8 shadow-2xl shadow-slate-900/10 backdrop-blur md:p-10">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-3xl bg-[#4b0f16] text-white shadow-lg shadow-emerald-900/15">
                <Shield className="h-6 w-6" />
              </div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#8b1e2d]">Authentication</p>
              <h2 className="mt-3 text-3xl font-black text-slate-950">New password required</h2>
              <p className="mt-2 text-sm text-slate-600">
                Set a secure password for <span className="font-semibold text-slate-900">{userEmail || 'your account'}</span>.
              </p>
            </div>
            <div className="rounded-3xl bg-red-50 px-4 py-3 text-sm font-semibold text-[#7f1d1d] shadow-sm">
              Temporary access reset
            </div>
          </div>

          {loadingUser ? (
            <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600 shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your secure session...
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-700">New password</label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  minLength={8}
                  disabled={loadingUser}
                  className="w-full rounded-3xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-slate-950 outline-none transition focus:border-[#8b1e2d] focus:bg-white focus:ring-4 focus:ring-red-100"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-700">Confirm password</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  minLength={8}
                  disabled={loadingUser}
                  className="w-full rounded-3xl border border-slate-200 bg-slate-50 py-4 px-4 text-slate-950 outline-none transition focus:border-[#8b1e2d] focus:bg-white focus:ring-4 focus:ring-red-100"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="font-bold text-slate-900">Password strength</p>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.18em] ${
                    passwordStrength === 5
                      ? 'bg-emerald-100 text-emerald-900'
                      : passwordStrength >= 3
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-red-100 text-red-900'
                  }`}
                >
                  {passwordStrength === 5 ? 'Strong' : passwordStrength >= 3 ? 'Fair' : 'Weak'}
                </span>
              </div>
              <div className="overflow-hidden rounded-full bg-slate-200 h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${
                    passwordStrength === 5
                      ? 'bg-emerald-500 w-full'
                      : passwordStrength >= 3
                      ? 'bg-amber-500 w-3/4'
                      : 'bg-red-500 w-1/2'
                  }`}
                />
              </div>
              <div className="mt-4 grid gap-2 text-xs text-slate-600">
                {requirements.map((requirement) => (
                  <div key={requirement.label} className="flex items-center gap-2">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full border text-[0.65rem] font-bold ${
                        requirement.valid
                          ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
                          : 'border-slate-300 bg-white text-slate-400'
                      }`}
                    >
                      {requirement.valid ? '✓' : '•'}
                    </span>
                    <span className={requirement.valid ? 'text-slate-900' : 'text-slate-500'}>
                      {requirement.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || loadingUser}
              className="flex w-full items-center justify-center gap-3 rounded-[1.75rem] bg-[#4b0f16] px-5 py-4 text-sm font-black uppercase tracking-[0.12em] text-white shadow-xl shadow-emerald-900/15 transition hover:bg-[#6f1422] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? 'Applying update…' : 'Apply secure password'}
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}
