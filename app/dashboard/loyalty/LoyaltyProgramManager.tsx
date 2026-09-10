'use client'

import { Megaphone, Plus, Save } from 'lucide-react'
import { FormEvent, useState } from 'react'

import type { LoyaltyDashboardPayload } from '@/lib/loyalty/contracts'

type Props = Pick<LoyaltyDashboardPayload, 'program' | 'campaigns'>

const inputClass =
  'min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#7f1d2d] focus:ring-2 focus:ring-red-100'

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function localDateTime(value?: string) {
  const date = value ? new Date(value) : new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

export function LoyaltyProgramManager({
  program: initialProgram,
  campaigns: initialCampaigns,
}: Props) {
  const [program, setProgram] = useState(initialProgram)
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null)
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
      setCampaigns(payload.campaigns)
      setEditingCampaignId(null)
      setMessage('Saved. The change and administrator were recorded in the audit history.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The change could not be saved.')
    } finally {
      setPending(null)
    }
  }

  function saveCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const eventType = String(data.get('eventType'))
    const id = String(data.get('id') || '') || undefined
    const numberOrNull = (name: string) => {
      const value = String(data.get(name) || '')
      return value ? Number(value) : null
    }
    void save(`campaign:${id || 'new'}`, {
      action: 'UPSERT_BONUS_CAMPAIGN',
      ...(id ? { id } : {}),
      name: String(data.get('name')),
      eventType,
      multiplier: eventType === 'double_points' ? numberOrNull('multiplier') : null,
      bonusPoints: eventType === 'double_points' ? null : numberOrNull('bonusPoints'),
      referredCustomerPoints:
        eventType === 'referral_bonus' ? numberOrNull('referredCustomerPoints') : null,
      startsAt: new Date(String(data.get('startsAt'))).toISOString(),
      endsAt: new Date(String(data.get('endsAt'))).toISOString(),
      eligibleServiceKeys: String(data.get('eligibleServiceKeys') || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      eligibleBranchIds: [],
      perCustomerCap: Number(data.get('perCustomerCap')),
      totalPointsBudget: Number(data.get('totalPointsBudget')),
      allowStacking: data.get('allowStacking') === 'on',
      status: String(data.get('status')),
      terms: String(data.get('terms') || '') || null,
    })
  }

  const editing = campaigns.find((campaign) => campaign.id === editingCampaignId)
  const defaultEnd = new Date()
  defaultEnd.setMonth(defaultEnd.getMonth() + 1)

  return (
    <section className="mt-6 rounded-2xl border border-red-100 bg-red-50/40 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Megaphone className="mt-0.5 size-5 shrink-0 text-[#7f1d2d]" />
        <div>
          <h3 className="font-black">Program controls</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Update earning values and voucher rewards, or define a bounded bonus event. Campaign
            definitions are saved and audited. Birthday and Eid campaigns are awarded by the daily
            processor while their configured window is active.
          </p>
        </div>
      </div>
      {message ? (
        <p
          role="status"
          className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-red-100 p-3 text-sm font-semibold text-red-800"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h4 className="text-sm font-black">Earning values</h4>
          <div className="mt-2 space-y-2">
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
                className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3"
              >
                <span className="min-w-40 flex-1 text-sm font-bold">{rule.label}</span>
                <label className="w-20 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  Points
                  <input
                    aria-label={`${rule.label} points`}
                    name="points"
                    type="number"
                    min="1"
                    max="100000"
                    defaultValue={rule.points}
                    className={`${inputClass} mt-1 w-20 text-right font-black`}
                  />
                </label>
                <label className="flex min-h-11 items-center gap-1 text-xs font-semibold">
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
        </div>
        <div>
          <h4 className="text-sm font-black">Voucher rewards</h4>
          <div className="mt-2 space-y-2">
            {program.voucherRewards.map((reward) => (
              <form
                key={reward.points}
                onSubmit={(event) => {
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
                className="grid grid-cols-[1fr_5.5rem_4.5rem_2.75rem] items-center gap-2 rounded-xl border border-slate-200 bg-white p-3"
              >
                <span className="text-sm font-bold">
                  {reward.points.toLocaleString('en-GB')} pts
                </span>
                <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                  Value
                  <span className="relative mt-1 block">
                    <span className="absolute left-2 top-3 text-xs">£</span>
                    <input
                      aria-label={`${reward.points} point voucher value`}
                      name="valuePounds"
                      type="number"
                      min="0.01"
                      step="0.01"
                      defaultValue={(reward.valuePence / 100).toFixed(2)}
                      className={`${inputClass} w-full pl-5`}
                    />
                  </span>
                </label>
                <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                  Months
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
                <label className="col-span-full flex items-center gap-2 text-xs font-semibold">
                  <input
                    name="isActive"
                    type="checkbox"
                    defaultChecked={reward.isActive !== false}
                  />{' '}
                  Active reward
                </label>
              </form>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-red-100 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-black">Bonus campaigns</h4>
          <button
            type="button"
            onClick={() => setEditingCampaignId('new')}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-black text-white"
          >
            <Plus className="size-4" /> New event
          </button>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {campaigns.map((campaign) => (
            <button
              key={campaign.id}
              type="button"
              onClick={() => setEditingCampaignId(campaign.id)}
              className="rounded-xl border border-slate-200 bg-white p-3 text-left"
            >
              <span className="flex items-center justify-between gap-2">
                <strong>{campaign.name}</strong>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase">
                  {campaign.status}
                </span>
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                {dateFormat.format(new Date(campaign.startsAt))} –{' '}
                {dateFormat.format(new Date(campaign.endsAt))}
              </span>
            </button>
          ))}
          {!campaigns.length ? (
            <p className="text-sm text-slate-500">No bonus events created yet.</p>
          ) : null}
        </div>

        {editingCampaignId ? (
          <form
            onSubmit={saveCampaign}
            className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2"
          >
            {editing?.id ? <input type="hidden" name="id" value={editing.id} /> : null}
            <label className="text-xs font-bold">
              Campaign name
              <input
                required
                name="name"
                defaultValue={editing?.name ?? ''}
                className={`mt-1 w-full ${inputClass}`}
              />
            </label>
            <label className="text-xs font-bold">
              Event type
              <select
                name="eventType"
                defaultValue={editing?.eventType ?? 'double_points'}
                className={`mt-1 w-full ${inputClass}`}
              >
                <option value="double_points">Double points</option>
                <option value="fixed_bonus">Fixed bonus</option>
                <option value="welcome_bonus">Welcome bonus</option>
                <option value="referral_bonus">Referral bonus</option>
                <option value="off_peak_bonus">Off-peak bonus</option>
                <option value="birthday_gift">Birthday gift</option>
                <option value="eid_gift">Eid gift</option>
              </select>
            </label>
            <label className="text-xs font-bold">
              Multiplier (double points)
              <input
                name="multiplier"
                type="number"
                min="1.01"
                max="20"
                step="0.01"
                defaultValue={editing?.multiplier ?? 2}
                className={`mt-1 w-full ${inputClass}`}
              />
            </label>
            <label className="text-xs font-bold">
              Bonus points
              <input
                name="bonusPoints"
                type="number"
                min="1"
                defaultValue={editing?.bonusPoints ?? 50}
                className={`mt-1 w-full ${inputClass}`}
              />
            </label>
            <label className="text-xs font-bold">
              New customer referral points
              <input
                name="referredCustomerPoints"
                type="number"
                min="1"
                defaultValue={editing?.referredCustomerPoints ?? 100}
                className={`mt-1 w-full ${inputClass}`}
              />
            </label>
            <label className="text-xs font-bold">
              Status
              <select
                name="status"
                defaultValue={editing?.status ?? 'draft'}
                className={`mt-1 w-full ${inputClass}`}
              >
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="active">Active</option>
                <option value="ended">Ended</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label className="text-xs font-bold">
              Starts
              <input
                required
                name="startsAt"
                type="datetime-local"
                defaultValue={localDateTime(editing?.startsAt)}
                className={`mt-1 w-full ${inputClass}`}
              />
            </label>
            <label className="text-xs font-bold">
              Ends
              <input
                required
                name="endsAt"
                type="datetime-local"
                defaultValue={localDateTime(editing?.endsAt ?? defaultEnd.toISOString())}
                className={`mt-1 w-full ${inputClass}`}
              />
            </label>
            <label className="text-xs font-bold">
              Per-customer cap
              <input
                required
                name="perCustomerCap"
                type="number"
                min="1"
                defaultValue={editing?.perCustomerCap ?? 500}
                className={`mt-1 w-full ${inputClass}`}
              />
            </label>
            <label className="text-xs font-bold">
              Total points budget
              <input
                required
                name="totalPointsBudget"
                type="number"
                min="1"
                defaultValue={editing?.totalPointsBudget ?? 10000}
                className={`mt-1 w-full ${inputClass}`}
              />
            </label>
            <label className="text-xs font-bold sm:col-span-2">
              Eligible service keys (comma-separated)
              <input
                name="eligibleServiceKeys"
                defaultValue={editing?.eligibleServiceKeys.join(', ') ?? ''}
                className={`mt-1 w-full ${inputClass}`}
                placeholder="Leave blank for all eligible services"
              />
            </label>
            <label className="text-xs font-bold sm:col-span-2">
              Customer-facing terms
              <textarea
                name="terms"
                maxLength={1000}
                defaultValue={editing?.terms ?? ''}
                className={`mt-1 min-h-24 w-full py-3 ${inputClass}`}
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-bold sm:col-span-2">
              <input
                name="allowStacking"
                type="checkbox"
                defaultChecked={editing?.allowStacking ?? false}
              />{' '}
              Allow stacking with another campaign
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <button disabled={pending !== null} className="button-primary flex-1">
                <Save className="size-4" />{' '}
                {pending?.startsWith('campaign:') ? 'Saving…' : 'Save campaign'}
              </button>
              <button
                type="button"
                onClick={() => setEditingCampaignId(null)}
                className="button-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </section>
  )
}
