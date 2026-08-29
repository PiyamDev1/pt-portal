'use client'

import Link from 'next/link'
import { useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BadgePoundSterling,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Copy,
  FileClock,
  History,
  Info,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Users,
  X,
} from 'lucide-react'
import {
  COMMISSION_RATE_KINDS,
  createDefaultCommissionProfile,
  type CommissionProfileInput,
  type CommissionRate,
  type CommissionRateKind,
} from '@/lib/commissions/contracts'
import type {
  CommissionAdminData,
  CommissionAdminEmployee,
  CommissionAdminProfile,
} from '@/lib/commissions/server'

const money = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

type ServiceKey = keyof CommissionProfileInput['services']

function dateLabel(value: string | null) {
  if (!value) return 'Open-ended'
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed)
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function nextMonthStart() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10)
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function rateLabel(rate: CommissionRate, packageRate = false) {
  if (rate.kind === 'none') return '£0 · explicitly off'
  if (rate.kind === 'percentage')
    return `${rate.value}% of ${packageRate ? 'final profit' : 'value'}`
  if (rate.kind === 'per_event')
    return `${money.format(rate.value)} per ${packageRate ? 'package' : 'booking'}`
  if (rate.kind === 'per_unit')
    return `${money.format(rate.value)} per ${packageRate ? 'passenger' : 'ticket'}`
  return `${rate.tiers.length} marginal tier${rate.tiers.length === 1 ? '' : 's'}`
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' })
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(payload.error || 'Commission request failed')
  return payload
}

function requestKey(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`
}

function OverviewCard({
  label,
  value,
  note,
  icon: Icon,
  tone = 'white',
}: {
  label: string
  value: string
  note: string
  icon: typeof Users
  tone?: 'white' | 'dark' | 'red'
}) {
  const styles = {
    white: 'border-slate-200 bg-white text-slate-950',
    dark: 'border-slate-950 bg-[#17181b] text-white',
    red: 'border-red-950/10 bg-gradient-to-br from-[#761522] to-[#ad293b] text-white',
  }
  return (
    <article className={`rounded-[1.35rem] border p-4 shadow-sm ${styles[tone]}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p
            className={`text-[10px] font-black uppercase tracking-[0.16em] ${tone === 'white' ? 'text-slate-500' : 'text-white/60'}`}
          >
            {label}
          </p>
          <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
        </div>
        <span
          className={`rounded-xl p-2 ${tone === 'white' ? 'bg-red-50 text-[#8b1e2d]' : 'bg-white/10 text-white'}`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p
        className={`mt-2 text-[11px] leading-4 ${tone === 'white' ? 'text-slate-500' : 'text-white/60'}`}
      >
        {note}
      </p>
    </article>
  )
}

const KIND_LABELS: Record<CommissionRateKind, string> = {
  none: 'No commission',
  per_unit: 'Per ticket / passenger',
  per_event: 'Per booking / case',
  percentage: 'Percentage',
  tiered: 'Marginal ticket tiers',
}

