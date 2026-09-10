'use client'

import {
  ArrowDownLeft,
  BadgePoundSterling,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Gift,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Trophy,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { FormEvent, useRef, useState } from 'react'

import type {
  LoyaltyDashboardPayload,
  LoyaltyEntry,
  LoyaltyMember,
  LoyaltyMemberPayload,
} from '@/lib/loyalty/contracts'
import { LoyaltyProgramManager } from './LoyaltyProgramManager'
import { LoyaltyCampaignManager } from './LoyaltyCampaignManager'

type Props = {
  initialData: LoyaltyDashboardPayload | null
  canAdjust: boolean
}

const numberFormat = new Intl.NumberFormat('en-GB')
const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

function points(value: number) {
  return numberFormat.format(value)
}

function EntryIcon({ entry }: { entry: LoyaltyEntry }) {
  if (entry.state === 'pending') return <Clock3 className="h-4 w-4" aria-hidden="true" />
  if (entry.state === 'reversed' || entry.points < 0)
    return <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
  return <Gift className="h-4 w-4" aria-hidden="true" />
}

async function responseJson<T>(response: Response): Promise<T> {
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'The request could not be completed.')
  return payload as T
}

export default function LoyaltyClient({ initialData, canAdjust }: Props) {
  const [dashboard, setDashboard] = useState(initialData)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    initialData ? null : 'Loyalty needs the latest database migration before it can load.',
  )
  const [selected, setSelected] = useState<LoyaltyMemberPayload | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [adjustment, setAdjustment] = useState({ points: '', reason: '' })
  const adjustmentKey = useRef<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'campaigns' | 'settings'>('overview')
  const [campaignTemplate, setCampaignTemplate] = useState<
    LoyaltyDashboardPayload['campaigns'][number]['eventType'] | null
  >(null)

  async function loadDashboard(nextSearch = search) {
    setLoading(true)
    setError(null)
    try {
      const data = await responseJson<LoyaltyDashboardPayload>(
        await fetch(`/api/loyalty?search=${encodeURIComponent(nextSearch)}`, { cache: 'no-store' }),
      )
      setDashboard(data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Loyalty could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  async function openMember(member: LoyaltyMember) {
    setSelected(null)
    setDetailLoading(true)
    setError(null)
    setSuccess(null)
    try {
      setSelected(
        await responseJson<LoyaltyMemberPayload>(
          await fetch(`/api/loyalty/${member.id}`, { cache: 'no-store' }),
        ),
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Member details could not be loaded.')
    } finally {
      setDetailLoading(false)
    }
  }

  async function submitSearch(event: FormEvent) {
    event.preventDefault()
    await loadDashboard(search.trim())
  }

  async function saveAdjustment(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    const adjustmentPoints = Number(adjustment.points)
    adjustmentKey.current ||= crypto.randomUUID()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const updated = await responseJson<LoyaltyMemberPayload>(
        await fetch(`/api/loyalty/${selected.member.id}/adjustments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: adjustmentPoints,
            reason: adjustment.reason,
            idempotencyKey: adjustmentKey.current,
          }),
        }),
      )
      setSelected(updated)
      setAdjustment({ points: '', reason: '' })
      adjustmentKey.current = null
      setSuccess(`${adjustmentPoints > 0 ? '+' : ''}${points(adjustmentPoints)} points recorded.`)
      await loadDashboard(search.trim())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The adjustment could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const overview = dashboard?.overview
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#4b0f16] via-[#7f1d2d] to-[#a32234] px-5 py-6 text-white shadow-xl shadow-red-950/15 sm:px-8 sm:py-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em]">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Customer programme
            </span>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Loyalty</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-red-50 sm:text-base">
              Review points earned across tickets, services and packages. Customer portal balances
              use this same live award stream.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 font-bold text-[#6f1422] shadow-sm transition hover:bg-red-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
        >
          {error}
        </div>
      ) : null}
      {success ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {success}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Members', overview?.memberCount, UsersRound],
          ['Portal linked', overview?.portalLinkedCount, Smartphone],
          ['Available points', overview?.availablePoints, Gift],
          ['Pending points', overview?.pendingPoints, Clock3],
          ['Entries in 30 days', overview?.entriesLast30Days, RefreshCw],
        ].map(([label, value, Icon], index) => {
          const StatIcon = Icon as typeof Gift
          return (
            <article
              key={String(label)}
              className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${index === 4 ? 'col-span-2 lg:col-span-1' : ''}`}
            >
              <div className="flex items-center gap-2 text-slate-500">
                <StatIcon className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-bold uppercase tracking-wide">{String(label)}</span>
              </div>
              <p className="mt-2 text-2xl font-black">
                {value === undefined ? '—' : points(Number(value))}
              </p>
            </article>
          )
        })}
      </section>

      <nav
        aria-label="Loyalty sections"
        className="grid w-full grid-cols-3 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm sm:flex sm:w-fit"
      >
        {(['overview', 'campaigns', 'settings'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setCampaignTemplate(null)
              setActiveTab(tab)
            }}
            aria-current={activeTab === tab ? 'page' : undefined}
            className={`min-h-11 min-w-0 rounded-xl px-2 text-xs font-black capitalize sm:px-4 sm:text-sm ${
              activeTab === tab ? 'bg-[#7f1d2d] text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === 'settings' && dashboard?.program && canAdjust ? (
        <LoyaltyProgramManager program={dashboard.program} />
      ) : null}

      {activeTab === 'campaigns' && dashboard?.program && canAdjust ? (
        <LoyaltyCampaignManager
          key={campaignTemplate ?? 'campaign-workspace'}
          campaigns={dashboard.campaigns}
          campaignOptions={dashboard.campaignOptions}
          initialEventType={campaignTemplate}
        />
      ) : null}

      {activeTab === 'overview' && dashboard?.program ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7f1d2d]">
                Customer rules
              </p>
              <h2 className="mt-1 text-2xl font-black">Loyalty program</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                The approved earning, rank and voucher policy. Earning is active; expiry, annual
                rank reviews and voucher issuance remain controlled rollout items until their
                transaction controls are enabled.
              </p>
            </div>
            <div className="flex gap-2 text-xs font-bold">
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">
                Counter earning ready
              </span>
              <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700">
                Rewards staged
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-3">
            <div>
              <h3 className="flex items-center gap-2 font-black">
                <Gift className="h-4 w-4 text-[#7f1d2d]" /> Earn points
              </h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {dashboard.program.earningRules.map((rule) => (
                  <div
                    key={rule.key}
                    className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-bold">{rule.label}</p>
                      <p className="text-xs text-slate-500">Per {rule.unit}</p>
                    </div>
                    <strong className="text-[#7f1d2d]">+{points(rule.points)}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="flex items-center gap-2 font-black">
                <BadgePoundSterling className="h-4 w-4 text-[#7f1d2d]" /> Voucher rewards
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {dashboard.program.voucherRewards.map((reward) => (
                  <div
                    key={reward.points}
                    className="rounded-xl border border-red-100 bg-red-50/50 p-3"
                  >
                    <p className="text-lg font-black text-[#7f1d2d]">
                      £{(reward.valuePence / 100).toFixed(2)}
                    </p>
                    <p className="text-xs font-semibold text-slate-600">
                      {points(reward.points)} points
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                One voucher per transaction. A voucher is consumed in full, with no cash change or
                refund when its value exceeds the payment.
              </p>
            </div>

            <div>
              <h3 className="flex items-center gap-2 font-black">
                <Trophy className="h-4 w-4 text-[#7f1d2d]" /> Ranks
              </h3>
              <div className="mt-3 space-y-2">
                {dashboard.program.ranks.map((rank) => (
                  <div
                    key={rank.name}
                    className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-bold">{rank.name}</p>
                      <p className="text-xs text-slate-500">
                        {points(rank.minimumPoints)}
                        {rank.maximumPoints === null ? '+' : `–${points(rank.maximumPoints)}`}{' '}
                        points
                      </p>
                    </div>
                    <span className="text-right text-xs font-semibold text-slate-600">
                      {rank.maintenancePoints
                        ? `${points(rank.maintenancePoints)} / year`
                        : 'Base rank'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Points last {dashboard.program.pointValidityMonths} months. Vouchers last{' '}
                  {dashboard.program.voucherValidityMonths} months. Promotion keeps the existing
                  balance.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-6 border-t border-slate-200 pt-5">
            <h3 className="font-black">Bonus point events</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Available campaign templates. Each event must be date-limited, scoped, capped and
              auditable before activation.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {dashboard.program.bonusEventOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  disabled={!canAdjust}
                  onClick={() => {
                    if (!canAdjust) return
                    setCampaignTemplate(
                      option.key as LoyaltyDashboardPayload['campaigns'][number]['eventType'],
                    )
                    setActiveTab('campaigns')
                  }}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-[#7f1d2d] hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7f1d2d] disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:bg-slate-50"
                >
                  <p className="text-sm font-black">{option.label}</p>
                  <p className="mt-1 text-sm font-bold text-[#7f1d2d]">{option.suggestedAward}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{option.description}</p>
                  <p className="mt-2 text-[11px] font-semibold text-slate-600">
                    Default cap: {points(option.defaultCustomerCap)} bonus points per customer
                  </p>
                  <span className="mt-3 inline-flex text-xs font-black text-[#7f1d2d]">
                    {canAdjust ? 'Configure event' : 'View only'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'overview' ? (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <form onSubmit={submitSearch} className="flex flex-col gap-3 sm:flex-row">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Search loyalty members</span>
                <Search
                  className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  maxLength={100}
                  placeholder="Search code, name, email or phone"
                  className="min-h-12 w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-base outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                />
              </label>
              <button
                disabled={loading}
                className="min-h-12 rounded-xl bg-[#7f1d2d] px-5 font-bold text-white hover:bg-[#651724] disabled:opacity-60"
              >
                {loading ? 'Searching…' : 'Search'}
              </button>
            </form>
            <p className="mt-3 text-xs text-slate-500">
              Showing {dashboard?.members.length || 0} of {dashboard?.totalMembers || 0} matching
              members.
            </p>
          </div>

          <div className="divide-y divide-slate-100 md:hidden">
            {(dashboard?.members || []).map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => void openMember(member)}
                className="w-full p-4 text-left transition hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-black">{member.name}</p>
                    <p className="mt-1 font-mono text-xs font-bold text-[#7f1d2d]">
                      {member.customerCode}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">{member.email}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-black">{points(member.availablePoints)}</p>
                    <p className="text-xs text-slate-500">available</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs font-semibold">
                  <span
                    className={`rounded-full px-2 py-1 ${member.portalLinked ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {member.portalLinked ? 'Portal linked' : 'Not linked'}
                  </span>
                  {member.pendingPoints ? (
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                      {points(member.pendingPoints)} pending
                    </span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Portal</th>
                  <th className="px-5 py-3 text-right">Available</th>
                  <th className="px-5 py-3 text-right">Pending</th>
                  <th className="px-5 py-3">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(dashboard?.members || []).map((member) => (
                  <tr
                    key={member.id}
                    onClick={() => void openMember(member)}
                    className="cursor-pointer hover:bg-red-50/40"
                  >
                    <td className="px-5 py-4">
                      <p className="font-bold">{member.name}</p>
                      <p className="text-xs text-slate-500">
                        {member.customerCode} · {member.email}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={
                          member.portalLinked ? 'font-bold text-emerald-700' : 'text-slate-500'
                        }
                      >
                        {member.portalLinked ? 'Linked' : 'Not linked'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-black">
                      {points(member.availablePoints)}
                    </td>
                    <td className="px-5 py-4 text-right">{points(member.pendingPoints)}</td>
                    <td className="px-5 py-4 text-slate-500">
                      {member.lastActivityAt
                        ? dateFormat.format(new Date(member.lastActivityAt))
                        : 'No activity'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!dashboard?.members.length ? (
            <p className="p-8 text-center text-sm text-slate-500">
              No loyalty members match this search.
            </p>
          ) : null}
        </section>
      ) : null}

      {detailLoading ? (
        <div
          role="status"
          className="flex items-center justify-center gap-2 rounded-2xl bg-white p-8 text-sm font-bold"
        >
          <LoaderCircle className="h-5 w-5 animate-spin" /> Loading member…
        </div>
      ) : null}
      {selected ? (
        <section
          className="rounded-2xl border border-slate-200 bg-white shadow-sm"
          aria-label={`${selected.member.name} loyalty details`}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-6">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-[#7f1d2d]">
                {selected.member.customerCode}
              </p>
              <h2 className="mt-1 truncate text-2xl font-black">{selected.member.name}</h2>
              <p className="mt-1 truncate text-sm text-slate-500">{selected.member.email}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-slate-200 hover:bg-slate-50"
              aria-label="Close member details"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div>
              <h3 className="font-black">Points history</h3>
              <ol className="mt-3 divide-y divide-slate-100">
                {selected.entries.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-50 text-[#7f1d2d]">
                      <EntryIcon entry={entry} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{entry.description}</p>
                      <p className="text-xs capitalize text-slate-500">
                        {entry.sourceType} · {entry.state} ·{' '}
                        {dateFormat.format(new Date(entry.createdAt))}
                        {entry.adjustedBy ? ` · ${entry.adjustedBy}` : ''}
                      </p>
                    </div>
                    <strong className={entry.points < 0 ? 'text-red-700' : 'text-emerald-700'}>
                      {entry.points > 0 ? '+' : ''}
                      {points(entry.points)}
                    </strong>
                  </li>
                ))}
                {!selected.entries.length ? (
                  <li className="py-8 text-center text-sm text-slate-500">
                    No points activity yet.
                  </li>
                ) : null}
              </ol>
            </div>
            <aside className="space-y-4">
              <div className="rounded-2xl bg-slate-950 p-5 text-white">
                <p className="text-sm text-slate-300">Available balance</p>
                <p className="mt-1 text-4xl font-black">
                  {points(selected.member.availablePoints)}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {points(selected.member.pendingPoints)} pending
                </p>
              </div>
              {canAdjust ? (
                <form
                  onSubmit={saveAdjustment}
                  className="rounded-2xl border border-red-100 bg-red-50/60 p-4"
                >
                  <h3 className="flex items-center gap-2 font-black">
                    <UserRound className="h-4 w-4" /> Manager adjustment
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Use a positive number to add points or a negative number to correct them. Every
                    change is permanent and audited.
                  </p>
                  <label className="mt-4 block text-xs font-bold text-slate-700">
                    Points
                    <input
                      required
                      type="number"
                      min="-100000"
                      max="100000"
                      step="1"
                      value={adjustment.points}
                      onChange={(event) => {
                        adjustmentKey.current = null
                        setAdjustment((value) => ({ ...value, points: event.target.value }))
                      }}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base"
                      placeholder="e.g. 100 or -50"
                    />
                  </label>
                  <label className="mt-3 block text-xs font-bold text-slate-700">
                    Reason
                    <textarea
                      required
                      minLength={5}
                      maxLength={300}
                      value={adjustment.reason}
                      onChange={(event) => {
                        adjustmentKey.current = null
                        setAdjustment((value) => ({ ...value, reason: event.target.value }))
                      }}
                      className="mt-1 min-h-24 w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-base"
                      placeholder="Why is this adjustment needed?"
                    />
                  </label>
                  <button
                    disabled={saving}
                    className="mt-3 min-h-11 w-full rounded-xl bg-[#7f1d2d] px-4 font-bold text-white hover:bg-[#651724] disabled:opacity-60"
                  >
                    {saving ? 'Recording…' : 'Record adjustment'}
                  </button>
                </form>
              ) : null}
            </aside>
          </div>
        </section>
      ) : null}
    </div>
  )
}
