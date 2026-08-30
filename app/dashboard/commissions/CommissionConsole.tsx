'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BadgePoundSterling,
  Calculator,
  CircleCheck,
  FileClock,
  Gauge,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react'

type JsonRecord = Record<string, any>
type MutationRunner = (work: () => Promise<unknown>, success: string) => Promise<void>
type Tab = 'overview' | 'policies' | 'assignments' | 'preview' | 'shadow' | 'bonus' | 'exceptions'

const tabs: Array<{ id: Tab; label: string; icon: typeof Gauge }> = [
  { id: 'overview', label: 'Reconcile', icon: Gauge },
  { id: 'shadow', label: 'Calculated results', icon: FileClock },
  { id: 'exceptions', label: 'Action queue', icon: AlertTriangle },
  { id: 'bonus', label: 'Monthly bonus', icon: BadgePoundSterling },
  { id: 'preview', label: 'Formula preview', icon: Calculator },
  { id: 'policies', label: 'Policy lab', icon: Settings2 },
  { id: 'assignments', label: 'Manual assignments', icon: Users },
]

const serviceLabels: Record<string, string> = {
  tk_primary: 'Ticket sales',
  tk_assistance: 'Ticket assistance',
  dc: 'Date change',
  r_er: 'Reissue',
  low_fare: 'Low-fare saving',
  higher_fare: 'Supplier fare increase adjustment',
  package_sale: 'Package sale',
  application_nadra: 'NADRA application - normal',
  application_nadra_urgent: 'NADRA application - urgent / executive',
  application_passport_pk: 'Pakistani passport application - normal',
  application_passport_pk_urgent: 'Pakistani passport application - urgent / executive',
  application_passport_gb: 'British passport application',
  application_visa: 'Visa application',
  sales_bonus: 'Monthly sales bonus',
}

const assignmentServices = [
  { code: 'tk_primary', sourceModule: 'ticketing', recipientRole: 'primary' },
  { code: 'tk_assistance', sourceModule: 'ticketing', recipientRole: 'assistant' },
  { code: 'dc', sourceModule: 'ticketing', recipientRole: 'primary' },
  { code: 'r_er', sourceModule: 'ticketing', recipientRole: 'primary' },
  { code: 'low_fare', sourceModule: 'ticketing', recipientRole: 'low_fare_actor' },
  { code: 'higher_fare', sourceModule: 'ticketing', recipientRole: 'low_fare_actor' },
  { code: 'package_sale', sourceModule: 'packages', recipientRole: 'package_sales' },
  { code: 'application_nadra', sourceModule: 'applications', recipientRole: 'application_agent' },
  {
    code: 'application_nadra_urgent',
    sourceModule: 'applications',
    recipientRole: 'application_agent',
  },
  {
    code: 'application_passport_pk',
    sourceModule: 'applications',
    recipientRole: 'application_agent',
  },
  {
    code: 'application_passport_pk_urgent',
    sourceModule: 'applications',
    recipientRole: 'application_agent',
  },
  {
    code: 'application_passport_gb',
    sourceModule: 'applications',
    recipientRole: 'application_agent',
  },
  { code: 'application_visa', sourceModule: 'applications', recipientRole: 'application_agent' },
  { code: 'sales_bonus', sourceModule: 'ticketing', recipientRole: 'sales_bonus' },
] as const

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400'
const buttonClass =
  'inline-flex items-center justify-center rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50'

function requestKey(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: 'no-store' })
  const body = (await response.json().catch(() => ({}))) as JsonRecord
  if (!response.ok) throw new Error(String(body.error || 'Commission request failed.'))
  return body
}

function money(value: unknown) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
    Number(value || 0),
  )
}

function dateLabel(value: unknown) {
  if (!value) return 'Open-ended'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm text-slate-300">
      <span>{label}</span>
      {children}
    </label>
  )
}