function RateEditor({
  title,
  description,
  rate,
  allowedKinds,
  onChange,
  packageRate = false,
}: {
  title: string
  description: string
  rate: CommissionRate
  allowedKinds: CommissionRateKind[]
  onChange: (rate: CommissionRate) => void
  packageRate?: boolean
}) {
  const setKind = (kind: CommissionRateKind) => {
    onChange({
      kind,
      value: kind === 'none' || kind === 'tiered' ? 0 : rate.value,
      tiers:
        kind === 'tiered'
          ? rate.tiers.length > 0
            ? rate.tiers
            : [{ minUnit: 1, rateGbp: 5 }]
          : [],
    })
  }

  return (
    <fieldset className="rounded-2xl border border-slate-200 bg-white p-4">
      <legend className="sr-only">{title}</legend>
      <div>
        <p className="text-sm font-black text-slate-900">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <label className="text-xs font-bold text-slate-600">
          Method
          <select
            value={rate.kind}
            onChange={(event) => setKind(event.target.value as CommissionRateKind)}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
          >
            {COMMISSION_RATE_KINDS.filter((kind) => allowedKinds.includes(kind)).map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        {rate.kind !== 'none' && rate.kind !== 'tiered' && (
          <label className="text-xs font-bold text-slate-600">
            {rate.kind === 'percentage' ? 'Rate (%)' : 'Amount (£)'}
            <input
              type="number"
              min="0"
              max={rate.kind === 'percentage' ? 100 : 1_000_000}
              step="0.01"
              value={rate.value}
              onChange={(event) => onChange({ ...rate, value: Number(event.target.value || 0) })}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-black text-slate-900 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
            />
          </label>
        )}
      </div>
      {rate.kind === 'none' && (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
          An explicit zero is recorded, so this service is intentional rather than missing setup.
        </p>
      )}
      {rate.kind === 'tiered' && (
        <div className="mt-4 space-y-2">
          {rate.tiers.map((tier, index) => (
            <div
              key={`${tier.minUnit}-${index}`}
              className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
            >
              <label className="text-[11px] font-bold text-slate-500">
                Starts at ticket
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={tier.minUnit}
                  disabled={index === 0}
                  onChange={(event) => {
                    const tiers = rate.tiers.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, minUnit: Number(event.target.value || 1) }
                        : item,
                    )
                    onChange({ ...rate, tiers })
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm font-bold disabled:text-slate-400"
                />
              </label>
              <label className="text-[11px] font-bold text-slate-500">
                £ per ticket
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={tier.rateGbp}
                  onChange={(event) => {
                    const tiers = rate.tiers.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, rateGbp: Number(event.target.value || 0) }
                        : item,
                    )
                    onChange({ ...rate, tiers })
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm font-bold"
                />
              </label>
              <button
                type="button"
                disabled={index === 0}
                onClick={() =>
                  onChange({
                    ...rate,
                    tiers: rate.tiers.filter((_, itemIndex) => itemIndex !== index),
                  })
                }
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-[#8b1e2d] disabled:opacity-30"
                aria-label={`Remove tier ${index + 1}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const last = rate.tiers.at(-1)?.minUnit || 1
              onChange({ ...rate, tiers: [...rate.tiers, { minUnit: last + 10, rateGbp: 5 }] })
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-200"
          >
            <Plus className="h-3.5 w-3.5" /> Add tier
          </button>
        </div>
      )}
      {packageRate && (
        <p className="mt-3 flex items-start gap-2 text-[11px] leading-4 text-amber-700">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Stored in the agreement now; package earnings remain held until the authoritative
          package-profit feed is enabled.
        </p>
      )}
    </fieldset>
  )
}

function AgreementEditor({
  draft,
  setDraft,
  employee,
  employees,
  profiles,
  working,
  onTemplate,
  onClose,
  onSubmit,
}: {
  draft: CommissionProfileInput
  setDraft: (draft: CommissionProfileInput) => void
  employee: CommissionAdminEmployee
  employees: CommissionAdminEmployee[]
  profiles: CommissionAdminProfile[]
  working: boolean
  onTemplate: (profileId: string) => void
  onClose: () => void
  onSubmit: (event: FormEvent) => void
}) {
  const employeeNames = new Map(employees.map((item) => [item.id, item.fullName]))
  const templates = profiles.filter((profile) => profile.configuration)
  const updateService = (key: ServiceKey, rate: CommissionRate) => {
    setDraft({ ...draft, services: { ...draft.services, [key]: rate } })
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-0 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agreement-title"
    >
      <form
        onSubmit={onSubmit}
        className="ml-auto min-h-full w-full max-w-4xl bg-[#f6f7f9] shadow-2xl sm:min-h-0 sm:rounded-[1.75rem]"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur sm:rounded-t-[1.75rem] sm:px-7">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8b1e2d]">
              Employee agreement
            </p>
            <h2 id="agreement-title" className="mt-1 text-2xl font-black text-slate-950">
              Set commission for {employee.fullName}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Saving creates a new immutable version. Existing history is never edited.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
            aria-label="Close agreement editor"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-5 sm:p-7">
          <section className="rounded-[1.4rem] border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <Copy className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
              <div className="min-w-0 flex-1">
                <label className="text-sm font-black text-blue-950">Starting point</label>
                <select
                  value={draft.copiedFromProfileId || ''}
                  onChange={(event) => onTemplate(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                >
                  <option value="">Blank agreement</option>
                  {templates.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {employeeNames.get(profile.employeeId) || 'Staff'} · {profile.label} ·{' '}
                      {dateLabel(profile.effectiveFrom)}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs leading-5 text-blue-800">
                  This copies the values once. Editing either employee later will not alter the
                  other.
                </p>
              </div>
            </div>
          </section>

          <section className="grid gap-4 rounded-[1.4rem] border border-slate-200 bg-white p-5 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-600 sm:col-span-2">
              Agreement name
              <input
                value={draft.label}
                onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                required
                minLength={2}
                maxLength={100}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
              />
            </label>
            <label className="text-xs font-bold text-slate-600">
              Effective from
              <input
                type="date"
                value={draft.effectiveFrom}
                min={employee.currentProfileId ? todayIso() : undefined}
                onChange={(event) => setDraft({ ...draft, effectiveFrom: event.target.value })}
                required
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
              />
              <span className="mt-1.5 block font-normal leading-4 text-slate-400">
                Tiered rates and monthly bonuses start on the first of a month.
              </span>
            </label>
            <label className="text-xs font-bold text-slate-600">
              Branch scope
              <select
                value={draft.locationId || ''}
                onChange={(event) => setDraft({ ...draft, locationId: event.target.value || null })}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
              >
                <option value="">All branches</option>
                {employee.location && (
                  <option value={employee.location.id}>{employee.location.name} only</option>
                )}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600 sm:col-span-2">
              Reason for this agreement
              <textarea
                value={draft.changeReason}
                onChange={(event) => setDraft({ ...draft, changeReason: event.target.value })}
                required
                minLength={8}
                maxLength={500}
                rows={3}
                className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                placeholder="Why is this agreement being created or changed?"
              />
            </label>
          </section>

          <section>
            <div className="mb-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                Service rates
              </p>
              <h3 className="mt-1 text-xl font-black text-slate-950">How this employee earns</h3>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <RateEditor
                title="Ticket sales"
                description="Primary agent commission on issued tickets."
                rate={draft.services.tkPrimary}
                allowedKinds={['none', 'per_unit', 'per_event', 'percentage', 'tiered']}
                onChange={(rate) => updateService('tkPrimary', rate)}
              />
              <RateEditor
                title="Ticket assistance"
                description="Commission paid when this employee assists another agent."
                rate={draft.services.tkAssistance}
                allowedKinds={['none', 'per_unit', 'per_event']}
                onChange={(rate) => updateService('tkAssistance', rate)}
              />
              <RateEditor
                title="Date changes"
                description="Commission on completed date-change work."
                rate={draft.services.dateChange}
                allowedKinds={['none', 'per_unit', 'per_event', 'percentage']}
                onChange={(rate) => updateService('dateChange', rate)}
              />
              <RateEditor
                title="Reissues"
                description="Commission on completed reissue work."
                rate={draft.services.reissue}
                allowedKinds={['none', 'per_unit', 'per_event', 'percentage']}
                onChange={(rate) => updateService('reissue', rate)}
              />
              <RateEditor
                title="Low-fare savings"
                description="Share of a verified fare saving paid to its finder."
                rate={draft.services.lowFare}
                allowedKinds={['none', 'percentage']}
                onChange={(rate) => updateService('lowFare', rate)}
              />
              <RateEditor
                title="Higher-fare adjustment"
                description="Signed debit treatment when the final fare increases."
                rate={draft.services.higherFare}
                allowedKinds={['none', 'percentage']}
                onChange={(rate) => updateService('higherFare', rate)}
              />
              <div className="lg:col-span-2">
                <RateEditor
                  title="Package sales"
                  description="Commission on a package sold by this employee."
                  rate={draft.services.packageSale}
                  allowedKinds={['none', 'per_unit', 'per_event', 'percentage']}
                  onChange={(rate) => updateService('packageSale', rate)}
                  packageRate
                />
              </div>
            </div>
          </section>

          <section className="rounded-[1.4rem] border border-slate-200 bg-white p-5">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={draft.monthlyBonus.enabled}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    monthlyBonus: { ...draft.monthlyBonus, enabled: event.target.checked },
                  })
                }
                className="mt-1 h-4 w-4 rounded border-slate-300 accent-[#8b1e2d]"
              />
              <span>
                <span className="block text-sm font-black text-slate-900">
                  Monthly contributed-profit bonus
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  Reward the employee only after eligible ticketing work reaches a monthly profit
                  threshold.
                </span>
              </span>
            </label>
            {draft.monthlyBonus.enabled && (
              <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
                <label className="text-xs font-bold text-slate-600">
                  Profit target (£)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.monthlyBonus.thresholdGbp}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        monthlyBonus: {
                          ...draft.monthlyBonus,
                          thresholdGbp: Number(event.target.value || 0),
                        },
                      })
                    }
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-black"
                  />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Reward method
                  <select
                    value={draft.monthlyBonus.rewardKind}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        monthlyBonus: {
                          ...draft.monthlyBonus,
                          rewardKind: event.target
                            .value as CommissionProfileInput['monthlyBonus']['rewardKind'],
                        },
                      })
                    }
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold"
                  >
                    <option value="fixed_gbp">Fixed amount</option>
                    <option value="percentage_of_qualifying_profit">Percentage of profit</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-600">
                  {draft.monthlyBonus.rewardKind === 'fixed_gbp' ? 'Bonus (£)' : 'Bonus rate (%)'}
                  <input
                    type="number"
                    min="0"
                    max={draft.monthlyBonus.rewardKind === 'fixed_gbp' ? 1_000_000 : 100}
                    step="0.01"
                    value={draft.monthlyBonus.rewardValue}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        monthlyBonus: {
                          ...draft.monthlyBonus,
                          rewardValue: Number(event.target.value || 0),
                        },
                      })
                    }
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-black"
                  />
                </label>
                <div className="sm:col-span-3">
                  <p className="text-xs font-bold text-slate-600">Eligible profit sources</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(
                      [
                        ['tk_primary', 'Ticket sales'],
                        ['dc', 'Date changes'],
                        ['r_er', 'Reissues'],
                      ] as const
                    ).map(([code, label]) => {
                      const checked = draft.monthlyBonus.eligibleServices.includes(code)
                      return (
                        <label
                          key={code}
                          className={`cursor-pointer rounded-full border px-3 py-2 text-xs font-black ${checked ? 'border-[#8b1e2d] bg-red-50 text-[#8b1e2d]' : 'border-slate-200 text-slate-500'}`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            onChange={() => {
                              const eligibleServices = checked
                                ? draft.monthlyBonus.eligibleServices.filter(
                                    (item) => item !== code,
                                  )
                                : [...draft.monthlyBonus.eligibleServices, code]
                              if (eligibleServices.length > 0)
                                setDraft({
                                  ...draft,
                                  monthlyBonus: { ...draft.monthlyBonus, eligibleServices },
                                })
                            }}
                          />
                          {label}
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:rounded-b-[1.75rem] sm:px-7">
          <button
            type="button"
            onClick={onClose}
            disabled={working}
            className="rounded-xl px-4 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={working}
            className="inline-flex items-center gap-2 rounded-xl bg-[#8b1e2d] px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-red-950/15 hover:bg-[#6f1422] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {working ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Save independent agreement
          </button>
        </div>
      </form>
    </div>
  )
}

function ProfileSummary({ profile }: { profile: CommissionAdminProfile }) {
  const config = profile.configuration
  if (!config)
    return (
      <p className="text-sm text-slate-500">
        Detailed rates are unavailable for this historical profile.
      </p>
    )
  const rows: Array<[string, CommissionRate, boolean?]> = [
    ['Ticket sales', config.services.tkPrimary],
    ['Ticket assistance', config.services.tkAssistance],
    ['Date changes', config.services.dateChange],
    ['Reissues', config.services.reissue],
    ['Low-fare savings', config.services.lowFare],
    ['Higher-fare adjustment', config.services.higherFare],
    ['Package sales', config.services.packageSale, true],
  ]
  return (
    <div className="grid gap-x-6 sm:grid-cols-2">
      {rows.map(([label, rate, packageRate]) => (
        <div
          key={label}
          className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 text-sm"
        >
          <span className="text-slate-500">{label}</span>
          <span className="text-right font-black text-slate-800">
            {rateLabel(rate, packageRate)}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 text-sm">
        <span className="text-slate-500">Monthly bonus</span>
        <span className="text-right font-black text-slate-800">
          {config.monthlyBonus.enabled
            ? `From ${money.format(config.monthlyBonus.thresholdGbp)}`
            : 'Not included'}
        </span>
      </div>
    </div>
  )
}

export default function AdminCommissionClient({
  initialData,
}: {
  initialData: CommissionAdminData
}) {
  const [data, setData] = useState(initialData)
  const [selectedId, setSelectedId] = useState(initialData.employees[0]?.id || '')
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<CommissionProfileInput | null>(null)
  const [working, setWorking] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [cancelProfile, setCancelProfile] = useState<CommissionAdminProfile | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  const selectedEmployee = data.employees.find((employee) => employee.id === selectedId) || null
  const selectedProfiles = useMemo(
    () => data.profiles.filter((profile) => profile.employeeId === selectedId),
    [data.profiles, selectedId],
  )
  const currentProfile =
    selectedProfiles.find((profile) => profile.id === selectedEmployee?.currentProfileId) || null
  const scheduledProfile =
    selectedProfiles.find((profile) => profile.id === selectedEmployee?.scheduledProfileId) || null
  const selectedExceptions = data.exceptions.filter((item) => item.employeeId === selectedId)
  const filteredEmployees = data.employees.filter((employee) => {
    const query = search.trim().toLowerCase()
    return (
      !query ||
      `${employee.fullName} ${employee.email} ${employee.role}`.toLowerCase().includes(query)
    )
  })

  const refresh = async () => {
    setRefreshing(true)
    try {
      const next = await fetchJson<CommissionAdminData>('/api/commissions/admin')
      setData(next)
      if (!next.employees.some((employee) => employee.id === selectedId))
        setSelectedId(next.employees[0]?.id || '')
    } finally {
      setRefreshing(false)
    }
  }

  const startAgreement = (source: CommissionAdminProfile | null = currentProfile) => {
    if (!selectedEmployee) return
    const next = source?.configuration
      ? clone(source.configuration)
      : createDefaultCommissionProfile(selectedEmployee.id)
    next.employeeId = selectedEmployee.id
    next.copiedFromProfileId = source?.id || null
    next.locationId = null
    next.effectiveFrom = currentProfile ? nextMonthStart() : next.effectiveFrom
    next.label = source ? `${source.label} update` : next.label
    next.changeReason = source ? '' : 'Initial employee commission agreement'
    setDraft(next)
    setError('')
    setNotice('')
  }

  const applyTemplate = (profileId: string) => {
    if (!draft || !selectedEmployee) return
    const template = data.profiles.find((profile) => profile.id === profileId)
    const next = template?.configuration
      ? clone(template.configuration)
      : createDefaultCommissionProfile(selectedEmployee.id)
    next.employeeId = selectedEmployee.id
    next.copiedFromProfileId = template?.id || null
    next.locationId = draft.locationId
    next.effectiveFrom = draft.effectiveFrom
    next.changeReason = draft.changeReason
    next.label = template ? `${template.label} copy` : 'New commission agreement'
    setDraft(next)
  }

  const saveAgreement = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft) return
    setWorking(true)
    setError('')
    setNotice('')
    try {
      await fetchJson('/api/commissions/admin/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey('profile') },
        body: JSON.stringify(draft),
      })
      await refresh()
      setDraft(null)
      setNotice('The employee agreement was saved as an independent, immutable version.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save agreement')
    } finally {
      setWorking(false)
    }
  }

  const runCalculations = async () => {
    setWorking(true)
    setError('')
    setNotice('')
    try {
      await fetchJson('/api/commissions/admin/process', {
        method: 'POST',
        headers: { 'Idempotency-Key': requestKey('manual-process') },
      })
      await refresh()
      setNotice('Queued commission events were processed in preview mode.')
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : 'Unable to run calculations')
    } finally {
      setWorking(false)
    }
  }

  const retryException = async (exceptionId: string) => {
    setWorking(true)
    setError('')
    try {
      await fetchJson(`/api/commissions/admin/exceptions/${exceptionId}/retry`, {
        method: 'POST',
        headers: { 'Idempotency-Key': requestKey('exception-retry') },
      })
      await refresh()
      setNotice('The exception was queued and retried.')
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'Unable to retry exception')
    } finally {
      setWorking(false)
    }
  }

  const confirmCancellation = async () => {
    if (!cancelProfile) return
    setWorking(true)
    setError('')
    try {
      await fetchJson(`/api/commissions/admin/profiles/${cancelProfile.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestKey('profile-cancel'),
        },
        body: JSON.stringify({ reason: cancelReason }),
      })
      await refresh()
      setCancelProfile(null)
      setCancelReason('')
      setNotice('The scheduled agreement was cancelled and the preceding agreement was restored.')
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Unable to cancel agreement')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[1.8rem] bg-[#4b0f16] px-6 py-7 text-white shadow-xl shadow-red-950/15 sm:px-8">
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-[#d14b57]/25 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-red-100">
                Admin commission
              </p>
              <span className="rounded-full bg-amber-300 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-950">
                Preview only
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Commission belongs to the employee.
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-red-50/80">
              Create a complete agreement around one person, copy a proven setup when useful, and
              make later changes without affecting anyone else.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/admin-commission/engine"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-black text-white hover:bg-white/15"
            >
              <Settings2 className="h-4 w-4" /> Advanced engine
            </Link>
            <button
              onClick={runCalculations}
              disabled={working || !data.schemaReady}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-[#4b0f16] shadow-sm hover:bg-red-50 disabled:opacity-50"
            >
              {working ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}{' '}
              Run preview calculations
            </button>
          </div>
        </div>
      </section>

      {!data.schemaReady && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-black">Employee agreement upgrade required</p>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              The shadow engine is available, but database version {data.schemaVersion || 'unknown'}{' '}
              does not yet include employee-owned profiles. Agreement changes are disabled until the
              additive migration is installed.
            </p>
          </div>
        </div>
      )}

      {(notice || error) && (
        <div
          className={`flex items-start justify-between gap-3 rounded-2xl border p-4 ${error ? 'border-red-200 bg-red-50 text-red-950' : 'border-emerald-200 bg-emerald-50 text-emerald-950'}`}
        >
          <div className="flex items-start gap-3">
            {error ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            )}
            <p className="text-sm font-bold">{error || notice}</p>
          </div>
          <button
            onClick={() => {
              setError('')
              setNotice('')
            }}
            aria-label="Dismiss message"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <OverviewCard
          label="Configured staff"
          value={`${data.employees.filter((item) => item.currentProfileId).length} / ${data.employees.length}`}
          note="Active employees with a current agreement"
          icon={UserRoundCheck}
          tone="red"
        />
        <OverviewCard
          label="Preview total"
          value={money.format(data.overview.shadowTotalGbp)}
          note={`${data.overview.activeShadowEntries} active calculated entries`}
          icon={CircleDollarSign}
          tone="dark"
        />
        <OverviewCard
          label="Waiting events"
          value={String(data.overview.pendingEvents)}
          note="Source events ready to calculate"
          icon={Clock3}
        />
        <OverviewCard
          label="Held events"
          value={String(data.overview.heldEvents)}
          note="Waiting for data or a valid agreement"
          icon={FileClock}
        />
        <OverviewCard
          label="Open exceptions"
          value={String(data.overview.openExceptions)}
          note="Items requiring review or retry"
          icon={AlertTriangle}
        />
      </section>

      <section className="grid min-h-[42rem] gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                  Team
                </p>
                <h2 className="mt-1 text-lg font-black text-slate-950">Employee agreements</h2>
              </div>
              <button
                onClick={() => {
                  setError('')
                  void refresh().catch((refreshError) => {
                    setError(
                      refreshError instanceof Error
                        ? refreshError.message
                        : 'Unable to refresh commission data',
                    )
                  })
                }}
                disabled={refreshing}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
                aria-label="Refresh commission data"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <label className="relative mt-4 block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search staff"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#8b1e2d]"
              />
            </label>
          </div>
          <div className="max-h-[38rem] overflow-y-auto p-2">
            {filteredEmployees.map((employee) => (
              <button
                key={employee.id}
                onClick={() => {
                  setSelectedId(employee.id)
                  setDraft(null)
                  setCancelProfile(null)
                }}
                className={`mb-1 flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${employee.id === selectedId ? 'bg-[#4b0f16] text-white shadow-md' : 'hover:bg-slate-50'}`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black ${employee.id === selectedId ? 'bg-white/10' : 'bg-red-50 text-[#8b1e2d]'}`}
                >
                  {employee.fullName
                    .split(/\s+/)
                    .map((part) => part[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black">{employee.fullName}</span>
                  <span
                    className={`mt-0.5 block truncate text-[11px] ${employee.id === selectedId ? 'text-red-100/70' : 'text-slate-400'}`}
                  >
                    {employee.role}
                    {employee.location ? ` · ${employee.location.name}` : ''}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {employee.openExceptionCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-300 px-1 text-[10px] font-black text-amber-950">
                      {employee.openExceptionCount}
                    </span>
                  )}
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${employee.currentProfileId ? 'bg-emerald-400' : employee.scheduledProfileId ? 'bg-blue-400' : 'bg-slate-300'}`}
                  />
                </span>
              </button>
            ))}
            {filteredEmployees.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-500">No staff match that search.</p>
            )}
          </div>
        </aside>

        <div className="space-y-5">
          {!selectedEmployee ? (
            <div className="flex h-full min-h-96 items-center justify-center rounded-[1.5rem] border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              Select an employee to manage their agreement.
            </div>
          ) : (
            <>
              <article className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4b0f16] text-lg font-black text-white">
                      {selectedEmployee.fullName
                        .split(/\s+/)
                        .map((part) => part[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                        Employee agreement
                      </p>
                      <h2 className="mt-1 text-2xl font-black text-slate-950">
                        {selectedEmployee.fullName}
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        {selectedEmployee.email} · {selectedEmployee.role}
                        {selectedEmployee.location ? ` · ${selectedEmployee.location.name}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => startAgreement()}
                    disabled={!data.schemaReady || Boolean(scheduledProfile)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#8b1e2d] px-4 py-2.5 text-sm font-black text-white hover:bg-[#6f1422] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Plus className="h-4 w-4" />{' '}
                    {currentProfile ? 'Schedule an update' : 'Create agreement'}
                  </button>
                </div>
                {scheduledProfile && (
                  <p className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800">
                    Cancel the existing scheduled agreement before scheduling a different update.
                  </p>
                )}
              </article>

              {currentProfile ? (
                <article className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-800">
                          Current
                        </span>
                        <span className="text-xs font-bold text-slate-400">
                          From {dateLabel(currentProfile.effectiveFrom)}
                        </span>
                      </div>
                      <h3 className="mt-3 text-xl font-black text-slate-950">
                        {currentProfile.label}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">{currentProfile.changeReason}</p>
                    </div>
                    <button
                      onClick={() => startAgreement(currentProfile)}
                      disabled={Boolean(scheduledProfile)}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                    >
                      <Copy className="h-3.5 w-3.5" /> Use as next version
                    </button>
                  </div>
                  <div className="mt-5">
                    <ProfileSummary profile={currentProfile} />
                  </div>
                </article>
              ) : (
                <article className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
                  <BadgePoundSterling className="mx-auto h-8 w-8 text-slate-300" />
                  <h3 className="mt-4 text-lg font-black text-slate-900">No current agreement</h3>
                  <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                    Create one complete setup for this employee. Explicit zero rates are stored for
                    services they do not earn from, preventing ambiguous missing-policy errors.
                  </p>
                  <button
                    onClick={() => startAgreement(null)}
                    disabled={!data.schemaReady}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#8b1e2d] px-4 py-2.5 text-sm font-black text-white disabled:opacity-40"
                  >
                    <Sparkles className="h-4 w-4" /> Create first agreement
                  </button>
                </article>
              )}

              {scheduledProfile && (
                <article className="rounded-[1.5rem] border border-blue-200 bg-blue-50 p-5 shadow-sm sm:p-6">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div className="flex items-start gap-3">
                      <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">
                          Scheduled next
                        </p>
                        <h3 className="mt-1 text-lg font-black text-blue-950">
                          {scheduledProfile.label}
                        </h3>
                        <p className="mt-1 text-xs text-blue-800">
                          Starts {dateLabel(scheduledProfile.effectiveFrom)} ·{' '}
                          {scheduledProfile.changeReason}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setCancelProfile(scheduledProfile)
                        setCancelReason('')
                      }}
                      className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-900 hover:bg-blue-100"
                    >
                      Cancel scheduled change
                    </button>
                  </div>
                </article>
              )}

              <article className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
                  <History className="h-5 w-5 text-[#8b1e2d]" />
                  <div>
                    <h3 className="text-base font-black text-slate-950">Agreement history</h3>
                    <p className="text-xs text-slate-500">
                      Every saved version remains independently auditable.
                    </p>
                  </div>
                </div>
                {selectedProfiles.length === 0 ? (
                  <p className="px-6 py-8 text-sm text-slate-500">No agreement history yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {selectedProfiles.map((profile) => (
                      <div
                        key={profile.id}
                        className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p
                              className={`truncate text-sm font-black ${profile.cancelledAt ? 'text-slate-400 line-through' : 'text-slate-800'}`}
                            >
                              {profile.label}
                            </p>
                            {profile.cancelledAt && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-500">
                                Cancelled
                              </span>
                            )}
                            {profile.copiedFromProfileId && (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black uppercase text-blue-700">
                                Copied once
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            {dateLabel(profile.effectiveFrom)} – {dateLabel(profile.effectiveTo)}
                            {profile.cancelledAt ? ` · ${profile.cancellationReason}` : ''}
                          </p>
                        </div>
                        {profile.configuration && (
                          <button
                            onClick={() => startAgreement(profile)}
                            disabled={Boolean(scheduledProfile)}
                            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-black text-[#8b1e2d] hover:bg-red-50 disabled:opacity-30"
                          >
                            <Copy className="h-3.5 w-3.5" /> Copy
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </article>

              {selectedExceptions.length > 0 && (
                <article className="overflow-hidden rounded-[1.5rem] border border-amber-200 bg-white shadow-sm">
                  <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-50 px-5 py-4 sm:px-6">
                    <AlertTriangle className="h-5 w-5 text-amber-700" />
                    <div>
                      <h3 className="text-base font-black text-amber-950">Needs attention</h3>
                      <p className="text-xs text-amber-800">
                        Retry after an agreement or missing source detail has been corrected.
                      </p>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {selectedExceptions.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6"
                      >
                        <div>
                          <p className="text-sm font-black text-slate-800">
                            {item.code.replace(/_/g, ' ')}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {item.serviceCode?.replace(/_/g, ' ') || 'Source event'} ·{' '}
                            {dateLabel(item.createdAt.slice(0, 10))} · {item.retryCount} retries
                          </p>
                        </div>
                        <button
                          onClick={() => void retryException(item.id)}
                          disabled={working}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-2 text-xs font-black text-amber-900 hover:bg-amber-200 disabled:opacity-50"
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Retry
                        </button>
                      </div>
                    ))}
                  </div>
                </article>
              )}
            </>
          )}
        </div>
      </section>

      <section className="flex flex-col justify-between gap-4 rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-[#8b1e2d]" />
          <div>
            <p className="text-sm font-black text-slate-900">Calculation engine health</p>
            <p className="mt-1 text-xs text-slate-500">
              Last run:{' '}
              {data.lastRun
                ? `${data.lastRun.status} · ${data.lastRun.entryCount} entries · ${data.lastRun.exceptionCount} exceptions`
                : 'No run recorded'}
              . The engine remains non-payable while in shadow mode.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/admin-commission/engine"
          className="inline-flex shrink-0 items-center gap-2 text-xs font-black text-[#8b1e2d]"
        >
          Open reconciliation tools <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {draft && selectedEmployee && (
        <AgreementEditor
          draft={draft}
          setDraft={setDraft}
          employee={selectedEmployee}
          employees={data.employees}
          profiles={data.profiles}
          working={working}
          onTemplate={applyTemplate}
          onClose={() => setDraft(null)}
          onSubmit={saveAgreement}
        />
      )}

      {cancelProfile && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-profile-title"
        >
          <div className="w-full max-w-lg rounded-[1.5rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-amber-100 p-2 text-amber-800">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h2 id="cancel-profile-title" className="text-lg font-black text-slate-950">
                  Cancel scheduled agreement?
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {cancelProfile.label} will never become active. The agreement before it will be
                  restored automatically.
                </p>
              </div>
            </div>
            <label className="mt-5 block text-xs font-bold text-slate-600">
              Cancellation reason
              <textarea
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                minLength={8}
                maxLength={500}
                rows={3}
                placeholder="Why is this scheduled change being cancelled?"
                className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
              />
            </label>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setCancelProfile(null)}
                disabled={working}
                className="rounded-xl px-4 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-100"
              >
                Keep agreement
              </button>
              <button
                onClick={() => void confirmCancellation()}
                disabled={working || cancelReason.trim().length < 8}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-black text-white hover:bg-amber-700 disabled:opacity-40"
              >
                {working && <Loader2 className="h-4 w-4 animate-spin" />} Cancel scheduled agreement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
