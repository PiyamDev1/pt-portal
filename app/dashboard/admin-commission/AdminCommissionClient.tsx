'use client'

import Link from 'next/link'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
} from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BadgePoundSterling,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Copy,
  CircleHelp,
  Edit3,
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
  Trash2,
  UserRoundCheck,
  Users,
  X,
} from 'lucide-react'
import {
  COMMISSION_RATE_KINDS,
  COMMISSION_PROFILE_EDITING_CAPABILITY_VERSION,
  commissionProfileSchema,
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

function moneyFormatter(currency = 'GBP') {
  return new Intl.NumberFormat(currency === 'PKR' ? 'en-PK' : 'en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  })
}

const money = moneyFormatter()

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

type ServiceKey = keyof CommissionProfileInput['services']
type CommissionEditorIntent = 'new' | 'edit' | 'edit_previous' | 'copy'

function isEditIntent(intent: CommissionEditorIntent) {
  return intent === 'edit' || intent === 'edit_previous'
}

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

function conflictingCommissionProfile(
  draft: CommissionProfileInput,
  profiles: CommissionAdminProfile[],
  excludedProfileId: string | null = null,
) {
  return profiles.find(
    (profile) =>
      profile.employeeId === draft.employeeId &&
      profile.id !== excludedProfileId &&
      profile.locationId === draft.locationId &&
      profile.cancelledAt === null &&
      (profile.effectiveFrom >= draft.effectiveFrom ||
        (profile.effectiveTo !== null && profile.effectiveTo >= draft.effectiveFrom)),
  )
}

function currentMonthStart() {
  return `${todayIso().slice(0, 7)}-01`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function rateLabel(
  rate: CommissionRate,
  packageRate = false,
  currency = 'GBP',
  eventNoun = 'booking',
) {
  const formatter = moneyFormatter(currency)
  if (rate.kind === 'none') return `${formatter.format(0)} · explicitly off`
  if (rate.kind === 'full_difference') return 'Full supplier fare increase'
  if (rate.kind === 'percentage')
    return `${rate.value}% of ${packageRate ? 'final profit' : 'value'}`
  if (rate.kind === 'per_event')
    return `${formatter.format(rate.value)} per ${packageRate ? 'package' : eventNoun}`
  if (rate.kind === 'per_unit')
    return `${formatter.format(rate.value)} per ${packageRate ? 'passenger' : 'ticket'}`
  return packageRate
    ? `${rate.tiers.length} passenger band${rate.tiers.length === 1 ? '' : 's'} per package`
    : `${rate.tiers.length} marginal tier${rate.tiers.length === 1 ? '' : 's'}`
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' })
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string
    issues?: Array<{ path?: string; message?: string }>
  }
  if (!response.ok) {
    const issue = payload.issues?.find((item) => item.message)
    throw new Error(
      issue
        ? `${issue.path ? `${issue.path}: ` : ''}${issue.message}`
        : payload.error || 'Commission request failed',
    )
  }
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
  full_difference: 'Full fare increase difference',
  tiered: 'Marginal ticket tiers',
}

function DraftNumberInput({
  value,
  onValueChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number
  onValueChange: (value: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.value = String(value)
    }
  }, [value])

  return (
    <input
      {...props}
      ref={inputRef}
      type="number"
      defaultValue={value}
      onChange={(event) => {
        const next = event.target.value
        if (next.trim() === '') return
        const parsed = Number(next)
        if (Number.isFinite(parsed)) onValueChange(parsed)
      }}
      onBlur={(event) => {
        if (event.target.value.trim() === '' || !Number.isFinite(Number(event.target.value))) {
          event.target.value = String(value)
        }
      }}
    />
  )
}

function RateEditor({
  title,
  description,
  rate,
  allowedKinds,
  onChange,
  packageRate = false,
  noneLabel = 'No commission',
  perEventLabel = 'Per booking / case',
  currency = 'GBP',
  tierUnitLabel = 'ticket',
  tierMethodLabel,
  tierRateLabel,
  defaultTierRate = 5,
  secondTierRate,
  tierStep = 10,
}: {
  title: string
  description: string
  rate: CommissionRate
  allowedKinds: CommissionRateKind[]
  onChange: (rate: CommissionRate) => void
  packageRate?: boolean
  noneLabel?: string
  perEventLabel?: string
  currency?: 'GBP' | 'PKR'
  tierUnitLabel?: string
  tierMethodLabel?: string
  tierRateLabel?: string
  defaultTierRate?: number
  secondTierRate?: number
  tierStep?: number
}) {
  const setKind = (kind: CommissionRateKind) => {
    onChange({
      kind,
      value:
        kind === 'full_difference' ? 100 : kind === 'none' || kind === 'tiered' ? 0 : rate.value,
      tiers:
        kind === 'tiered'
          ? rate.tiers.length > 0
            ? rate.tiers
            : [{ minUnit: 1, rateGbp: defaultTierRate }]
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
                {kind === 'none'
                  ? noneLabel
                  : kind === 'per_event'
                    ? perEventLabel
                    : kind === 'tiered' && tierMethodLabel
                      ? tierMethodLabel
                      : kind === 'tiered' && tierUnitLabel !== 'ticket'
                        ? `Marginal ${tierUnitLabel} tiers`
                        : KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        {rate.kind !== 'none' && rate.kind !== 'tiered' && rate.kind !== 'full_difference' && (
          <label className="text-xs font-bold text-slate-600">
            {rate.kind === 'percentage' ? 'Rate (%)' : `Amount (${currency})`}
            <DraftNumberInput
              min="0"
              max={rate.kind === 'percentage' ? 100 : 1_000_000}
              step="0.01"
              value={rate.value}
              onValueChange={(value) => onChange({ ...rate, value })}
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
      {rate.kind === 'full_difference' && (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-800">
          The complete supplier fare increase is deducted. A £40 increase produces a £40 debit.
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
                Starts at {tierUnitLabel}
                <DraftNumberInput
                  min="1"
                  step="1"
                  value={tier.minUnit}
                  disabled={index === 0}
                  onValueChange={(value) => {
                    const tiers = rate.tiers.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, minUnit: value } : item,
                    )
                    onChange({ ...rate, tiers })
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm font-bold disabled:text-slate-400"
                />
              </label>
              <label className="text-[11px] font-bold text-slate-500">
                {tierRateLabel || `${currency} per ${tierUnitLabel}`}
                <DraftNumberInput
                  min="0"
                  step="0.01"
                  value={tier.rateGbp}
                  onValueChange={(value) => {
                    const tiers = rate.tiers.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, rateGbp: value } : item,
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
              const lastRate =
                rate.tiers.length === 1 && secondTierRate !== undefined
                  ? secondTierRate
                  : (rate.tiers.at(-1)?.rateGbp ?? defaultTierRate)
              onChange({
                ...rate,
                tiers: [...rate.tiers, { minUnit: last + tierStep, rateGbp: lastRate }],
              })
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
          Package commission is calculated only after the package is closed, paid, invoiced, and
          financially reconciled. It remains a non-payable preview while Commission is in shadow
          mode.
        </p>
      )}
    </fieldset>
  )
}

function AssistanceScopeEditor({
  draft,
  employees,
  onChange,
}: {
  draft: CommissionProfileInput
  employees: CommissionAdminEmployee[]
  onChange: (scope: CommissionProfileInput['assistanceScope']) => void
}) {
  const candidates = employees.filter((employee) => employee.id !== draft.employeeId)
  const specific = draft.assistanceScope.mode === 'specific_agents'

  return (
    <fieldset className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
      <legend className="sr-only">Ticket Assistance primary-agent scope</legend>
      <p className="text-sm font-black text-blue-950">
        Who can this employee assist for commission?
      </p>
      <p className="mt-1 text-xs leading-5 text-blue-800">
        The rate belongs to this employee. The scope decides which primary agent&apos;s ticket can
        trigger it.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label
          className={`cursor-pointer rounded-xl border p-3 text-sm ${!specific ? 'border-blue-500 bg-white text-blue-950' : 'border-blue-200 text-blue-800'}`}
        >
          <input
            type="radio"
            name="assistance-scope"
            checked={!specific}
            onChange={() => onChange({ mode: 'all', employeeIds: [], agentRates: [] })}
            className="mr-2 accent-blue-700"
          />
          <span className="font-black">All primary agents</span>
          <span className="mt-1 block pl-5 text-xs font-normal leading-4">
            Pay this assistance rate whenever they are recorded as an assistant.
          </span>
        </label>
        <label
          className={`cursor-pointer rounded-xl border p-3 text-sm ${specific ? 'border-blue-500 bg-white text-blue-950' : 'border-blue-200 text-blue-800'}`}
        >
          <input
            type="radio"
            name="assistance-scope"
            checked={specific}
            onChange={() => onChange({ mode: 'specific_agents', employeeIds: [], agentRates: [] })}
            className="mr-2 accent-blue-700"
          />
          <span className="font-black">Selected primary agents</span>
          <span className="mt-1 block pl-5 text-xs font-normal leading-4">
            Pay only when assisting one of the people selected below.
          </span>
        </label>
      </div>
      {specific && (
        <div className="mt-3 rounded-xl border border-blue-200 bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-wide text-blue-900">
              Primary agents
            </p>
            <span className="text-[11px] font-bold text-blue-600">
              {draft.assistanceScope.employeeIds.length} selected
            </span>
          </div>
          <div className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
            {candidates.map((employee) => {
              const checked = draft.assistanceScope.employeeIds.includes(employee.id)
              return (
                <div
                  key={employee.id}
                  className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-blue-50"
                >
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        onChange({
                          mode: 'specific_agents',
                          employeeIds: checked
                            ? draft.assistanceScope.employeeIds.filter((id) => id !== employee.id)
                            : [...draft.assistanceScope.employeeIds, employee.id],
                          agentRates: checked
                            ? draft.assistanceScope.agentRates.filter(
                                (rate) => rate.employeeId !== employee.id,
                              )
                            : [
                                ...draft.assistanceScope.agentRates,
                                {
                                  employeeId: employee.id,
                                  value: draft.services.tkAssistance.value,
                                },
                              ],
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300 accent-blue-700"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{employee.fullName}</span>
                      <span className="block text-[11px] text-slate-400">
                        {employee.location?.name || employee.role}
                      </span>
                    </span>
                  </label>
                  {checked && (
                    <label className="text-[10px] font-black uppercase tracking-wide text-blue-700">
                      {draft.compensation.currency} rate
                      <DraftNumberInput
                        min="0"
                        max="1000000"
                        step="0.01"
                        value={
                          draft.assistanceScope.agentRates.find(
                            (rate) => rate.employeeId === employee.id,
                          )?.value ?? draft.services.tkAssistance.value
                        }
                        onValueChange={(value) =>
                          onChange({
                            ...draft.assistanceScope,
                            agentRates: draft.assistanceScope.agentRates.map((rate) =>
                              rate.employeeId === employee.id ? { ...rate, value } : rate,
                            ),
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-sm font-black text-slate-900"
                      />
                    </label>
                  )}
                </div>
              )
            })}
          </div>
          {draft.assistanceScope.employeeIds.length === 0 && (
            <p className="mt-2 text-xs font-bold text-amber-700">
              Select at least one primary agent before saving.
            </p>
          )}
        </div>
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
  intent,
  editingProfileId,
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
  intent: CommissionEditorIntent
  editingProfileId: string | null
}) {
  const employeeNames = new Map(employees.map((item) => [item.id, item.fullName]))
  const applicationRecipientCandidates = employees.filter(
    (candidate) => candidate.id !== draft.employeeId,
  )
  const templates = profiles.filter((profile) => profile.configuration)
  const editingPrevious = intent === 'edit_previous'
  const dateConflict = editingPrevious
    ? undefined
    : conflictingCommissionProfile(draft, profiles, editingProfileId)
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
              {editingPrevious
                ? 'Correcting previous commission'
                : intent === 'edit'
                  ? 'Editing current commission'
                  : 'Creating new commission'}
            </p>
            <h2 id="agreement-title" className="mt-1 text-2xl font-black text-slate-950">
              {editingPrevious
                ? `Edit previous policy for ${employee.fullName}`
                : intent === 'edit'
                  ? `Edit commission for ${employee.fullName}`
                  : intent === 'copy'
                    ? `New commission from a copy for ${employee.fullName}`
                    : `New commission for ${employee.fullName}`}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {editingPrevious
                ? 'The selected historical period stays fixed. Saving archives its old policy snapshot, installs the corrected values for the same dates, and queues that period for recalculation.'
                : intent === 'edit'
                  ? 'The current values are loaded below. Saving overwrites this plan. Existing calculation evidence remains archived and is recalculated against the edited plan.'
                  : 'Start with a blank commission or copy another profile once. The new commission remains independent after it is saved.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
            aria-label="Close commission plan editor"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-5 sm:p-7">
          {isEditIntent(intent) ? (
            <section className="rounded-[1.4rem] border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <Edit3 className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div>
                  <p className="text-sm font-black text-amber-950">
                    {editingPrevious
                      ? 'Editing a previous commission policy'
                      : 'Editing the current commission'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    {editingPrevious
                      ? `Change the policy values only. This correction remains bounded to ${dateLabel(draft.effectiveFrom)} and the following plan keeps its existing start date.`
                      : 'Change any values or the effective date, then save to replace this plan. New commission creates a separate effective-dated plan instead.'}
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <section className="rounded-[1.4rem] border border-blue-100 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <Copy className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="commission-template-source"
                    className="text-sm font-black text-blue-950"
                  >
                    Start the new commission from
                  </label>
                  <select
                    id="commission-template-source"
                    value={draft.copiedFromProfileId || ''}
                    onChange={(event) => onTemplate(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                  >
                    <option value="">Blank commission</option>
                    {templates.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {employeeNames.get(profile.employeeId) || 'Staff'} · {profile.label} ·{' '}
                        {dateLabel(profile.effectiveFrom)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs leading-5 text-blue-800">
                    A copied profile is only a starting point. Later changes to either commission
                    will not affect the other.
                  </p>
                </div>
              </div>
            </section>
          )}

          <section className="grid gap-4 rounded-[1.4rem] border border-slate-200 bg-white p-5 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-600 sm:col-span-2">
              Commission plan name
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
                onChange={(event) => setDraft({ ...draft, effectiveFrom: event.target.value })}
                disabled={editingPrevious}
                required
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
              <span className="mt-1.5 block font-normal leading-4 text-slate-400">
                {editingPrevious
                  ? 'Locked so this correction cannot create a gap or overlap in the employee timeline.'
                  : 'Past dates are allowed when they do not conflict with an existing plan. Monthly ticket tiers, salary, PKR pay, and monthly bonuses start on the first of a month.'}
              </span>
            </label>
            <label className="text-xs font-bold text-slate-600">
              Branch scope
              <select
                value={draft.locationId || ''}
                onChange={(event) => setDraft({ ...draft, locationId: event.target.value || null })}
                disabled={editingPrevious}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="">All branches</option>
                {employee.location && (
                  <option value={employee.location.id}>{employee.location.name} only</option>
                )}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600 sm:col-span-2">
              Reason for this commission plan
              <textarea
                value={draft.changeReason}
                onChange={(event) => setDraft({ ...draft, changeReason: event.target.value })}
                required
                minLength={8}
                maxLength={500}
                rows={3}
                className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                placeholder="Why is this commission plan being created or changed?"
              />
            </label>
            {dateConflict && (
              <div
                role="alert"
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 sm:col-span-2"
              >
                <span className="font-black">Effective-date conflict:</span> {dateConflict.label}{' '}
                already covers or begins after this date ({dateLabel(dateConflict.effectiveFrom)} to{' '}
                {dateLabel(dateConflict.effectiveTo)}). Choose a date after that plan begins so it
                can end the day before, or remove the conflicting scheduled plan first.
              </div>
            )}
          </section>

          <section className="rounded-[1.4rem] border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-800">
              Pay and reporting currency
            </p>
            <h3 className="mt-1 text-xl font-black text-emerald-950">Local compensation</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-emerald-800">
              Fixed commission rates, tier values, and salary use this employee&apos;s pay currency.
              Percentage targets remain based on GBP trading figures. PKR totals are converted to
              GBP with the audited rate entered for that month.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold text-emerald-900">
                Employee pay currency
                <select
                  value={draft.compensation.currency}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      compensation: {
                        ...draft.compensation,
                        currency: event.target.value as 'GBP' | 'PKR',
                      },
                    })
                  }
                  className="mt-1.5 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-black text-slate-900"
                >
                  <option value="GBP">GBP · British pounds</option>
                  <option value="PKR">PKR · Pakistani rupees</option>
                </select>
              </label>
              <label className="text-xs font-bold text-emerald-900">
                Monthly salary ({draft.compensation.currency})
                <DraftNumberInput
                  min="0"
                  max="1000000000"
                  step="0.01"
                  value={draft.compensation.monthlySalary}
                  onValueChange={(monthlySalary) =>
                    setDraft({
                      ...draft,
                      compensation: { ...draft.compensation, monthlySalary },
                    })
                  }
                  className="mt-1.5 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-black text-slate-900"
                />
              </label>
            </div>
            {draft.compensation.currency === 'PKR' && (
              <p className="mt-3 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-900">
                The month stays pending until an administrator records how many PKR equal £1. The
                stored rate is then used for the GBP book equivalent; it never rewrites the PKR
                salary or commission agreement.
              </p>
            )}
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
                currency={draft.compensation.currency}
              />
              {draft.services.tkPrimary.kind === 'tiered' && (
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 lg:col-span-2">
                  <input
                    type="checkbox"
                    checked={draft.ticketTierOptions.includeDateChanges}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        ticketTierOptions: { includeDateChanges: event.target.checked },
                      })
                    }
                    className="mt-0.5 h-4 w-4 rounded border-violet-300 accent-violet-700"
                  />
                  <span>
                    <span className="block text-sm font-black text-violet-950">
                      Count date-change tickets toward marginal ticket tiers
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-violet-800">
                      When enabled, completed date changes increase the monthly ticket-volume
                      position. They still earn their separate Date changes rate, not another ticket
                      sale commission.
                    </span>
                  </span>
                </label>
              )}
              <div className="space-y-3">
                <RateEditor
                  title="Ticket assistance"
                  description="Commission paid to this employee when they are recorded as assisting a primary agent."
                  rate={draft.services.tkAssistance}
                  allowedKinds={['none', 'per_unit', 'per_event']}
                  onChange={(rate) => updateService('tkAssistance', rate)}
                  currency={draft.compensation.currency}
                />
                {draft.services.tkAssistance.kind !== 'none' && (
                  <AssistanceScopeEditor
                    draft={draft}
                    employees={employees}
                    onChange={(assistanceScope) => setDraft({ ...draft, assistanceScope })}
                  />
                )}
              </div>
              <RateEditor
                title="Date changes"
                description="Commission on completed date-change work."
                rate={draft.services.dateChange}
                allowedKinds={['none', 'per_unit', 'per_event', 'percentage']}
                onChange={(rate) => updateService('dateChange', rate)}
                currency={draft.compensation.currency}
              />
              <RateEditor
                title="Reissues"
                description="Commission on completed reissue work."
                rate={draft.services.reissue}
                allowedKinds={['none', 'per_unit', 'per_event', 'percentage']}
                onChange={(rate) => updateService('reissue', rate)}
                currency={draft.compensation.currency}
              />
              <RateEditor
                title="Low-fare savings"
                description="Pay a fixed amount per passenger ticket or a percentage of the verified saving."
                rate={draft.services.lowFare}
                allowedKinds={['none', 'per_unit', 'percentage']}
                onChange={(rate) => updateService('lowFare', rate)}
                currency={draft.compensation.currency}
              />
              <RateEditor
                title="Supplier fare increase adjustment"
                description="Optional debit when an agent records a replacement supplier fare that is higher than the original."
                rate={draft.services.higherFare}
                allowedKinds={['none', 'percentage', 'full_difference']}
                onChange={(rate) => updateService('higherFare', rate)}
                noneLabel="No adjustment"
                currency={draft.compensation.currency}
              />
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 lg:col-span-2">
                <div className="flex items-start gap-3">
                  <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <div>
                    <p className="text-sm font-black text-amber-950">
                      What is a supplier fare increase adjustment?
                    </p>
                    <p className="mt-1 text-xs leading-5 text-amber-900">
                      Ticketing compares the original supplier fare with its replacement. If the
                      original was £500 and the replacement is £540, the increase is £40. A 10% rule
                      creates a £4 debit; <strong>Full fare increase difference</strong> creates a
                      £40 debit. Choose <strong>No adjustment</strong> when the business absorbs the
                      increase.
                    </p>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-2">
                <RateEditor
                  title="Package sales"
                  description="Choose one amount per package, per passenger, a percentage, or one flat package amount selected by its passenger-count band."
                  rate={draft.services.packageSale}
                  allowedKinds={['none', 'per_unit', 'per_event', 'percentage', 'tiered']}
                  onChange={(rate) => updateService('packageSale', rate)}
                  packageRate
                  tierUnitLabel="passenger"
                  tierMethodLabel="Passenger-count package bands"
                  tierRateLabel={`${draft.compensation.currency} per package`}
                  defaultTierRate={100}
                  secondTierRate={150}
                  tierStep={3}
                  currency={draft.compensation.currency}
                />
                {draft.services.packageSale.kind === 'tiered' && (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                    Each closed package receives one band amount. For example, tiers beginning at
                    passenger 1 for £100 and passenger 4 for £150 pay £100 total for 1–3 passengers
                    and £150 total for 4 or more. Linked group bookings remain one package and are
                    paid once.
                  </p>
                )}
              </div>
              <div className="space-y-4 rounded-[1.4rem] border border-blue-200 bg-blue-50/60 p-4 lg:col-span-2 sm:p-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-800">
                    Applications
                  </p>
                  <h4 className="mt-1 text-base font-black text-slate-950">
                    Fixed commission for completed application work
                  </h4>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Operational ownership always remains with the employee who completed the work.
                    Commission can be paid to them, redirected to another employee, or switched off.
                  </p>
                </div>
                <div className="rounded-2xl border border-blue-200 bg-white p-4">
                  <label className="text-xs font-black text-blue-950">
                    Application commission recipient
                    <select
                      value={draft.applicationRouting.mode}
                      onChange={(event) => {
                        const mode = event.target
                          .value as CommissionProfileInput['applicationRouting']['mode']
                        setDraft({
                          ...draft,
                          applicationRouting: {
                            mode,
                            recipientEmployeeId:
                              mode === 'another_employee'
                                ? applicationRecipientCandidates[0]?.id || null
                                : null,
                          },
                        })
                      }}
                      className="mt-1.5 w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-black text-slate-900"
                    >
                      <option value="self">Pay this employee</option>
                      <option value="another_employee">Redirect to another employee</option>
                      <option value="none">No Application commission</option>
                    </select>
                  </label>
                  {draft.applicationRouting.mode === 'another_employee' && (
                    <label className="mt-4 block text-xs font-black text-blue-950">
                      Employee receiving commission
                      <select
                        value={draft.applicationRouting.recipientEmployeeId || ''}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            applicationRouting: {
                              mode: 'another_employee',
                              recipientEmployeeId: event.target.value || null,
                            },
                          })
                        }
                        required
                        className="mt-1.5 w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-black text-slate-900"
                      >
                        <option value="">Select an employee</option>
                        {applicationRecipientCandidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.fullName} · {candidate.role}
                          </option>
                        ))}
                      </select>
                      <span className="mt-2 block font-normal leading-5 text-blue-800">
                        Their own effective normal or urgent Application rate and pay currency will
                        be used. This employee will remain recorded as the person who completed the
                        application.
                      </span>
                    </label>
                  )}
                  {draft.applicationRouting.mode === 'none' && (
                    <p className="mt-3 text-xs leading-5 text-blue-800">
                      Completed Applications remain in operational reporting but create no
                      commission earning.
                    </p>
                  )}
                </div>
                {draft.applicationRouting.mode === 'self' ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <RateEditor
                      title="NADRA applications - normal"
                      description="Paid when a normal NADRA application reaches Completed."
                      rate={draft.services.applicationNadra}
                      allowedKinds={['none', 'per_event']}
                      onChange={(rate) => updateService('applicationNadra', rate)}
                      perEventLabel="Fixed per completed application"
                      currency={draft.compensation.currency}
                    />
                    <RateEditor
                      title="NADRA applications - urgent / executive"
                      description="Paid when a NADRA application with an Urgent or Executive service option reaches Completed."
                      rate={draft.services.applicationNadraUrgent}
                      allowedKinds={['none', 'per_event']}
                      onChange={(rate) => updateService('applicationNadraUrgent', rate)}
                      perEventLabel="Fixed per completed urgent application"
                      currency={draft.compensation.currency}
                    />
                    <RateEditor
                      title="Pakistani passport applications - normal"
                      description="Paid when a normal Pakistani passport reaches Collected."
                      rate={draft.services.applicationPassportPk}
                      allowedKinds={['none', 'per_event']}
                      onChange={(rate) => updateService('applicationPassportPk', rate)}
                      perEventLabel="Fixed per collected application"
                      currency={draft.compensation.currency}
                    />
                    <RateEditor
                      title="Pakistani passport applications - urgent / executive"
                      description="Paid when an Urgent or Executive Pakistani passport reaches Collected."
                      rate={draft.services.applicationPassportPkUrgent}
                      allowedKinds={['none', 'per_event']}
                      onChange={(rate) => updateService('applicationPassportPkUrgent', rate)}
                      perEventLabel="Fixed per collected urgent application"
                      currency={draft.compensation.currency}
                    />
                    <RateEditor
                      title="British passport applications"
                      description="Paid when a British passport application reaches Completed."
                      rate={draft.services.applicationPassportGb}
                      allowedKinds={['none', 'per_event']}
                      onChange={(rate) => updateService('applicationPassportGb', rate)}
                      perEventLabel="Fixed per completed application"
                      currency={draft.compensation.currency}
                    />
                    <RateEditor
                      title="Visa applications"
                      description="Paid when a visa application reaches Completed, including package-linked visa work."
                      rate={draft.services.applicationVisa}
                      allowedKinds={['none', 'per_event']}
                      onChange={(rate) => updateService('applicationVisa', rate)}
                      perEventLabel="Fixed per completed application"
                      currency={draft.compensation.currency}
                    />
                  </div>
                ) : (
                  <p className="rounded-xl border border-blue-200 bg-blue-100/60 px-4 py-3 text-xs font-bold leading-5 text-blue-900">
                    {draft.applicationRouting.mode === 'another_employee'
                      ? 'Application rates from the receiving employee’s effective commission plan will be used.'
                      : 'Application rate fields are not used while Application commission is switched off.'}
                  </p>
                )}
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
                  <DraftNumberInput
                    min="0"
                    step="0.01"
                    value={draft.monthlyBonus.thresholdGbp}
                    onValueChange={(thresholdGbp) =>
                      setDraft({
                        ...draft,
                        monthlyBonus: {
                          ...draft.monthlyBonus,
                          thresholdGbp,
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
                  {draft.monthlyBonus.rewardKind === 'fixed_gbp'
                    ? `Bonus (${draft.compensation.currency})`
                    : 'Bonus rate (%)'}
                  <DraftNumberInput
                    min="0"
                    max={draft.monthlyBonus.rewardKind === 'fixed_gbp' ? 1_000_000 : 100}
                    step="0.01"
                    value={draft.monthlyBonus.rewardValue}
                    onValueChange={(rewardValue) =>
                      setDraft({
                        ...draft,
                        monthlyBonus: {
                          ...draft.monthlyBonus,
                          rewardValue,
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
            disabled={working || Boolean(dateConflict)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#8b1e2d] px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-red-950/15 hover:bg-[#6f1422] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {working ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {editingPrevious
              ? 'Save previous policy correction'
              : intent === 'edit'
                ? 'Save edited commission'
                : intent === 'copy'
                  ? 'Create copied commission'
                  : 'Create new commission'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ProfileSummary({
  profile,
  employees,
}: {
  profile: CommissionAdminProfile
  employees: CommissionAdminEmployee[]
}) {
  const config = profile.configuration
  if (!config)
    return (
      <p className="text-sm text-slate-500">
        Detailed rates are unavailable for this historical profile.
      </p>
    )
  const rows: Array<[string, CommissionRate, boolean?, string?]> = [
    ['Ticket sales', config.services.tkPrimary],
    ['Ticket assistance', config.services.tkAssistance],
    ['Date changes', config.services.dateChange],
    ['Reissues', config.services.reissue],
    ['Low-fare savings', config.services.lowFare],
    ['Supplier fare increase adjustment', config.services.higherFare],
    ['Package sales', config.services.packageSale, true],
    [
      'NADRA applications - normal',
      config.services.applicationNadra,
      false,
      'completed application',
    ],
    [
      'NADRA applications - urgent',
      config.services.applicationNadraUrgent,
      false,
      'completed application',
    ],
    [
      'Pakistani passport applications - normal',
      config.services.applicationPassportPk,
      false,
      'collected application',
    ],
    [
      'Pakistani passport applications - urgent',
      config.services.applicationPassportPkUrgent,
      false,
      'collected application',
    ],
    [
      'British passport applications',
      config.services.applicationPassportGb,
      false,
      'completed application',
    ],
    ['Visa applications', config.services.applicationVisa, false, 'completed application'],
  ]
  const applicationRoutingLabel =
    config.applicationRouting.mode === 'self'
      ? 'Paid to this employee'
      : config.applicationRouting.mode === 'none'
        ? 'No Application commission'
        : `Redirected to ${
            employees.find(
              (employee) => employee.id === config.applicationRouting.recipientEmployeeId,
            )?.fullName || 'Former staff member'
          } at their own rate`
  return (
    <div className="grid gap-x-6 sm:grid-cols-2">
      {rows
        .filter(
          ([label]) =>
            config.applicationRouting.mode === 'self' ||
            !label.toLowerCase().includes('applications'),
        )
        .map(([label, rate, packageRate, eventNoun]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 text-sm"
          >
            <span className="text-slate-500">{label}</span>
            <span className="text-right font-black text-slate-800">
              {rateLabel(rate, packageRate, config.compensation.currency, eventNoun)}
            </span>
          </div>
        ))}
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 text-sm sm:col-span-2">
        <span className="text-slate-500">Ticket assistance applies to</span>
        <span className="max-w-md text-right font-black text-slate-800">
          {config.services.tkAssistance.kind === 'none'
            ? 'Not applicable'
            : config.assistanceScope.mode === 'all'
              ? 'All primary agents'
              : config.assistanceScope.employeeIds
                  .map((id) => {
                    const name =
                      employees.find((employee) => employee.id === id)?.fullName || 'Former staff'
                    const rate = config.assistanceScope.agentRates.find(
                      (item) => item.employeeId === id,
                    )
                    return rate
                      ? `${name} · ${moneyFormatter(config.compensation.currency).format(rate.value)}`
                      : name
                  })
                  .join(', ')}
        </span>
      </div>
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 text-sm sm:col-span-2">
        <span className="text-slate-500">Application commission recipient</span>
        <span className="max-w-md text-right font-black text-slate-800">
          {applicationRoutingLabel}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 text-sm">
        <span className="text-slate-500">Pay currency and salary</span>
        <span className="text-right font-black text-slate-800">
          {config.compensation.currency} ·{' '}
          {moneyFormatter(config.compensation.currency).format(config.compensation.monthlySalary)}
          /month
        </span>
      </div>
      {config.services.tkPrimary.kind === 'tiered' && (
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 text-sm">
          <span className="text-slate-500">Date changes count toward tiers</span>
          <span className="text-right font-black text-slate-800">
            {config.ticketTierOptions.includeDateChanges ? 'Yes' : 'No'}
          </span>
        </div>
      )}
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
  const [editorIntent, setEditorIntent] = useState<CommissionEditorIntent>('new')
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [cancelProfile, setCancelProfile] = useState<CommissionAdminProfile | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [exchangeMonth, setExchangeMonth] = useState(currentMonthStart())
  const [exchangeRate, setExchangeRate] = useState(
    initialData.exchangeRates.find((rate) => rate.periodStart === currentMonthStart())
      ?.unitsPerGbp || 0,
  )

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
  const sourceModules = data.sourceModules || []
  const planEditorReady =
    data.schemaReady &&
    data.applicationIntegrationReady &&
    data.schemaVersion >= COMMISSION_PROFILE_EDITING_CAPABILITY_VERSION
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

  const startAgreement = (
    intent: CommissionEditorIntent,
    source: CommissionAdminProfile | null = null,
  ) => {
    if (!selectedEmployee || !planEditorReady) return
    const editingPrevious = intent === 'edit_previous'
    if (intent === 'edit' && (!source?.configuration || source.id !== currentProfile?.id)) return
    if (
      editingPrevious &&
      (!source?.configuration ||
        source.cancelledAt !== null ||
        source.effectiveTo === null ||
        source.effectiveTo >= todayIso())
    )
      return
    const next = source?.configuration
      ? clone(source.configuration)
      : createDefaultCommissionProfile(selectedEmployee.id)
    next.employeeId = selectedEmployee.id
    next.copiedFromProfileId = intent === 'copy' ? source?.id || null : null
    if (
      next.applicationRouting.mode === 'another_employee' &&
      next.applicationRouting.recipientEmployeeId === selectedEmployee.id
    ) {
      next.applicationRouting = { mode: 'self', recipientEmployeeId: null }
    }
    if (next.assistanceScope.mode === 'specific_agents') {
      next.assistanceScope.employeeIds = next.assistanceScope.employeeIds.filter(
        (employeeId) => employeeId !== selectedEmployee.id,
      )
      next.assistanceScope.agentRates = next.assistanceScope.agentRates.filter(
        (rate) => rate.employeeId !== selectedEmployee.id,
      )
      if (next.assistanceScope.employeeIds.length === 0) {
        next.assistanceScope = { mode: 'all', employeeIds: [], agentRates: [] }
      }
    }
    next.locationId = isEditIntent(intent) ? next.locationId : null
    next.effectiveFrom =
      isEditIntent(intent) && source
        ? source.effectiveFrom
        : currentProfile
          ? nextMonthStart()
          : next.effectiveFrom
    next.label =
      isEditIntent(intent) && source
        ? source.label
        : source
          ? `${source.label} copy`
          : 'New commission'
    next.changeReason = isEditIntent(intent)
      ? ''
      : source
        ? ''
        : currentProfile
          ? 'New employee commission'
          : 'Initial employee commission'
    setEditorIntent(intent)
    setEditingProfileId(isEditIntent(intent) ? source?.id || null : null)
    setDraft(next)
    setError('')
    setNotice('')
  }

  const applyTemplate = (profileId: string) => {
    if (!draft || !selectedEmployee || isEditIntent(editorIntent)) return
    const template = data.profiles.find((profile) => profile.id === profileId)
    const next = template?.configuration
      ? clone(template.configuration)
      : createDefaultCommissionProfile(selectedEmployee.id)
    next.employeeId = selectedEmployee.id
    next.copiedFromProfileId = template?.id || null
    if (
      next.applicationRouting.mode === 'another_employee' &&
      next.applicationRouting.recipientEmployeeId === selectedEmployee.id
    ) {
      next.applicationRouting = { mode: 'self', recipientEmployeeId: null }
    }
    if (next.assistanceScope.mode === 'specific_agents') {
      next.assistanceScope.employeeIds = next.assistanceScope.employeeIds.filter(
        (employeeId) => employeeId !== selectedEmployee.id,
      )
      next.assistanceScope.agentRates = next.assistanceScope.agentRates.filter(
        (rate) => rate.employeeId !== selectedEmployee.id,
      )
      if (next.assistanceScope.employeeIds.length === 0) {
        next.assistanceScope = { mode: 'all', employeeIds: [], agentRates: [] }
      }
    }
    next.locationId = draft.locationId
    next.effectiveFrom = draft.effectiveFrom
    next.changeReason = draft.changeReason
    next.label = template ? `${template.label} copy` : 'New commission'
    setEditorIntent(template ? 'copy' : 'new')
    setDraft(next)
  }

  const saveAgreement = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft) return
    setWorking(true)
    setError('')
    setNotice('')
    try {
      const parsed = commissionProfileSchema.safeParse(draft)
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        throw new Error(
          issue
            ? `${issue.path.join('.') || 'Commission plan'}: ${issue.message}`
            : 'Check the commission plan values',
        )
      }
      await fetchJson(
        isEditIntent(editorIntent) && editingProfileId
          ? `/api/commissions/admin/profiles/${editingProfileId}`
          : '/api/commissions/admin/profiles',
        {
          method: isEditIntent(editorIntent) ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey('profile') },
          body: JSON.stringify(parsed.data),
        },
      )
      await refresh()
      setDraft(null)
      setEditingProfileId(null)
      setNotice(
        editorIntent === 'edit_previous'
          ? 'The previous policy was corrected for its original dates and that period was queued for recalculation.'
          : editorIntent === 'edit'
            ? 'The commission plan was overwritten and its calculations were queued for refresh.'
            : 'The new commission was saved independently for this employee.',
      )
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save commission plan')
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

  const saveExchangeRate = async (event: FormEvent) => {
    event.preventDefault()
    setWorking(true)
    setError('')
    setNotice('')
    try {
      await fetchJson('/api/commissions/admin/exchange-rates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestKey('exchange'),
        },
        body: JSON.stringify({
          currency: 'PKR',
          periodStart: exchangeMonth,
          unitsPerGbp: exchangeRate,
        }),
      })
      await refresh()
      setNotice('The monthly PKR conversion rate was saved and queued earnings were recalculated.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save exchange rate')
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
      await fetchJson(`/api/commissions/admin/profiles/${cancelProfile.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestKey('profile-cancel'),
        },
        body: JSON.stringify({ reason: cancelReason }),
      })
      await refresh()
      setCancelProfile(null)
      setCancelReason('')
      setNotice('The commission plan was removed and the surrounding plan dates were restored.')
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Unable to remove plan')
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
              Create or edit one employee&apos;s plan, copy a proven setup when useful, and make
              later changes without affecting anyone else.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/admin-commission/engine"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-black text-white hover:bg-white/15"
            >
              <Settings2 className="h-4 w-4" /> Shadow Console
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

      {!planEditorReady && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-black">Commission-plan database upgrade required</p>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              The shadow engine is available, but database version {data.schemaVersion || 'unknown'}{' '}
              does not yet include safe previous-policy editing. Plan changes are disabled until the
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
          note="Active employees with a current commission plan"
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
          note="Waiting for data or a valid commission plan"
          icon={FileClock}
        />
        <OverviewCard
          label="Open exceptions"
          value={String(data.overview.openExceptions)}
          note="Items requiring review or retry"
          icon={AlertTriangle}
        />
      </section>

      <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
              Source coverage
            </p>
            <h2 className="mt-1 text-lg font-black text-slate-950">
              Commission across operational modules
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Ticketing, closed Packages, and completed Applications feed the same correction-safe
              preview ledger. Payroll remains disconnected until shadow reconciliation is signed
              off.
            </p>
          </div>
          {(!data.packageIntegrationReady || !data.applicationIntegrationReady) && (
            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-amber-800">
              Commission database upgrade required
            </span>
          )}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {sourceModules.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500 md:col-span-3">
              Source-module health becomes available after the Commission integration migrations.
            </p>
          ) : (
            sourceModules.map((module) => (
              <article
                key={module.sourceModule}
                className="rounded-2xl border border-slate-200 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">{module.label}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {module.processedEvents} processed · {module.pendingEvents} waiting ·{' '}
                      {module.heldEvents} held
                    </p>
                  </div>
                  <span className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-black text-white">
                    {money.format(module.totalGbp)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wide">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                    {module.activeEntries} active entries
                  </span>
                  {module.closedRecordsMissingEvent > 0 && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">
                      {module.closedRecordsMissingEvent}{' '}
                      {module.sourceModule === 'applications'
                        ? 'completed applications need capture'
                        : 'closed records need capture'}
                    </span>
                  )}
                  {module.closedRecordsMissingOwner > 0 && (
                    <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-800">
                      {module.closedRecordsMissingOwner}{' '}
                      {module.sourceModule === 'applications'
                        ? 'missing responsible staff'
                        : 'missing sales owner'}
                    </span>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <form
        onSubmit={saveExchangeRate}
        className="grid gap-5 rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-5 lg:grid-cols-[minmax(0,1fr)_11rem_12rem_auto] lg:items-end"
      >
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-800">
            Monthly pay conversion
          </p>
          <h2 className="mt-1 text-lg font-black text-emerald-950">PKR to GBP book rate</h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-emerald-800">
            Enter Pakistani rupees per £1 for the selected month. The local salary and commission
            remain in PKR; this rate records the matching GBP amount for the books. Once used by a
            calculation, the rate is locked.
          </p>
          {data.exchangeRates.length > 0 && (
            <p className="mt-2 text-[11px] font-bold text-emerald-700">
              Latest: {dateLabel(data.exchangeRates[0]!.periodStart)} ·{' '}
              {data.exchangeRates[0]!.unitsPerGbp.toLocaleString('en-GB', {
                maximumFractionDigits: 6,
              })}{' '}
              PKR per £1
            </p>
          )}
        </div>
        <label className="text-xs font-bold text-emerald-900">
          Month
          <input
            type="month"
            value={exchangeMonth.slice(0, 7)}
            onChange={(event) => {
              const periodStart = `${event.target.value}-01`
              setExchangeMonth(periodStart)
              setExchangeRate(
                data.exchangeRates.find((rate) => rate.periodStart === periodStart)?.unitsPerGbp ||
                  0,
              )
            }}
            required
            className="mt-1.5 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-black text-slate-900"
          />
        </label>
        <label className="text-xs font-bold text-emerald-900">
          PKR per £1
          <DraftNumberInput
            min="0.000001"
            max="1000000000"
            step="0.000001"
            value={exchangeRate}
            onValueChange={setExchangeRate}
            required
            className="mt-1.5 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-black text-slate-900"
          />
        </label>
        <button
          type="submit"
          disabled={working || exchangeRate <= 0 || !data.schemaReady}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 text-xs font-black text-white disabled:opacity-50"
        >
          {working ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <BadgePoundSterling className="h-4 w-4" />
          )}
          Save monthly rate
        </button>
      </form>

      <section className="grid min-h-[42rem] gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                  Team
                </p>
                <h2 className="mt-1 text-lg font-black text-slate-950">
                  Employee commission plans
                </h2>
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
              Select an employee to manage their commission plan.
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
                        Employee commission plan
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
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => startAgreement('new')}
                      disabled={!planEditorReady || Boolean(scheduledProfile)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#8b1e2d] bg-white px-4 py-2.5 text-sm font-black text-[#8b1e2d] hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Plus className="h-4 w-4" /> New commission
                    </button>
                    {currentProfile && (
                      <button
                        onClick={() => startAgreement('edit', currentProfile)}
                        disabled={!planEditorReady || Boolean(scheduledProfile)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#8b1e2d] px-4 py-2.5 text-sm font-black text-white hover:bg-[#6f1422] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Edit3 className="h-4 w-4" /> Edit commission
                      </button>
                    )}
                  </div>
                </div>
                {scheduledProfile && (
                  <p className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800">
                    Cancel the existing scheduled plan before scheduling a different update.
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
                      onClick={() => startAgreement('edit', currentProfile)}
                      disabled={!planEditorReady || Boolean(scheduledProfile)}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                    >
                      <Edit3 className="h-3.5 w-3.5" /> Edit commission
                    </button>
                  </div>
                  <div className="mt-5">
                    <ProfileSummary profile={currentProfile} employees={data.employees} />
                  </div>
                </article>
              ) : (
                <article className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
                  <BadgePoundSterling className="mx-auto h-8 w-8 text-slate-300" />
                  <h3 className="mt-4 text-lg font-black text-slate-900">
                    No current commission plan
                  </h3>
                  <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                    Create one complete setup for this employee. Explicit zero rates are stored for
                    services they do not earn from, preventing ambiguous missing-policy errors.
                  </p>
                  <button
                    onClick={() => startAgreement('new')}
                    disabled={!planEditorReady}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#8b1e2d] px-4 py-2.5 text-sm font-black text-white disabled:opacity-40"
                  >
                    <Sparkles className="h-4 w-4" /> New commission
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
                      Delete scheduled change
                    </button>
                  </div>
                </article>
              )}

              <article className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
                  <History className="h-5 w-5 text-[#8b1e2d]" />
                  <div>
                    <h3 className="text-base font-black text-slate-950">Commission plan history</h3>
                    <p className="text-xs text-slate-500">
                      Every saved version remains independently auditable.
                    </p>
                  </div>
                </div>
                {selectedProfiles.length === 0 ? (
                  <p className="px-6 py-8 text-sm text-slate-500">
                    No commission plan history yet.
                  </p>
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
                        <div className="flex shrink-0 items-center gap-1">
                          {profile.configuration && (
                            <button
                              onClick={() => startAgreement('copy', profile)}
                              disabled={!planEditorReady || Boolean(scheduledProfile)}
                              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-black text-[#8b1e2d] hover:bg-red-50 disabled:opacity-30"
                            >
                              <Copy className="h-3.5 w-3.5" /> Copy
                            </button>
                          )}
                          {profile.configuration &&
                            !profile.cancelledAt &&
                            profile.effectiveTo !== null &&
                            profile.effectiveTo < todayIso() && (
                              <button
                                onClick={() => startAgreement('edit_previous', profile)}
                                disabled={!planEditorReady}
                                className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:opacity-30"
                              >
                                <Edit3 className="h-3.5 w-3.5" /> Edit previous policy
                              </button>
                            )}
                          {!profile.cancelledAt && (
                            <button
                              onClick={() => {
                                setCancelProfile(profile)
                                setCancelReason('')
                              }}
                              disabled={!planEditorReady}
                              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-black text-rose-700 hover:bg-rose-50 disabled:opacity-30"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          )}
                        </div>
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
                        Retry after a commission plan or missing source detail has been corrected.
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
                          {item.message && (
                            <p className="mt-1 text-xs font-semibold text-amber-800">
                              {item.message}
                            </p>
                          )}
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
          Open Shadow Console <ArrowRight className="h-4 w-4" />
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
          intent={editorIntent}
          editingProfileId={editingProfileId}
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
                  Delete commission plan?
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {cancelProfile.label} will be removed from the active plan history. If
                  calculations already reference it, its accounting evidence is retained internally
                  while the plan is archived. Surrounding effective dates are restored
                  automatically.
                </p>
              </div>
            </div>
            <label className="mt-5 block text-xs font-bold text-slate-600">
              Deletion reason
              <textarea
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                minLength={8}
                maxLength={480}
                rows={3}
                placeholder="Why is this commission plan being removed?"
                className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
              />
            </label>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setCancelProfile(null)}
                disabled={working}
                className="rounded-xl px-4 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-100"
              >
                Keep commission plan
              </button>
              <button
                onClick={() => void confirmCancellation()}
                disabled={working || cancelReason.trim().length < 8}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-black text-white hover:bg-amber-700 disabled:opacity-40"
              >
                {working && <Loader2 className="h-4 w-4 animate-spin" />} Delete commission plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