export default function CommissionConsole() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [overview, setOverview] = useState<JsonRecord>({})
  const [policies, setPolicies] = useState<JsonRecord[]>([])
  const [assignments, setAssignments] = useState<JsonRecord[]>([])
  const [shadowEntries, setShadowEntries] = useState<JsonRecord[]>([])
  const [bonusPeriods, setBonusPeriods] = useState<JsonRecord[]>([])
  const [exceptions, setExceptions] = useState<JsonRecord[]>([])
  const [options, setOptions] = useState<JsonRecord>({
    employees: [],
    locations: [],
    activePolicyVersions: [],
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const results = await Promise.all([
        fetchJson('/api/commissions/overview'),
        fetchJson('/api/commissions/policies'),
        fetchJson('/api/commissions/assignments'),
        fetchJson('/api/commissions/shadow-entries?limit=50'),
        fetchJson('/api/commissions/bonus-periods?limit=50'),
        fetchJson('/api/commissions/exceptions?limit=50'),
        fetchJson('/api/commissions/setup-options'),
      ])
      setOverview(results[0])
      setPolicies(results[1].items || [])
      setAssignments(results[2].items || [])
      setShadowEntries(results[3].items || [])
      setBonusPeriods(results[4].items || [])
      setExceptions(results[5].items || [])
      setOptions(results[6])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load Commission data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const runMutation: MutationRunner = async (work, success) => {
    setWorking(true)
    setError('')
    setNotice('')
    try {
      await work()
      setNotice(success)
      await load()
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : 'Commission request failed.',
      )
    } finally {
      setWorking(false)
    }
  }

  return (
    <main className="mx-auto max-w-[1500px] px-4 pb-16 pt-24 sm:px-6 lg:pt-8">
      <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
            <ShieldCheck className="h-4 w-4" /> Internal financial control
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Commission reconciliation
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Reconcile company-wide preview calculations before payroll adoption. Employees can see
            only their own non-payable preview in My commissions; this workspace remains restricted
            to Admin and HR.
          </p>
        </div>
        <div className="flex gap-2 self-start">
          <button
            className={buttonClass}
            onClick={() =>
              void runMutation(
                () =>
                  fetchJson('/api/commissions/process', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Idempotency-Key': requestKey('process'),
                    },
                    body: JSON.stringify({ limit: 100 }),
                  }),
                'Commission source events processed in non-payable shadow mode.',
              )
            }
            disabled={working || loading}
          >
            <Play className="mr-2 h-4 w-4" /> Process now
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium hover:border-slate-500"
            onClick={() => void load()}
            disabled={loading || working}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm transition ${
                activeTab === tab.id
                  ? 'border-cyan-400 bg-cyan-400/10 text-cyan-200'
                  : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-600'
              }`}
            >
              <Icon className="h-4 w-4" /> {tab.label}
            </button>
          )
        })}
      </div>

      {error && <Message tone="error">{error}</Message>}
      {notice && <Message tone="success">{notice}</Message>}
      {loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/70">
          <LoaderCircle className="h-7 w-7 animate-spin text-cyan-300" />
        </div>
      ) : (
        <>
          {activeTab === 'overview' && <Overview overview={overview} onNavigate={setActiveTab} />}
          {activeTab === 'policies' && (
            <Policies items={policies} working={working} runMutation={runMutation} />
          )}
          {activeTab === 'assignments' && (
            <Assignments
              items={assignments}
              options={options}
              working={working}
              runMutation={runMutation}
            />
          )}
          {activeTab === 'preview' && <Preview working={working} setWorking={setWorking} />}
          {activeTab === 'shadow' && <ShadowEntries items={shadowEntries} />}
          {activeTab === 'bonus' && <BonusPeriods items={bonusPeriods} />}
          {activeTab === 'exceptions' && (
            <Exceptions items={exceptions} working={working} runMutation={runMutation} />
          )}
        </>
      )}
    </main>
  )
}

function Message({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  const color =
    tone === 'error'
      ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
  return <div className={`mb-5 rounded-lg border px-4 py-3 text-sm ${color}`}>{children}</div>
}

function Overview({
  overview,
  onNavigate,
}: {
  overview: JsonRecord
  onNavigate: (tab: Tab) => void
}) {
  const held = Number(overview.heldEvents || 0)
  const exceptions = Number(overview.openExceptions || 0)
  const pending = Number(overview.pendingEvents || 0)
  const needsAttention = held > 0 || exceptions > 0
  const cards = [
    ['Pending source events', overview.pendingEvents || 0],
    ['Processed source events', overview.processedEvents || 0],
    ['Held source events', overview.heldEvents || 0],
    ['Open exceptions', overview.openExceptions || 0],
    ['Active shadow entries', overview.activeShadowEntries || 0],
    ['Shadow total', money(overview.shadowTotalGbp)],
    ['Incomplete bonus periods', overview.incompleteBonusPeriods || 0],
  ]
  return (
    <section className="space-y-4">
      <div
        className={`flex flex-col justify-between gap-4 rounded-xl border p-5 sm:flex-row sm:items-center ${
          needsAttention
            ? 'border-amber-500/35 bg-amber-500/10'
            : 'border-emerald-500/35 bg-emerald-500/10'
        }`}
      >
        <div className="flex items-start gap-3">
          {needsAttention ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          ) : (
            <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          )}
          <div>
            <p
              className={`font-semibold ${needsAttention ? 'text-amber-100' : 'text-emerald-100'}`}
            >
              {needsAttention
                ? 'Reconciliation needs attention'
                : 'No unresolved calculation issues'}
            </p>
            <p
              className={`mt-1 text-sm ${needsAttention ? 'text-amber-200/75' : 'text-emerald-200/75'}`}
            >
              {needsAttention
                ? `${held} held event${held === 1 ? '' : 's'} and ${exceptions} open exception${exceptions === 1 ? '' : 's'} need review.`
                : pending
                  ? `${pending} source event${pending === 1 ? '' : 's'} can be processed.`
                  : 'Processed preview results have no open exception.'}
            </p>
          </div>
        </div>
        {needsAttention && (
          <button
            type="button"
            onClick={() => onNavigate('exceptions')}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-amber-400/40 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-400/10"
          >
            Open action queue <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">{label}</p>
            <p className="mt-2 text-3xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-5">
        <p className="font-semibold text-cyan-100">Preview only — never sent to payroll</p>
        <p className="mt-1 text-sm text-cyan-200/75">
          Use this area to process source history, resolve held items, and reconcile a complete
          month. Nothing here creates a payable employee balance.
        </p>
      </div>
    </section>
  )
}

function LowLevelToolNotice() {
  return (
    <div className="mb-5 flex flex-col justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center">
      <div>
        <p className="text-sm font-semibold text-amber-100">Advanced diagnostic tool</p>
        <p className="mt-1 text-xs leading-5 text-amber-200/75">
          Normally create or edit an employee-owned plan in Admin commission. Use this tool only for
          engine diagnostics and reconciliation.
        </p>
      </div>
      <Link
        href="/dashboard/admin-commission"
        className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-amber-100"
      >
        Open Admin commission <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}

function Policies({
  items,
  working,
  runMutation,
}: {
  items: JsonRecord[]
  working: boolean
  runMutation: MutationRunner
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [policyId, setPolicyId] = useState('')
  const [template, setTemplate] = useState('primary_bonus')
  const [rate, setRate] = useState('5.00')
  const [threshold, setThreshold] = useState('1000.00')
  const [rewardKind, setRewardKind] = useState('fixed_gbp')
  const [reward, setReward] = useState('100.00')

  const selectedPolicyId = policyId || items[0]?.id || ''

  const createPolicy = (event: FormEvent) => {
    event.preventDefault()
    void runMutation(
      () =>
        fetchJson('/api/commissions/policies', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': requestKey('policy'),
          },
          body: JSON.stringify({ name, description: description || undefined }),
        }),
      'Policy identity created. Add and activate a typed version before assignment.',
    )
  }

  const createVersion = (event: FormEvent) => {
    event.preventDefault()
    let components: JsonRecord[]
    if (template === 'primary_bonus') {
      components = [
        {
          componentType: 'fixed_per_unit',
          sourceVariable: 'passenger_ticket_count',
          recipientRole: 'primary',
          rateValue: rate,
          eligibleServices: [],
          config: {},
        },
        {
          componentType: 'sales_profit_bonus',
          recipientRole: 'sales_bonus',
          thresholdGbp: threshold,
          rewardKind,
          rewardValue: reward,
          eligibleServices: ['tk_primary'],
          config: { period: 'calendar_month' },
        },
      ]
    } else {
      const perUnit = ['assistant', 'primary_unit'].includes(template)
      components = [
        {
          componentType: perUnit ? 'fixed_per_unit' : 'fixed_per_event',
          ...(perUnit ? { sourceVariable: 'passenger_ticket_count' } : {}),
          recipientRole:
            template === 'low_fare'
              ? 'low_fare_actor'
              : template === 'assistant'
                ? 'assistant'
                : template === 'application_event'
                  ? 'application_agent'
                  : 'primary',
          rateValue: rate,
          eligibleServices: [],
          config: {},
        },
      ]
    }
    void runMutation(
      () =>
        fetchJson(`/api/commissions/policies/${selectedPolicyId}/versions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': requestKey('version'),
          },
          body: JSON.stringify({ components }),
        }),
      'Draft policy version created. Review it before activation.',
    )
  }

  const activate = (policy: JsonRecord, version: JsonRecord) =>
    runMutation(
      () =>
        fetchJson(`/api/commissions/policies/${policy.id}/versions/${version.id}/activate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': requestKey('activate'),
          },
          body: '{}',
        }),
      `Policy v${version.versionNumber} activated with an immutable content hash.`,
    )

  return (
    <>
      <LowLevelToolNotice />
      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="space-y-5">
          <form
            onSubmit={createPolicy}
            className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5"
          >
            <h2 className="text-lg font-semibold">Create policy identity</h2>
            <Field label="Policy name">
              <input
                className={inputClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>
            <Field label="Description">
              <textarea
                className={inputClass}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
              />
            </Field>
            <button className={buttonClass} disabled={working}>
              Create policy
            </button>
          </form>

          <form
            onSubmit={createVersion}
            className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5"
          >
            <h2 className="text-lg font-semibold">Add typed version</h2>
            <Field label="Policy">
              <select
                className={inputClass}
                value={selectedPolicyId}
                onChange={(event) => setPolicyId(event.target.value)}
                required
              >
                <option value="">Select policy</option>
                {items.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Typed template">
              <select
                className={inputClass}
                value={template}
                onChange={(event) => setTemplate(event.target.value)}
              >
                <option value="primary_bonus">Primary TK + monthly sales bonus</option>
                <option value="primary_unit">Primary service per passenger-ticket</option>
                <option value="primary_event">Primary service per event</option>
                <option value="assistant">Assistance per passenger-ticket</option>
                <option value="low_fare">Low/higher Fare actor per event</option>
                <option value="application_event">Application completion per case</option>
              </select>
            </Field>
            <Field label={template === 'primary_bonus' ? 'TK rate per ticket (£)' : 'Rate (£)'}>
              <input
                className={inputClass}
                inputMode="decimal"
                value={rate}
                onChange={(event) => setRate(event.target.value)}
                required
              />
            </Field>
            {template === 'primary_bonus' && (
              <>
                <Field label="Monthly qualifying-profit target (£)">
                  <input
                    className={inputClass}
                    value={threshold}
                    onChange={(event) => setThreshold(event.target.value)}
                    required
                  />
                </Field>
                <Field label="Bonus reward type">
                  <select
                    className={inputClass}
                    value={rewardKind}
                    onChange={(event) => setRewardKind(event.target.value)}
                  >
                    <option value="fixed_gbp">Fixed GBP reward</option>
                    <option value="percentage_of_qualifying_profit">
                      Percentage of qualifying profit
                    </option>
                  </select>
                </Field>
                <Field label={rewardKind === 'fixed_gbp' ? 'Fixed bonus (£)' : 'Bonus rate (%)'}>
                  <input
                    className={inputClass}
                    value={reward}
                    onChange={(event) => setReward(event.target.value)}
                    required
                  />
                </Field>
              </>
            )}
            <button className={buttonClass} disabled={working || !selectedPolicyId}>
              Create draft version
            </button>
          </form>
        </div>

        <div className="space-y-3">
          {items.length === 0 ? (
            <Empty text="No Commission policies have been created." />
          ) : (
            items.map((policy) => (
              <article
                key={policy.id}
                className="rounded-xl border border-slate-800 bg-slate-900 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{policy.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      {policy.description || 'No description'}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                    {policy.versions.length} version(s)
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  {policy.versions.length === 0 ? (
                    <p className="text-sm text-slate-500">No versions yet.</p>
                  ) : (
                    policy.versions.map((version: JsonRecord) => (
                      <div
                        key={version.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3"
                      >
                        <div>
                          <span className="font-medium">Version {version.versionNumber}</span>
                          <span className="ml-3 rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
                            {version.status}
                          </span>
                          {version.contentHash && (
                            <p className="mt-1 font-mono text-[11px] text-slate-500">
                              {version.contentHash.slice(0, 18)}…
                            </p>
                          )}
                        </div>
                        {version.status === 'draft' && (
                          <button
                            className={buttonClass}
                            disabled={working}
                            onClick={() => void activate(policy, version)}
                          >
                            Activate
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </>
  )
}

function Assignments({
  items,
  options,
  working,
  runMutation,
}: {
  items: JsonRecord[]
  options: JsonRecord
  working: boolean
  runMutation: MutationRunner
}) {
  const [employeeId, setEmployeeId] = useState('')
  const [versionId, setVersionId] = useState('')
  const [serviceCode, setServiceCode] = useState('tk_primary')
  const [recipientRole, setRecipientRole] = useState('primary')
  const [locationId, setLocationId] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10))
  const [effectiveTo, setEffectiveTo] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const assignmentService = assignmentServices.find((service) => service.code === serviceCode)
    if (!assignmentService) return
    void runMutation(
      () =>
        fetchJson('/api/commissions/assignments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': requestKey('assignment'),
          },
          body: JSON.stringify({
            employeeId,
            policyVersionId: versionId,
            sourceModule: assignmentService.sourceModule,
            serviceCode,
            recipientRole,
            locationId: locationId || null,
            effectiveFrom,
            effectiveTo: effectiveTo || null,
          }),
        }),
      'Employee policy assignment created.',
    )
  }

  return (
    <>
      <LowLevelToolNotice />
      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <form
          onSubmit={submit}
          className="self-start space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5"
        >
          <h2 className="text-lg font-semibold">Assign active policy</h2>
          <Field label="Employee">
            <select
              className={inputClass}
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              required
            >
              <option value="">Select employee</option>
              {(options.employees || []).map((employee: JsonRecord) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Active policy version">
            <select
              className={inputClass}
              value={versionId}
              onChange={(event) => setVersionId(event.target.value)}
              required
            >
              <option value="">Select policy version</option>
              {(options.activePolicyVersions || []).map((version: JsonRecord) => (
                <option key={version.id} value={version.id}>
                  {version.policyName} · v{version.versionNumber}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Service">
              <select
                className={inputClass}
                value={serviceCode}
                onChange={(event) => {
                  const nextService = assignmentServices.find(
                    (service) => service.code === event.target.value,
                  )
                  setServiceCode(event.target.value)
                  if (nextService) setRecipientRole(nextService.recipientRole)
                }}
              >
                {assignmentServices.map((service) => (
                  <option key={service.code} value={service.code}>
                    {serviceLabels[service.code] || service.code.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Recipient">
              <select
                className={inputClass}
                value={recipientRole}
                onChange={(event) => setRecipientRole(event.target.value)}
              >
                {[
                  'primary',
                  'assistant',
                  'low_fare_actor',
                  'package_sales',
                  'application_agent',
                  'sales_bonus',
                ].map((role) => (
                  <option key={role} value={role}>
                    {role.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Location override">
            <select
              className={inputClass}
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
            >
              <option value="">All locations</option>
              {(options.locations || []).map((location: JsonRecord) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Effective from">
              <input
                type="date"
                className={inputClass}
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                required
              />
            </Field>
            <Field label="Effective to">
              <input
                type="date"
                className={inputClass}
                value={effectiveTo}
                onChange={(event) => setEffectiveTo(event.target.value)}
              />
            </Field>
          </div>
          <button className={buttonClass} disabled={working}>
            Create assignment
          </button>
        </form>
        <DataTable
          headers={['Employee', 'Policy', 'Service / recipient', 'Location', 'Effective dates']}
          empty="No effective-dated assignments yet."
          rows={items.map((item) => [
            item.employeeName,
            item.policyName,
            `${item.serviceCode} · ${item.recipientRole}`,
            item.locationName,
            `${dateLabel(item.effectiveFrom)} – ${dateLabel(item.effectiveTo)}`,
          ])}
        />
      </div>
    </>
  )
}

function Preview({
  working,
  setWorking,
}: {
  working: boolean
  setWorking: (value: boolean) => void
}) {
  const [tickets, setTickets] = useState('50')
  const [grossProfit, setGrossProfit] = useState('1250.00')
  const [ticketRate, setTicketRate] = useState('5.00')
  const [assistantCost, setAssistantCost] = useState('0.00')
  const [lowFareSaving, setLowFareSaving] = useState('0.00')
  const [finderCost, setFinderCost] = useState('0.00')
  const [threshold, setThreshold] = useState('1000.00')
  const [rewardKind, setRewardKind] = useState('fixed_gbp')
  const [reward, setReward] = useState('100.00')
  const [result, setResult] = useState<JsonRecord | null>(null)
  const [localError, setLocalError] = useState('')

  const calculate = async (event: FormEvent) => {
    event.preventDefault()
    setWorking(true)
    setLocalError('')
    setResult(null)
    try {
      const ordinary = await fetchJson('/api/commissions/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestKey('preview-primary'),
        },
        body: JSON.stringify({
          component: {
            componentType: 'fixed_per_unit',
            sourceVariable: 'passenger_ticket_count',
            recipientRole: 'primary',
            rateValue: ticketRate,
            eligibleServices: [],
            config: {},
          },
          variables: { units: Number(tickets), incompleteInputCount: 0 },
        }),
      })
      const primaryCost = Number(ordinary.result.amountGbp)
      const qualifying =
        Number(grossProfit) -
        primaryCost -
        Number(assistantCost) +
        Number(lowFareSaving) -
        Number(finderCost)
      const bonus = await fetchJson('/api/commissions/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestKey('preview-bonus'),
        },
        body: JSON.stringify({
          component: {
            componentType: 'sales_profit_bonus',
            recipientRole: 'sales_bonus',
            thresholdGbp: threshold,
            rewardKind,
            rewardValue: reward,
            eligibleServices: ['tk_primary'],
            config: { period: 'calendar_month' },
          },
          variables: { qualifyingProfitGbp: qualifying.toFixed(2), incompleteInputCount: 0 },
        }),
      })
      setResult({ primaryCost, qualifying, bonus: bonus.result })
    } catch (previewError) {
      setLocalError(previewError instanceof Error ? previewError.message : 'Preview failed.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[520px_1fr]">
      <form
        onSubmit={calculate}
        className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5"
      >
        <div>
          <h2 className="text-lg font-semibold">Synthetic sales-bonus preview</h2>
          <p className="mt-1 text-sm text-slate-400">
            No customer data or entries are written. The preview itself is audited.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Passenger-tickets">
            <input
              className={inputClass}
              value={tickets}
              onChange={(e) => setTickets(e.target.value)}
            />
          </Field>
          <Field label="Own-sale gross profit (£)">
            <input
              className={inputClass}
              value={grossProfit}
              onChange={(e) => setGrossProfit(e.target.value)}
            />
          </Field>
          <Field label="Primary rate per ticket (£)">
            <input
              className={inputClass}
              value={ticketRate}
              onChange={(e) => setTicketRate(e.target.value)}
            />
          </Field>
          <Field label="Assistant commission cost (£)">
            <input
              className={inputClass}
              value={assistantCost}
              onChange={(e) => setAssistantCost(e.target.value)}
            />
          </Field>
          <Field label="Signed Low Fare saving (£)">
            <input
              className={inputClass}
              value={lowFareSaving}
              onChange={(e) => setLowFareSaving(e.target.value)}
            />
          </Field>
          <Field label="Low Fare finder cost (£)">
            <input
              className={inputClass}
              value={finderCost}
              onChange={(e) => setFinderCost(e.target.value)}
            />
          </Field>
          <Field label="Monthly target (£)">
            <input
              className={inputClass}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </Field>
          <Field label="Reward type">
            <select
              className={inputClass}
              value={rewardKind}
              onChange={(e) => setRewardKind(e.target.value)}
            >
              <option value="fixed_gbp">Fixed GBP</option>
              <option value="percentage_of_qualifying_profit">Percentage</option>
            </select>
          </Field>
        </div>
        <Field label={rewardKind === 'fixed_gbp' ? 'Bonus amount (£)' : 'Bonus rate (%)'}>
          <input
            className={inputClass}
            value={reward}
            onChange={(e) => setReward(e.target.value)}
          />
        </Field>
        <button className={buttonClass} disabled={working}>
          {working ? 'Calculating…' : 'Calculate preview'}
        </button>
        {localError && <p className="text-sm text-rose-300">{localError}</p>}
      </form>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        {!result ? (
          <Empty text="Run the preview to see the calculation evidence." />
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Calculation evidence</h2>
            <div className="space-y-2 rounded-lg bg-slate-950 p-4 font-mono text-sm">
              <Formula label="Gross contributed profit" value={money(grossProfit)} />
              <Formula label="Primary commission" value={`− ${money(result.primaryCost)}`} />
              <Formula label="Assistant commission" value={`− ${money(assistantCost)}`} />
              <Formula label="Low Fare saving" value={`+ ${money(lowFareSaving)}`} />
              <Formula label="Low Fare finder commission" value={`− ${money(finderCost)}`} />
              <div className="my-3 border-t border-slate-700" />
              <Formula
                label="Qualifying contributed profit"
                value={money(result.qualifying)}
                strong
              />
            </div>
            <div
              className={`rounded-lg border p-5 ${
                result.bonus.achieved
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-amber-500/40 bg-amber-500/10'
              }`}
            >
              <p className="text-sm text-slate-300">Target {money(result.bonus.thresholdGbp)}</p>
              <p className="mt-1 text-2xl font-bold">
                {result.bonus.achieved
                  ? `Target reached · ${money(result.bonus.rewardGbp)} bonus`
                  : 'Target not reached · no bonus'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Formula({
  label,
  value,
  strong = false,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div
      className={`flex justify-between gap-4 ${strong ? 'font-bold text-cyan-200' : 'text-slate-300'}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function ShadowEntries({ items }: { items: JsonRecord[] }) {
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const filtered = items.filter((item) => {
    const serviceCode = String(item.serviceCode || item.explanation?.serviceCode || '')
    return (
      !query ||
      `${item.recipientName} ${item.profitOwnerName} ${serviceLabels[serviceCode] || serviceCode} ${item.entryKind}`
        .toLowerCase()
        .includes(query)
    )
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-semibold text-white">Calculated preview results</h2>
          <p className="mt-1 text-xs text-slate-400">
            Each row shows who receives the calculation and which primary agent owned the sale.
          </p>
        </div>
        <label className="relative block sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <span className="sr-only">Search calculated results</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search staff or service"
            className={`${inputClass} pl-9`}
          />
        </label>
      </div>
      <DataTable
        headers={[
          'Recipient',
          'Service',
          'Primary sale owner',
          'Earning date',
          'Amount',
          'Scope / state',
        ]}
        empty={
          query
            ? 'No calculated results match that search.'
            : 'No preview results have been calculated yet.'
        }
        rows={filtered.map((item) => {
          const serviceCode = String(item.serviceCode || item.explanation?.serviceCode || '')
          const scope =
            serviceCode === 'tk_assistance'
              ? item.assistanceScopeMode === 'specific_agents'
                ? item.assistanceScopeMatched
                  ? 'Selected agent matched'
                  : 'Outside selected scope'
                : 'All primary agents'
              : String(item.entryKind).replace(/_/g, ' ')
          return [
            item.recipientName,
            serviceLabels[serviceCode] || serviceCode.replace(/_/g, ' ') || 'Commission',
            item.profitOwnerName,
            dateLabel(item.earningOn),
            money(item.amountGbp),
            `${scope} · v${item.revision}`,
          ]
        })}
      />
    </div>
  )
}

function BonusPeriods({ items }: { items: JsonRecord[] }) {
  return (
    <DataTable
      headers={[
        'Employee',
        'Period',
        'Gross profit',
        'Commission cost',
        'Qualifying',
        'Target / reward',
        'State',
      ]}
      empty="No monthly bonus periods have been calculated yet."
      rows={items.map((item) => [
        item.employeeName,
        `${dateLabel(item.periodStart)} – ${dateLabel(item.periodEnd)}`,
        money(item.grossContributedProfitGbp),
        money(item.ordinaryCommissionCostGbp),
        money(item.qualifyingProfitGbp),
        `${money(item.thresholdGbp)} / ${money(item.rewardGbp)}`,
        item.incompleteInputCount
          ? `Incomplete (${item.incompleteInputCount})`
          : item.achieved
            ? 'Achieved'
            : 'Not achieved',
      ])}
    />
  )
}

function Exceptions({
  items,
  working,
  runMutation,
}: {
  items: JsonRecord[]
  working: boolean
  runMutation: MutationRunner
}) {
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const guidance: Record<string, { title: string; next: string }> = {
    needs_policy: {
      title: 'Agent needs a commission plan',
      next: 'Create or edit the agent plan, then retry this item.',
    },
    ambiguous_assignment: {
      title: 'More than one plan matched',
      next: 'Review overlapping dates or branch scope, then retry.',
    },
    unsupported_contract_version: {
      title: 'Source record uses an unsupported format',
      next: 'Review the source integration before retrying.',
    },
    missing_required_variable: {
      title: 'Required source value is missing',
      next: 'Complete the ticket or package data, then retry.',
    },
    inactive_recipient: {
      title: 'Commission recipient is inactive',
      next: 'Confirm the staff attribution or employment status before retrying.',
    },
    invalid_source_lineage: {
      title: 'Source history could not be verified',
      next: 'Review the linked ticketing history before retrying.',
    },
    unresolved_package_scope: {
      title: 'Package responsibility is unresolved',
      next: 'Assign the responsible package salesperson, then retry.',
    },
    package_source_not_authoritative: {
      title: 'Package source is not authoritative',
      next: 'Reconcile the package sale source before retrying.',
    },
    bonus_period_incomplete: {
      title: 'Monthly bonus inputs are incomplete',
      next: 'Resolve held source events for the month, then recalculate.',
    },
    calculation_failed: {
      title: 'Calculation could not be completed',
      next: 'Review the source details and policy configuration before retrying.',
    },
  }
  const packageReasonLabels: Record<string, string> = {
    package_not_closed: 'The package is not closed.',
    missing_earned_date: 'The closed and earned dates are incomplete.',
    missing_sales_employee: 'Assign the package sales owner.',
    missing_package_location: 'Assign the package branch.',
    missing_reservations: 'Add the package reservation records.',
    unfinished_reservations: 'Finish or cancel every reservation.',
    missing_passengers: 'Add the package passenger records.',
    invalid_shared_transport_structure:
      'Keep exactly one physical Group main transport for the family invoice references.',
    missing_active_invoice: 'Create the package invoice.',
    invoice_not_settled: 'Settle and finalise every active invoice.',
    supplier_commission_not_reconciled:
      'Reconcile received supplier commission between reservations and invoices.',
    invoice_sales_not_reconciled: 'Reconcile invoice sales with the reservation totals.',
    invoice_cost_not_reconciled: 'Reconcile invoice booked cost with the reservation totals.',
    package_payment_not_paid: 'The package payment state must be paid.',
    pending_package_payments: 'Resolve pending package payment records.',
    non_gbp_package_source: 'Convert or reconcile all package source values to GBP.',
  }
  const filtered = items.filter((item) => {
    const details = item.details && typeof item.details === 'object' ? item.details : {}
    const copy = `${item.employeeName || ''} ${item.code || ''} ${details.serviceCode || ''} ${details.reason || ''}`
    return !query || copy.toLowerCase().includes(query)
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-semibold text-white">Items needing action</h2>
          <p className="mt-1 text-xs text-slate-400">
            Correct the underlying plan or source record first. Retry keeps an audit trail.
          </p>
        </div>
        <label className="relative block sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <span className="sr-only">Search action queue</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search staff, issue or service"
            className={`${inputClass} pl-9`}
          />
        </label>
      </div>
      {filtered.length === 0 ? (
        <Empty
          text={query ? 'No action items match that search.' : 'No open Commission exceptions.'}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((item) => {
            const details = item.details && typeof item.details === 'object' ? item.details : {}
            const help = guidance[String(item.code)] || {
              title: String(item.code || 'Commission issue').replace(/_/g, ' '),
              next: 'Review the source details before retrying.',
            }
            const serviceCode = typeof details.serviceCode === 'string' ? details.serviceCode : ''
            const packageReasons: string[] = Array.isArray(details.reasons)
              ? (details.reasons as unknown[]).filter(
                  (reason: unknown): reason is string => typeof reason === 'string',
                )
              : []
            return (
              <article
                key={item.id}
                className="rounded-xl border border-slate-800 bg-slate-900 p-5"
              >
                <div className="flex items-start gap-3">
                  <span className="rounded-lg bg-amber-500/15 p-2 text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white">{help.title}</p>
                    <p className="mt-1 text-sm text-slate-300">
                      {item.employeeName || 'No employee resolved'}
                      {serviceCode
                        ? ` · ${serviceLabels[serviceCode] || serviceCode.replace(/_/g, ' ')}`
                        : ''}
                    </p>
                    <p className="mt-3 text-xs leading-5 text-slate-400">{help.next}</p>
                    {typeof details.reason === 'string' && (
                      <p className="mt-2 rounded-lg bg-slate-950/70 px-3 py-2 text-xs text-slate-400">
                        {details.reason}
                      </p>
                    )}
                    {packageReasons.length > 0 && (
                      <ul className="mt-2 space-y-1 rounded-lg bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
                        {packageReasons.map((reason) => (
                          <li key={reason}>
                            • {packageReasonLabels[reason] || reason.replace(/_/g, ' ')}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
                      <span className="text-[11px] text-slate-500">
                        {dateLabel(String(item.createdAt).slice(0, 10))} · {item.retryCount || 0}{' '}
                        previous retries
                      </span>
                      {item.sourceEventId ? (
                        <button
                          className="rounded-lg border border-cyan-500/40 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50"
                          disabled={working}
                          onClick={() =>
                            void runMutation(
                              () =>
                                fetchJson(`/api/commissions/exceptions/${item.id}/retry`, {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'Idempotency-Key': requestKey('retry'),
                                  },
                                  body: '{}',
                                }),
                              'Exception queued for an audited retry. Run the shadow processor when ready.',
                            )
                          }
                        >
                          Retry calculation
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500">Manual review required</span>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[]
  rows: React.ReactNode[][]
  empty: string
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-950/70 text-slate-400">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, index) => (
                  <td
                    key={index}
                    className={`px-4 py-3 ${index === 0 ? 'font-medium text-white' : 'text-slate-300'}`}
                  >
                    {cell ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <Empty text={empty} />}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="p-8 text-center text-sm text-slate-500">{text}</div>
}
