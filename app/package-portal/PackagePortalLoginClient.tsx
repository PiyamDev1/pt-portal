'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, ShieldCheck } from 'lucide-react'

export default function PackagePortalLoginClient() {
  const router = useRouter()
  const [reference, setReference] = useState('')
  const [lastName, setLastName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/package-portal/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference, lastName }),
      })
      const data = (await response.json()) as { token?: string; error?: string }
      if (!response.ok || !data.token) throw new Error(data.error || 'Package details do not match')
      router.push(`/package-portal/${encodeURIComponent(data.token)}`)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to open package portal')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 text-slate-950">
      <section className="w-full max-w-md border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between bg-[#4b0f16] px-5 py-4 text-white">
          <div>
            <p className="text-xs font-bold uppercase text-red-100">Customer portal</p>
            <h1 className="mt-1 text-xl font-black">Your travel package</h1>
          </div>
          <div className="bg-white p-2">
            <Image
              src="/logo.png"
              alt="Piyam Travel"
              width={84}
              height={36}
              className="h-9 w-auto object-contain"
              priority
            />
          </div>
        </header>
        <form onSubmit={submit} className="space-y-4 p-5">
          <div className="flex items-start gap-3 border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#8b1e2d]" />
            <p>Use the package reference supplied by your agent and the lead passenger surname.</p>
          </div>
          <label className="block text-sm font-bold text-slate-700">
            Package reference
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value.toUpperCase())}
              placeholder="PT-ABC123"
              autoComplete="off"
              className="mt-1.5 w-full border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
              required
            />
          </label>
          <label className="block text-sm font-bold text-slate-700">
            Lead passenger surname
            <input
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              autoComplete="family-name"
              className="mt-1.5 w-full border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
              required
            />
          </label>
          {error && (
            <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !reference.trim() || !lastName.trim()}
            className="inline-flex w-full items-center justify-center gap-2 bg-[#8b1e2d] px-4 py-2.5 text-sm font-black text-white hover:bg-[#741824] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            Open package portal
          </button>
        </form>
      </section>
    </main>
  )
}
