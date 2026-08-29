'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BadgePoundSterling,
  Calculator,
  FileClock,
  Gauge,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react'

type JsonRecord = Record<string, any>
type MutationRunner = (work: () => Promise<unknown>, success: string) => Promise<void>
type Tab =
  | 'overview'
  | 'policies'
  | 'assignments'
  | 'preview'
  | 'shadow'
  | 'bonus'
  | 'exceptions'
  | 'access'

const tabs: Array<{ id: Tab; label: string; icon: typeof Gauge }> = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'policies', label: 'Policies', icon: Settings2 },
  { id: 'assignments', label: 'Assignments', icon: Users },
  { id: 'preview', label: 'Preview', icon: Calculator },
  { id: 'shadow', label: 'Shadow entries', icon: FileClock },
  { id: 'bonus', label: 'Bonus periods', icon: BadgePoundSterling },
  { id: 'exceptions', label: 'Exceptions', icon: AlertTriangle },
  { id: 'access', label: 'Access', icon: KeyRound },
]

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
  const [grants, setGrants] = useState<JsonRecord[]>([])
  const [options, setOptions] = useState<JsonRecord>({
    employees: [],
    locations: [],
    activePolicyVersions: [],
    canManageGrants: false,
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
      if (results[6].canManageGrants) {
        const grantData = await fetchJson('/api/commissions/access-grants')
        setGrants(grantData.items || [])
      } else {
        setGrants([])
      }
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
            Commission shadow console
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Configure employee policies and reconcile non-payable results. Shadow figures are hidden
            from agents and managers and cannot be transferred to payroll.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium hover:border-slate-500"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
        {tabs
          .filter((tab) => tab.id !== 'access' || options.canManageGrants)
          .map((tab) => {
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
          {activeTab === 'overview' && <Overview overview={overview} />}
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
          {activeTab === 'exceptions' && <Exceptions items={exceptions} />}
          {activeTab === 'access' && options.canManageGrants && (
            <Access
              items={grants}
              employees={options.employees || []}
              working={working}
              runMutation={runMutation}
            />
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

function Overview({ overview }: { overview: JsonRecord }) {
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
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value]) => (
        <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-bold text-white">{value}</p>
        </div>
      ))}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 sm:col-span-2 xl:col-span-4">
        <p className="font-semibold text-amber-100">Shadow mode is non-payable</p>
        <p className="mt-1 text-sm text-amber-200/75">
          Configure policies, process source history, and reconcile a full month here. No result
          creates an employee balance or payroll payment.
        </p>
      </div>
    </section>
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
    const components =
      template === 'primary_bonus'
        ? [
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
        : [
            {
              componentType: template === 'low_fare' ? 'fixed_per_event' : 'fixed_per_unit',
              ...(template === 'assistant' ? { sourceVariable: 'passenger_ticket_count' } : {}),
              recipientRole: template === 'low_fare' ? 'low_fare_actor' : 'assistant',
              rateValue: rate,
              eligibleServices: [],
              config: {},
            },
          ]
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
              <option value="assistant">Assistance per passenger-ticket</option>
              <option value="low_fare">Low Fare finder per event</option>
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
            sourceModule: serviceCode === 'package_sale' ? 'packages' : 'ticketing',
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
              onChange={(event) => setServiceCode(event.target.value)}
            >
              {[
                'tk_primary',
                'tk_assistance',
                'dc',
                'r_er',
                'low_fare',
                'higher_fare',
                'package_sale',
                'sales_bonus',
              ].map((code) => (
                <option key={code} value={code}>
                  {code.replace(/_/g, ' ')}
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
              {['primary', 'assistant', 'low_fare_actor', 'package_sales', 'sales_bonus'].map(
                (role) => (
                  <option key={role} value={role}>
                    {role.replace(/_/g, ' ')}
                  </option>
                ),
              )}
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
  return (
    <DataTable
      headers={['Recipient', 'Profit owner', 'Earning date', 'Kind', 'Amount', 'Revision']}
      empty="No shadow entries have been calculated yet."
      rows={items.map((item) => [
        item.recipientName,
        item.profitOwnerName,
        dateLabel(item.earningOn),
        item.entryKind,
        money(item.amountGbp),
        `v${item.revision}`,
      ])}
    />
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

function Exceptions({ items }: { items: JsonRecord[] }) {
  return (
    <DataTable
      headers={['Created', 'Employee', 'Code', 'Retries', 'Details']}
      empty="No open Commission exceptions."
      rows={items.map((item) => [
        dateLabel(String(item.createdAt).slice(0, 10)),
        item.employeeName || 'Unassigned',
        String(item.code).replace(/_/g, ' '),
        item.retryCount,
        JSON.stringify(item.details),
      ])}
    />
  )
}

function Access({
  items,
  employees,
  working,
  runMutation,
}: {
  items: JsonRecord[]
  employees: JsonRecord[]
  working: boolean
  runMutation: MutationRunner
}) {
  const [employeeId, setEmployeeId] = useState('')
  const active = useMemo(() => items.filter((item) => !item.revokedAt), [items])
  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <form
        className="self-start space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5"
        onSubmit={(event) => {
          event.preventDefault()
          void runMutation(
            () =>
              fetchJson('/api/commissions/access-grants', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Idempotency-Key': requestKey('grant'),
                },
                body: JSON.stringify({ employeeId }),
              }),
            'Narrow Commission policy access granted.',
          )
        }}
      >
        <div>
          <h2 className="text-lg font-semibold">Grant HR policy access</h2>
          <p className="mt-1 text-sm text-slate-400">
            This grants Commission setup and preview only, not general administrator access.
          </p>
        </div>
        <Field label="Employee">
          <select
            className={inputClass}
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            required
          >
            <option value="">Select employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </Field>
        <button className={buttonClass} disabled={working}>
          Grant access
        </button>
      </form>
      <div className="space-y-3">
        {active.length === 0 ? (
          <Empty text="No active HR Commission access grants." />
        ) : (
          active.map((grant) => (
            <div
              key={grant.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900 p-5"
            >
              <div>
                <p className="font-semibold">{grant.employeeName}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {grant.employeeEmail} · granted by {grant.grantedByName}
                </p>
              </div>
              <button
                className="rounded-lg border border-rose-500/40 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/10"
                disabled={working}
                onClick={() =>
                  void runMutation(
                    () =>
                      fetchJson(`/api/commissions/access-grants/${grant.id}`, {
                        method: 'DELETE',
                        headers: { 'Idempotency-Key': requestKey('revoke') },
                      }),
                    'Commission policy access revoked.',
                  )
                }
              >
                Revoke
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[]
  rows: unknown[][]
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
                    {String(cell ?? '')}
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
