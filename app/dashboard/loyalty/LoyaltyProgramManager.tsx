'use client'

import { BadgePoundSterling, Save, Settings2, Sparkles, Trash2 } from 'lucide-react'
import { FormEvent, useState } from 'react'

import type { LoyaltyDashboardPayload } from '@/lib/loyalty/contracts'

const inputClass =
  'min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#7f1d2d] focus:ring-2 focus:ring-red-100'

export function LoyaltyProgramManager({
  program: initialProgram,
  campaignOptions,
}: Pick<LoyaltyDashboardPayload, 'program' | 'campaignOptions'>) {
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

  async function consumeWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setPending('walkin:consume')
    setMessage(null)
    setError(null)
    try {
      const response = await fetch('/api/loyalty/walk-ins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerCode: data.get('customerCode'),
          locationId: data.get('locationId'),
          serviceType: data.get('serviceType'),
          idempotencyKey: crypto.randomUUID(),
          isOverride: data.get('isOverride') === 'on',
          consumeAllowance: data.get('consumeAllowance') === 'on',
          overrideReason: String(data.get('overrideReason') || '').trim() || null,
        }),
      })
      const payload = await response.json()
      if (!response.ok)
        throw new Error(
          payload.error?.message || payload.error || 'Walk-in use could not be recorded.',
        )
      setMessage(`Walk-in recorded. ${payload.data?.remaining ?? 0} annual uses remain.`)
      event.currentTarget.reset()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Walk-in use could not be recorded.')
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
            Cash values and the three-month validity are fixed. Change only the points customers
            need, or remove a reward from the catalogue.
          </p>
          <div className="mt-3 space-y-2">
            {program.voucherRewards.map((reward) => (
              <form
                key={`${reward.valuePence}:${reward.points}`}
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault()
                  const data = new FormData(event.currentTarget)
                  void save(`voucher:${reward.points}`, {
                    action: 'UPDATE_VOUCHER_POINTS',
                    currentPointsCost: reward.points,
                    pointsCost: Number(data.get('pointsCost')),
                  })
                }}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:flex-row sm:items-end"
              >
                <div className="min-w-36 flex-1">
                  <p className="text-lg font-black">£{(reward.valuePence / 100).toFixed(2)}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Fixed voucher value · use within {reward.validityMonths ?? 3} months
                  </p>
                </div>
                <label className="w-full text-[10px] font-black uppercase tracking-wide text-slate-500 sm:w-36">
                  Points required
                  <input
                    aria-label={`Points required for £${(reward.valuePence / 100).toFixed(2)} voucher`}
                    name="pointsCost"
                    type="number"
                    min={reward.valuePence * 2}
                    max="1000000"
                    defaultValue={reward.points}
                    className={`${inputClass} mt-1 w-full text-right font-black`}
                  />
                </label>
                <button
                  aria-label={`Save points for £${(reward.valuePence / 100).toFixed(2)} voucher`}
                  disabled={pending !== null}
                  className="grid size-11 place-items-center rounded-xl bg-[#7f1d2d] text-white disabled:opacity-50"
                >
                  <Save className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete £${(reward.valuePence / 100).toFixed(2)} voucher reward`}
                  disabled={pending !== null}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Remove the £${(reward.valuePence / 100).toFixed(2)} voucher reward? Existing issued vouchers will remain valid.`,
                      )
                    )
                      return
                    void save(`voucher:${reward.points}:delete`, {
                      action: 'DELETE_VOUCHER_REWARD',
                      pointsCost: reward.points,
                    })
                  }}
                  className="grid size-11 place-items-center rounded-xl border border-red-200 bg-white text-red-700 disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              </form>
            ))}
            {!program.voucherRewards.length ? (
              <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
                No voucher rewards are currently offered.
              </p>
            ) : null}
          </div>
        </section>
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section>
          <h3 className="font-black">Ranks and benefits</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Threshold edits require confirmation because they can change active customer ranks.
          </p>
          <div className="mt-3 space-y-3">
            {program.ranks.map((rank) => (
              <form
                key={rank.key}
                onSubmit={(event) => {
                  event.preventDefault()
                  const data = new FormData(event.currentTarget)
                  const minimumPoints = Number(data.get('minimumPoints'))
                  const maximumRaw = String(data.get('maximumPoints') ?? '').trim()
                  if (
                    (minimumPoints !== rank.minimumPoints ||
                      (maximumRaw ? Number(maximumRaw) : null) !== rank.maximumPoints) &&
                    !window.confirm(
                      'This threshold change can move active customers between ranks. Continue?',
                    )
                  )
                    return
                  void save(`rank:${rank.key}`, {
                    action: 'UPDATE_RANK',
                    rankKey: rank.key,
                    minimumPoints,
                    maximumPoints: maximumRaw ? Number(maximumRaw) : null,
                    maintenancePoints: Number(data.get('maintenancePoints')),
                    walkInAllowance: Number(data.get('walkInAllowance')),
                    callbackPriority: rank.callbackPriority,
                    waitlistPriority: rank.waitlistPriority,
                    perks: String(data.get('perks'))
                      .split('\n')
                      .map((item) => item.trim())
                      .filter(Boolean),
                    confirmCustomerImpact: true,
                  })
                }}
                className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3"
              >
                <p className="font-black">{rank.name}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="text-[10px] font-black uppercase text-slate-500">
                    From
                    <input
                      name="minimumPoints"
                      type="number"
                      min="0"
                      defaultValue={rank.minimumPoints}
                      className={`${inputClass} mt-1 w-full`}
                    />
                  </label>
                  <label className="text-[10px] font-black uppercase text-slate-500">
                    To
                    <input
                      name="maximumPoints"
                      type="number"
                      min="0"
                      defaultValue={rank.maximumPoints ?? ''}
                      placeholder="No limit"
                      className={`${inputClass} mt-1 w-full`}
                    />
                  </label>
                  <label className="text-[10px] font-black uppercase text-slate-500">
                    Maintain
                    <input
                      name="maintenancePoints"
                      type="number"
                      min="0"
                      defaultValue={rank.maintenancePoints}
                      className={`${inputClass} mt-1 w-full`}
                    />
                  </label>
                  <label className="text-[10px] font-black uppercase text-slate-500">
                    Walk-ins
                    <input
                      name="walkInAllowance"
                      type="number"
                      min="0"
                      defaultValue={rank.walkInAllowance}
                      className={`${inputClass} mt-1 w-full`}
                    />
                  </label>
                </div>
                <label className="mt-2 block text-[10px] font-black uppercase text-slate-500">
                  Customer-safe benefits
                  <textarea
                    name="perks"
                    defaultValue={rank.perks.join('\n')}
                    rows={3}
                    className={`${inputClass} mt-1 w-full py-2`}
                  />
                </label>
                <button
                  disabled={pending !== null}
                  className="mt-2 rounded-xl bg-[#7f1d2d] px-4 py-2 text-xs font-black text-white disabled:opacity-50"
                >
                  Save rank
                </button>
              </form>
            ))}
          </div>
        </section>
        <section>
          <h3 className="font-black">Achievement stickers</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Milestones count unique completed, paid and valid transactions. Awards are reversed when
            progress falls below the threshold.
          </p>
          <div className="mt-3 space-y-3">
            {program.achievementRules.map((rule) => (
              <form
                key={rule.key}
                onSubmit={(event) => {
                  event.preventDefault()
                  const data = new FormData(event.currentTarget)
                  void save(`achievement:${rule.key}`, {
                    action: 'UPDATE_ACHIEVEMENT',
                    achievementKey: rule.key,
                    name: data.get('name'),
                    description: data.get('description'),
                    requiredTransactions: Number(data.get('requiredTransactions')),
                    bonusPoints: Number(data.get('bonusPoints')),
                    isActive: data.get('isActive') === 'on',
                  })
                }}
                className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3"
              >
                <div className="grid gap-2 sm:grid-cols-[1fr_6rem_6rem_auto] sm:items-end">
                  <label className="text-[10px] font-black uppercase text-slate-500">
                    Sticker
                    <input
                      name="name"
                      defaultValue={rule.name}
                      className={`${inputClass} mt-1 w-full`}
                    />
                  </label>
                  <label className="text-[10px] font-black uppercase text-slate-500">
                    Transactions
                    <input
                      name="requiredTransactions"
                      type="number"
                      min="1"
                      defaultValue={rule.requiredTransactions}
                      className={`${inputClass} mt-1 w-full`}
                    />
                  </label>
                  <label className="text-[10px] font-black uppercase text-slate-500">
                    Bonus
                    <input
                      name="bonusPoints"
                      type="number"
                      min="0"
                      defaultValue={rule.bonusPoints}
                      className={`${inputClass} mt-1 w-full`}
                    />
                  </label>
                  <button
                    disabled={pending !== null}
                    className="grid size-11 place-items-center rounded-xl bg-[#7f1d2d] text-white disabled:opacity-50"
                  >
                    <Save className="size-4" />
                  </button>
                </div>
                <label className="mt-2 block text-[10px] font-black uppercase text-slate-500">
                  Description
                  <input
                    name="description"
                    defaultValue={rule.description}
                    className={`${inputClass} mt-1 w-full`}
                  />
                </label>
                <label className="mt-2 flex items-center gap-2 text-xs font-bold">
                  <input name="isActive" type="checkbox" defaultChecked={rule.isActive} /> Active
                </label>
              </form>
            ))}
          </div>
        </section>
      </div>
      <section className="mt-8">
        <h3 className="font-black">Published walk-in hours</h3>
        <p className="mt-1 text-xs text-slate-500">
          Entitlements can only be consumed for NADRA or passport work at a configured branch and
          time.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            void save('walkin:new', {
              action: 'UPSERT_WALKIN_WINDOW',
              locationId: data.get('locationId'),
              serviceType: data.get('serviceType'),
              isoWeekday: Number(data.get('isoWeekday')),
              startsAt: data.get('startsAt'),
              endsAt: data.get('endsAt'),
              isActive: true,
            })
          }}
          className="mt-3 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-[1fr_9rem_8rem_8rem_8rem_auto] sm:items-end"
        >
          <label className="text-[10px] font-black uppercase text-slate-500">
            Branch
            <select name="locationId" className={`${inputClass} mt-1 w-full`}>
              {campaignOptions.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-black uppercase text-slate-500">
            Service
            <select name="serviceType" className={`${inputClass} mt-1 w-full`}>
              <option value="nadra">NADRA</option>
              <option value="passport">Passport</option>
            </select>
          </label>
          <label className="text-[10px] font-black uppercase text-slate-500">
            Day
            <select name="isoWeekday" className={`${inputClass} mt-1 w-full`}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => (
                <option key={day} value={index + 1}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-black uppercase text-slate-500">
            Starts
            <input name="startsAt" type="time" required className={`${inputClass} mt-1 w-full`} />
          </label>
          <label className="text-[10px] font-black uppercase text-slate-500">
            Ends
            <input name="endsAt" type="time" required className={`${inputClass} mt-1 w-full`} />
          </label>
          <button
            disabled={pending !== null || !campaignOptions.branches.length}
            className="min-h-11 rounded-xl bg-[#7f1d2d] px-4 text-xs font-black text-white disabled:opacity-50"
          >
            Add
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {campaignOptions.walkInWindows
            .filter((window) => window.isActive)
            .map((window) => (
              <span
                key={window.id}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"
              >
                {campaignOptions.branches.find((branch) => branch.id === window.locationId)?.name ??
                  'Branch'}{' '}
                · {window.serviceType.toUpperCase()} ·{' '}
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][window.isoWeekday - 1]}{' '}
                {window.startsAt}–{window.endsAt}{' '}
                <button
                  type="button"
                  onClick={() =>
                    void save(`walkin:${window.id}`, {
                      action: 'DELETE_WALKIN_WINDOW',
                      id: window.id,
                    })
                  }
                  className="ml-2 text-red-700"
                >
                  Remove
                </button>
              </span>
            ))}
        </div>
        <form
          onSubmit={consumeWalkIn}
          className="mt-5 rounded-2xl border border-[#7f1d2d]/20 bg-red-50/50 p-4"
        >
          <h4 className="font-black">Verify and record a walk-in</h4>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <input
              required
              name="customerCode"
              placeholder="Customer code"
              className={inputClass}
            />
            <select required name="locationId" className={inputClass}>
              {campaignOptions.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <select name="serviceType" className={inputClass}>
              <option value="nadra">NADRA</option>
              <option value="passport">Passport</option>
            </select>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="text-xs font-bold">
              <input name="consumeAllowance" type="checkbox" defaultChecked /> Consume entitlement
            </label>
            <label className="text-xs font-bold">
              <input name="isOverride" type="checkbox" /> Staff override
            </label>
            <input
              name="overrideReason"
              placeholder="Override reason (required for override)"
              className={`${inputClass} min-w-64 flex-1`}
            />
            <button
              disabled={pending !== null}
              className="min-h-11 rounded-xl bg-[#7f1d2d] px-4 text-xs font-black text-white disabled:opacity-50"
            >
              Record use
            </button>
          </div>
        </form>
      </section>
    </section>
  )
}
