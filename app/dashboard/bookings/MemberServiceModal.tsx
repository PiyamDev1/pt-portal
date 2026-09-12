'use client'

import { BadgeCheck, Check, LoaderCircle, ScanLine, UserRoundCheck, X } from 'lucide-react'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type MemberServiceAvailability = {
  member: { customerCode: string; maskedCode: string; name: string }
  branch: { id: string; name: string }
  rank: { key: string; name: string; colour: string } | null
  allowance: number
  used: number
  remaining: number
  canUse: boolean
  unavailableReason: string | null
  programmeYear: number
}

type ApiResponse<T> = T | { error: string | { message?: string } }

function errorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) return fallback
  const error = (payload as { error?: unknown }).error
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return fallback
}

export default function MemberServiceModal({
  isOpen,
  locationId,
  locationName,
  onClose,
}: {
  isOpen: boolean
  locationId: string
  locationName: string
  onClose: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const onCloseRef = useRef(onClose)
  const [code, setCode] = useState('')
  const [availability, setAvailability] = useState<MemberServiceAvailability | null>(null)
  const [phase, setPhase] = useState<'scan' | 'lookup' | 'confirm' | 'saving' | 'success'>('scan')
  const [error, setError] = useState<string | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState('')

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return
    setCode('')
    setAvailability(null)
    setError(null)
    setIdempotencyKey('')
    setPhase('scan')
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 80)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!code.trim() || !locationId) return
    setPhase('lookup')
    setError(null)
    try {
      const response = await fetch('/api/loyalty/walk-ins/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerCode: code, locationId }),
      })
      const payload = (await response.json()) as ApiResponse<MemberServiceAvailability>
      if (!response.ok || 'error' in payload) {
        throw new Error(errorMessage(payload, 'The loyalty card could not be checked.'))
      }
      setAvailability(payload)
      setCode(payload.member.customerCode)
      setIdempotencyKey(crypto.randomUUID())
      setPhase('confirm')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The loyalty card could not be checked.')
      setPhase('scan')
      window.setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  async function confirmUse() {
    if (!availability?.canUse || !locationId) return
    setPhase('saving')
    setError(null)
    try {
      const response = await fetch('/api/loyalty/walk-ins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerCode: availability.member.customerCode,
          locationId,
          idempotencyKey: idempotencyKey || crypto.randomUUID(),
        }),
      })
      const payload = (await response.json()) as ApiResponse<
        MemberServiceAvailability & { idempotentReplay: boolean }
      >
      if (!response.ok || 'error' in payload) {
        throw new Error(errorMessage(payload, 'The walk-in use could not be recorded.'))
      }
      setAvailability((current) =>
        current
          ? {
              ...current,
              allowance: payload.allowance,
              used: payload.used,
              remaining: payload.remaining,
            }
          : current,
      )
      setPhase('success')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The walk-in use could not be recorded.')
      setPhase('confirm')
    }
  }

  function scanAnother() {
    setCode('')
    setAvailability(null)
    setError(null)
    setIdempotencyKey('')
    setPhase('scan')
    window.setTimeout(() => inputRef.current?.focus(), 50)
  }

  if (!isOpen || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-service-title"
        className="w-full overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:max-w-lg sm:rounded-[2rem]"
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-[#651524] via-[#7f1d2d] to-[#a92b40] px-5 pb-6 pt-5 text-white sm:px-6">
          <div className="absolute -right-10 -top-12 size-40 rounded-full bg-white/10" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                <UserRoundCheck className="size-6" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">
                  Appointments
                </p>
                <h2 id="member-service-title" className="mt-1 text-xl font-black">
                  Member Service
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ui-focus grid size-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              aria-label="Close Member Service"
            >
              <X className="size-5" />
            </button>
          </div>
          <p className="relative mt-4 text-sm leading-6 text-white/80">
            {locationName || 'Select a branch'} · scan the customer’s loyalty card to check their
            annual walk-in allowance.
          </p>
        </div>

        <div className="max-h-[72vh] overflow-y-auto p-5 sm:p-6">
          {phase === 'scan' || phase === 'lookup' ? (
            <form onSubmit={lookup}>
              <label className="text-sm font-black text-slate-800" htmlFor="member-service-code">
                Scan loyalty card
              </label>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                The scanner can type directly into this field. Press Enter after scanning, or enter
                the customer code manually.
              </p>
              <div className="mt-4 rounded-2xl border-2 border-dashed border-red-200 bg-red-50/60 p-4">
                <div className="relative">
                  <ScanLine
                    className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#7f1d2d]"
                    aria-hidden="true"
                  />
                  <input
                    ref={inputRef}
                    id="member-service-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Scan QR or enter customer code"
                    className="min-h-14 w-full rounded-xl border border-red-200 bg-white pl-12 pr-4 font-mono text-sm font-bold text-slate-800 outline-none focus:border-[#7f1d2d] focus:ring-4 focus:ring-red-100"
                  />
                </div>
              </div>
              {error ? (
                <p
                  role="alert"
                  className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800"
                >
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={!code.trim() || !locationId || phase === 'lookup'}
                className="ui-tap ui-focus mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#7f1d2d] px-4 text-sm font-black text-white shadow-lg shadow-red-950/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {phase === 'lookup' ? (
                  <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                ) : (
                  <ScanLine className="size-5" aria-hidden="true" />
                )}
                {phase === 'lookup' ? 'Checking member…' : 'Check member'}
              </button>
            </form>
          ) : availability ? (
            <div>
              {phase === 'success' ? (
                <div className="mb-5 rounded-2xl bg-emerald-50 p-5 text-center ring-1 ring-emerald-200">
                  <span className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-900/20">
                    <Check className="size-7" strokeWidth={3} aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 text-lg font-black text-emerald-900">Walk-in confirmed</h3>
                  <p className="mt-1 text-sm text-emerald-800">
                    One usage has been recorded. {availability.remaining} remain for{' '}
                    {availability.programmeYear}.
                  </p>
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Loyalty member
                    </p>
                    <p className="mt-1 text-lg font-black text-slate-900">
                      {availability.member.name}
                    </p>
                    <p className="mt-1 font-mono text-xs font-bold text-slate-500">
                      {availability.member.maskedCode}
                    </p>
                  </div>
                  {availability.rank ? (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black text-white shadow-sm"
                      style={{ backgroundColor: availability.rank.colour }}
                    >
                      <BadgeCheck className="size-4" aria-hidden="true" />
                      {availability.rank.name}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <b className="block text-xl text-slate-900">{availability.allowance}</b>
                    <span className="text-[10px] font-bold uppercase text-slate-500">Annual</span>
                  </div>
                  <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <b className="block text-xl text-slate-900">{availability.used}</b>
                    <span className="text-[10px] font-bold uppercase text-slate-500">Used</span>
                  </div>
                  <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <b className="block text-xl text-[#7f1d2d]">{availability.remaining}</b>
                    <span className="text-[10px] font-bold uppercase text-slate-500">
                      Remaining
                    </span>
                  </div>
                </div>
              </div>

              {error || availability.unavailableReason ? (
                <p
                  role="alert"
                  className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200"
                >
                  {error || availability.unavailableReason}
                </p>
              ) : phase !== 'success' ? (
                <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900 ring-1 ring-emerald-200">
                  Confirm that this customer is using one member walk-in now at{' '}
                  {availability.branch.name}.
                </p>
              ) : null}

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {phase === 'success' ? (
                  <>
                    <button
                      type="button"
                      onClick={scanAnother}
                      className="ui-tap ui-focus min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700"
                    >
                      Scan another
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="ui-tap ui-focus min-h-12 rounded-xl bg-[#7f1d2d] px-4 text-sm font-black text-white"
                    >
                      Done
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={scanAnother}
                      className="ui-tap ui-focus min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700"
                    >
                      Scan again
                    </button>
                    <button
                      type="button"
                      onClick={() => void confirmUse()}
                      disabled={!availability.canUse || phase === 'saving'}
                      className="ui-tap ui-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#7f1d2d] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {phase === 'saving' ? (
                        <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="size-5" aria-hidden="true" />
                      )}
                      {phase === 'saving' ? 'Recording…' : 'Confirm walk-in use'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  )
}
