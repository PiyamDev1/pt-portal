'use client'

import { BadgePoundSterling, Save, Settings2, Sparkles } from 'lucide-react'
import { FormEvent, useState } from 'react'

import type { LoyaltyDashboardPayload } from '@/lib/loyalty/contracts'

const inputClass =
  'min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#7f1d2d] focus:ring-2 focus:ring-red-100'

export function LoyaltyProgramManager({
  program: initialProgram,
}: Pick<LoyaltyDashboardPayload, 'program'>) {
  const [program, setProgram] = useState(initialProgram)
  const [pending, setPending] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function save(key: string, body: Record<string, unknown>) {
    setPending(key)
    setMessage(null)
    setError(null)
    try {
      const response = await fetch('/api/loyalty/program', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = (await response.json()) as LoyaltyDashboardPayload & { error?: string }
      if (!response.ok) throw new Error(payload.error || 'The change could not be saved.')
      setProgram(payload.program)
      setMessage('Saved. The change and administrator were recorded in the audit history.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The change could not be saved.')
    } finally {
      setPending(null)
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-red-50 text-[#7f1d2d]">
          <Settings2 className="size-5" />
        </span>
        <div>
          <h2 className="text-xl font-black">Programme settings</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            Maintain standard earning amounts and voucher values. Temporary bonus events are managed
            separately in Campaigns, with their own audience, schedule and safety limits.
          </p>
        </div>
      </div>
      {message ? (
        <p
          role="status"
          className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section>
          <h3 className="flex items-center gap-2 font-black">
            <Sparkles className="size-4 text-[#7f1d2d]" /> Standard earning values
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            These values apply outside temporary campaigns.
          </p>
          <div className="mt-3 space-y-2">
            {program.earningRules.map((rule) => (
              <form
                key={rule.key}
                onSubmit={(event) => {
                  event.preventDefault()
                  const data = new FormData(event.currentTarget)
                  void save(`earning:${rule.key}`, {
                    action: 'UPDATE_EARNING_RULE',
                    ruleKey: rule.key,
                    points: Number(data.get('points')),
                    isActive: data.get('isActive') === 'on',
                  })
                }}
                className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3"
              >
                <div className="min-w-44 flex-1">
                  <p className="text-sm font-black">{rule.label}</p>
                  <p className="mt-1 text-xs text-slate-500">Per {rule.unit}</p>
                </div>
                <label className="w-24 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  Points
                  <input
                    aria-label={`${rule.label} points`}
                    name="points"
                    type="number"
                    min="1"
                    max="100000"
                    defaultValue={rule.points}
                    className={`${inputClass} mt-1 w-full text-right font-black`}
                  />
                </label>
                <label className="flex min-h-11 items-center gap-2 text-xs font-bold">
                  <input name="isActive" type="checkbox" defaultChecked={rule.isActive !== false} />{' '}
                  Active
                </label>
                <button
                  aria-label={`Save ${rule.label}`}
                  disabled={pending !== null}
                  className="grid size-11 place-items-center rounded-xl bg-[#7f1d2d] text-white disabled:opacity-50"
                >
                  <Save className="size-4" />
                </button>
              </form>
            ))}
          </div>
        </section>

        <section>
          <h3 className="flex items-center gap-2 font-black">
            <BadgePoundSterling className="size-4 text-[#7f1d2d]" /> Voucher rewards
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Set the cash value and validity. Active rewards must retain at least 300 points for
            every pound of value; the standard exchange uses 400 points per pound.
          </p>
          <div className="mt-3 space-y-2">
            {program.voucherRewards.map((reward) => (
              <form
                key={reward.points}
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault()
                  const data = new FormData(event.currentTarget)
                  void save(`voucher:${reward.points}`, {
                    action: 'UPSERT_VOUCHER_REWARD',
                    pointsCost: reward.points,
                    valuePence: Math.round(Number(data.get('valuePounds')) * 100),
                    validityMonths: Number(data.get('validityMonths')),
                    displayOrder: reward.points,
                    isActive: data.get('isActive') === 'on',
                  })
                }}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-[1fr_7rem_6rem_auto] sm:items-end"
              >
                <div>
                  <p className="text-sm font-black">
                    {reward.points.toLocaleString('en-GB')} points
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {Math.round(reward.points / (reward.valuePence / 100)).toLocaleString('en-GB')}{' '}
                    points per £1
                  </p>
                  <label className="mt-2 flex items-center gap-2 text-xs font-bold">
                    <input
                      name="isActive"
                      type="checkbox"
                      defaultChecked={reward.isActive !== false}
                    />{' '}
                    Active reward
                  </label>
                </div>
                <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                  Value (£)
                  <input
                    aria-label={`${reward.points} point voucher value`}
                    name="valuePounds"
                    type="number"
                    min="0.01"
                    step="0.01"
                    defaultValue={(reward.valuePence / 100).toFixed(2)}
                    className={`${inputClass} mt-1 w-full`}
                  />
                </label>
                <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                  Valid months
                  <input
                    aria-label={`${reward.points} point voucher validity months`}
                    name="validityMonths"
                    type="number"
                    min="1"
                    max="36"
                    defaultValue={reward.validityMonths ?? 6}
                    className={`${inputClass} mt-1 w-full`}
                  />
                </label>
                <button
                  aria-label={`Save ${reward.points} point voucher`}
                  disabled={pending !== null}
                  className="grid size-11 place-items-center rounded-xl bg-[#7f1d2d] text-white disabled:opacity-50"
                >
                  <Save className="size-4" />
                </button>
              </form>
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}
