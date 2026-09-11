'use client'

import {
  CalendarClock,
  CheckCircle2,
  Copy,
  Link2,
  Megaphone,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Target,
  UsersRound,
  X,
} from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'

import type { LoyaltyDashboardPayload } from '@/lib/loyalty/contracts'

type Campaign = LoyaltyDashboardPayload['campaigns'][number]
type EventType = Campaign['eventType']
type Tier = Campaign['audienceTiers'][number]
type Filter = 'all' | Campaign['status']

const inputClass =
  'mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#7f1d2d] focus:ring-2 focus:ring-red-100'
const tiers: Tier[] = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Ruby', 'Diamond', 'Elite']
const campaignDateFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/London',
})
const statusTone: Record<Campaign['status'], string> = {
  draft: 'bg-slate-100 text-slate-700',
  scheduled: 'bg-sky-100 text-sky-800',
  active: 'bg-emerald-100 text-emerald-800',
  ended: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-rose-100 text-rose-800',
}

const eventCopy: Record<EventType, { label: string; help: string; automated: string }> = {
  double_points: {
    label: 'Points multiplier',
    help: 'Adds extra points to a qualifying purchase.',
    automated: 'Automatic sale award',
  },
  fixed_bonus: {
    label: 'Fixed transaction bonus',
    help: 'Adds a fixed number of points after a qualifying purchase.',
    automated: 'Automatic sale award',
  },
  welcome_bonus: {
    label: 'Welcome bonus',
    help: 'Rewards a member after their first qualifying paid service.',
    automated: 'First qualifying purchase',
  },
  referral_bonus: {
    label: 'Verified referral',
    help: 'Rewards the referrer and the newly referred customer.',
    automated: 'Verified referral flow',
  },
  off_peak_bonus: {
    label: 'Off-peak / targeted',
    help: 'A fixed incentive limited by dates, branches or services.',
    automated: 'Automatic sale award',
  },
  birthday_gift: {
    label: 'Birthday gift',
    help: 'Issues once during an active birthday window.',
    automated: 'Daily loyalty processor',
  },
  eid_gift: {
    label: 'Eid gift',
    help: 'Issues once to eligible active members during the campaign.',
    automated: 'Daily loyalty processor',
  },
}

function localDateTime(value?: string) {
  const date = value ? new Date(value) : new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

function defaultPoints(type: EventType) {
  if (type === 'referral_bonus') return 150
  if (type === 'off_peak_bonus') return 25
  return 100
}

function defaultCustomerCap(type: EventType) {
  if (type === 'double_points') return 500
  if (type === 'referral_bonus') return 750
  if (type === 'fixed_bonus') return 50
  return 100
}

function initialEnd() {
  const end = new Date()
  end.setMonth(end.getMonth() + 1)
  return end.toISOString()
}

export function LoyaltyCampaignManager({
  campaigns: initialCampaigns,
  campaignOptions,
  initialEventType = null,
}: Pick<LoyaltyDashboardPayload, 'campaigns' | 'campaignOptions'> & {
  initialEventType?: EventType | null
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [editing, setEditing] = useState<Campaign | 'new' | null>(initialEventType ? 'new' : null)
  const [eventType, setEventType] = useState<EventType>(initialEventType ?? 'double_points')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return campaigns.filter(
      (campaign) =>
        (filter === 'all' || campaign.status === filter) &&
        (!needle ||
          campaign.name.toLowerCase().includes(needle) ||
          eventCopy[campaign.eventType].label.toLowerCase().includes(needle)),
    )
  }, [campaigns, filter, query])
  const campaignNames = useMemo(
    () => new Map(campaigns.map((campaign) => [campaign.id, campaign.name])),
    [campaigns],
  )

  function create(type: EventType) {
    setEventType(type)
    setEditing('new')
    setMessage(null)
    setError(null)
  }

  function clone(campaign: Campaign) {
    setEventType(campaign.eventType)
    setEditing({
      ...campaign,
      id: '',
      name: `${campaign.name} copy`,
      status: 'draft',
      performance: { awardCount: 0, customerCount: 0, awardedPoints: 0, lastAwardedAt: null },
    })
  }

  async function saveCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const id = String(data.get('id') || '') || undefined
    const selectedTiers =
      eventType === 'referral_bonus'
        ? tiers
        : tiers.filter((tier) => data.getAll('audienceTiers').includes(tier))
    const numberOrNull = (name: string) => {
      const value = String(data.get(name) || '')
      return value ? Number(value) : null
    }
    setPending(true)
    setMessage(null)
    setError(null)
    try {
      const response = await fetch('/api/loyalty/program', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
          eligibleServiceKeys: data.getAll('eligibleServiceKeys').map(String),
          eligibleBranchIds: data.getAll('eligibleBranchIds').map(String),
          audienceTiers: selectedTiers,
          maxAwardsPerCustomer: Number(data.get('maxAwardsPerCustomer')),
          perCustomerCap: Number(data.get('perCustomerCap')),
          totalPointsBudget: Number(data.get('totalPointsBudget')),
          minimumSpendPence: Math.round(Number(data.get('minimumSpendPounds')) * 100),
          priority: Number(data.get('priority')),
          linkedCampaignId: String(data.get('linkedCampaignId') || '') || null,
          allowStacking: data.get('allowStacking') === 'on',
          status: String(data.get('status')),
          terms: String(data.get('terms') || '') || null,
        }),
      })
      const payload = (await response.json()) as LoyaltyDashboardPayload & { error?: string }
      if (!response.ok) throw new Error(payload.error || 'The campaign could not be saved.')
      setCampaigns(payload.campaigns)
      setEditing(null)
      setMessage('Campaign saved. Its rules and administrator are in the audit history.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The campaign could not be saved.')
    } finally {
      setPending(false)
    }
  }

  const current = editing && editing !== 'new' ? editing : null
  const budgetUsed = (campaign: Campaign) =>
    campaign.totalPointsBudget > 0
      ? Math.min((campaign.performance.awardedPoints / campaign.totalPointsBudget) * 100, 100)
      : 0

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-red-100 bg-gradient-to-br from-white via-red-50/50 to-amber-50/50 p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#7f1d2d]">
              <Megaphone className="size-4" /> Bonus workspace
            </span>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">Campaigns</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Create, schedule and measure bonus events. Every campaign has an audience, qualifying
              scope, customer frequency limit and total budget.
            </p>
          </div>
          <button
            type="button"
            onClick={() => create('double_points')}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#7f1d2d] px-4 text-sm font-black text-white"
          >
            <Plus className="size-4" /> Create campaign
          </button>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {(['double_points', 'fixed_bonus', 'referral_bonus', 'birthday_gift'] as EventType[]).map(
            (type) => (
              <button
                key={type}
                type="button"
                onClick={() => create(type)}
                className="rounded-2xl border border-white bg-white/80 p-3 text-left shadow-sm transition hover:border-red-200 hover:-translate-y-0.5"
              >
                <p className="text-sm font-black">{eventCopy[type].label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{eventCopy[type].help}</p>
              </button>
            ),
          )}
        </div>
      </section>

      {message ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"
        >
          <CheckCircle2 className="size-4" /> {message}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800"
        >
          {error}
        </p>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {(['all', 'draft', 'scheduled', 'active', 'ended', 'cancelled'] as Filter[]).map(
              (status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFilter(status)}
                  aria-pressed={filter === status}
                  className={`min-h-11 rounded-xl px-3 text-xs font-black capitalize ${filter === status ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  {status}
                </button>
              ),
            )}
          </div>
          <label className="relative min-w-0 lg:w-72">
            <span className="sr-only">Search campaigns</span>
            <Search className="absolute left-3 top-3 size-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search campaigns"
              className="min-h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {visible.map((campaign) => (
            <article key={campaign.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black">{campaign.name}</h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusTone[campaign.status]}`}
                    >
                      {campaign.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-bold text-[#7f1d2d]">
                    {eventCopy[campaign.eventType].label} ·{' '}
                    {eventCopy[campaign.eventType].automated}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => clone(campaign)}
                    aria-label={`Duplicate ${campaign.name}`}
                    className="grid size-11 place-items-center rounded-xl bg-slate-100"
                  >
                    <Copy className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEventType(campaign.eventType)
                      setEditing(campaign)
                    }}
                    aria-label={`Edit ${campaign.name}`}
                    className="grid size-11 place-items-center rounded-xl bg-red-50 text-[#7f1d2d]"
                  >
                    <Pencil className="size-4" />
                  </button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <p className="rounded-xl bg-slate-50 p-2">
                  <b className="block text-base">
                    {campaign.performance.customerCount.toLocaleString('en-GB')}
                  </b>
                  Customers
                </p>
                <p className="rounded-xl bg-slate-50 p-2">
                  <b className="block text-base">
                    {campaign.performance.awardCount.toLocaleString('en-GB')}
                  </b>
                  Awards
                </p>
                <p className="rounded-xl bg-slate-50 p-2">
                  <b className="block text-base">
                    {campaign.performance.awardedPoints.toLocaleString('en-GB')}
                  </b>
                  Points used
                </p>
                <p className="rounded-xl bg-slate-50 p-2">
                  <b className="block text-base">{campaign.maxAwardsPerCustomer}</b>Per customer
                </p>
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-[11px] font-bold text-slate-500">
                  <span>Budget</span>
                  <span>
                    {campaign.performance.awardedPoints.toLocaleString('en-GB')} /{' '}
                    {campaign.totalPointsBudget.toLocaleString('en-GB')} points ·{' '}
                    {Math.round(budgetUsed(campaign))}%
                  </span>
                </div>
                <progress
                  value={campaign.performance.awardedPoints}
                  max={campaign.totalPointsBudget}
                  className="mt-1 h-2 w-full accent-[#7f1d2d]"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold text-slate-600">
                <span className="rounded-full bg-slate-100 px-2 py-1">
                  {campaign.audienceTiers.join(', ')}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-1">
                  {campaign.eligibleServiceKeys.length || 'All'} services
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-1">
                  {campaign.eligibleBranchIds.length || 'All'} branches
                </span>
                {campaign.linkedCampaignId ? (
                  <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-700">
                    <Link2 className="mr-1 inline size-3" />
                    Linked to {campaignNames.get(campaign.linkedCampaignId) ?? 'campaign'}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                <CalendarClock className="mr-1 inline size-4" />
                {campaignDateFormat.format(new Date(campaign.startsAt))} –{' '}
                {campaignDateFormat.format(new Date(campaign.endsAt))}
              </p>
            </article>
          ))}
          {!visible.length ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              No campaigns match this view.
            </div>
          ) : null}
        </div>
      </section>

      {editing ? (
        <form
          key={current?.id || 'new-campaign'}
          onSubmit={saveCampaign}
          className="rounded-3xl border border-red-200 bg-white p-4 shadow-xl sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#7f1d2d]">
                {current?.id ? 'Modify campaign' : 'New campaign'}
              </p>
              <h2 className="mt-1 text-2xl font-black">Campaign builder</h2>
              <p className="mt-1 text-sm text-slate-500">
                Complete the reward, audience, scope and guardrails before scheduling.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditing(null)}
              aria-label="Close campaign builder"
              className="grid size-11 place-items-center rounded-xl bg-slate-100"
            >
              <X className="size-4" />
            </button>
          </div>
          {current?.id ? <input type="hidden" name="id" value={current.id} /> : null}

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <fieldset className="space-y-3 rounded-2xl border border-slate-200 p-4">
              <legend className="px-2 text-sm font-black">1. Reward and schedule</legend>
              <label className="block text-xs font-bold">
                Campaign name
                <input
                  required
                  name="name"
                  defaultValue={current?.name ?? ''}
                  className={inputClass}
                  placeholder="Example: Eid Gold member gift"
                />
              </label>
              <label className="block text-xs font-bold">
                Event type
                <select
                  name="eventType"
                  value={eventType}
                  onChange={(event) => setEventType(event.target.value as EventType)}
                  className={inputClass}
                >
                  {Object.entries(eventCopy).map(([key, copy]) => (
                    <option key={key} value={key}>
                      {copy.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block font-normal leading-5 text-slate-500">
                  {eventCopy[eventType].help} Automation: {eventCopy[eventType].automated}.
                </span>
              </label>
              {eventType === 'double_points' ? (
                <label className="block text-xs font-bold">
                  Points multiplier
                  <input
                    key={eventType}
                    required
                    name="multiplier"
                    type="number"
                    min="1.01"
                    max="20"
                    step="0.01"
                    defaultValue={current?.multiplier ?? 2}
                    className={inputClass}
                  />
                </label>
              ) : (
                <label className="block text-xs font-bold">
                  Points per award
                  <input
                    key={eventType}
                    required
                    name="bonusPoints"
                    type="number"
                    min="1"
                    max="100000"
                    defaultValue={current?.bonusPoints ?? defaultPoints(eventType)}
                    className={inputClass}
                  />
                </label>
              )}
              {eventType === 'referral_bonus' ? (
                <label className="block text-xs font-bold">
                  Points for referred customer
                  <input
                    required
                    name="referredCustomerPoints"
                    type="number"
                    min="1"
                    max="100000"
                    defaultValue={current?.referredCustomerPoints ?? 100}
                    className={inputClass}
                  />
                </label>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold">
                  Starts
                  <input
                    required
                    name="startsAt"
                    type="datetime-local"
                    defaultValue={localDateTime(current?.startsAt)}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs font-bold">
                  Ends
                  <input
                    required
                    name="endsAt"
                    type="datetime-local"
                    defaultValue={localDateTime(current?.endsAt ?? initialEnd())}
                    className={inputClass}
                  />
                </label>
              </div>
              <label className="block text-xs font-bold">
                Status
                <select
                  name="status"
                  defaultValue={current?.status ?? 'draft'}
                  className={inputClass}
                >
                  <option value="draft">Draft – not awardable</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="active">Active</option>
                  <option value="ended">Ended</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
            </fieldset>

            <fieldset className="space-y-3 rounded-2xl border border-slate-200 p-4">
              <legend className="px-2 text-sm font-black">2. Audience and scope</legend>
              <div>
                <p className="text-xs font-bold">Eligible ranks</p>
                {eventType === 'referral_bonus' ? (
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Referral rewards involve a referrer and a new member, so this flow remains open
                    to every rank. Create separate fixed campaigns for rank-exclusive rewards.
                  </p>
                ) : null}
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {tiers.map((tier) => (
                    <label
                      key={tier}
                      className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold"
                    >
                      <input
                        key={`${eventType}:${tier}`}
                        name="audienceTiers"
                        value={tier}
                        type="checkbox"
                        disabled={eventType === 'referral_bonus'}
                        defaultChecked={
                          eventType === 'referral_bonus' ||
                          (current ? current.audienceTiers.includes(tier) : true)
                        }
                      />
                      {tier}
                    </label>
                  ))}
                </div>
              </div>
              <label className="block text-xs font-bold">
                Minimum qualifying spend (£)
                <input
                  name="minimumSpendPounds"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={((current?.minimumSpendPence ?? 0) / 100).toFixed(2)}
                  className={inputClass}
                />
              </label>
              <div>
                <p className="text-xs font-bold">
                  Services{' '}
                  <span className="font-normal text-slate-500">(none selected means all)</span>
                </p>
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {campaignOptions.services.map((service) => (
                    <label
                      key={service.key}
                      className="flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs hover:bg-slate-50"
                    >
                      <input
                        name="eligibleServiceKeys"
                        value={service.key}
                        type="checkbox"
                        defaultChecked={current?.eligibleServiceKeys.includes(service.key)}
                      />
                      <span>
                        <b>{service.label}</b>{' '}
                        <span className="text-slate-400">· {service.category}</span>
                      </span>
                    </label>
                  ))}
                  {!campaignOptions.services.length ? (
                    <p className="p-2 text-xs text-slate-500">
                      No active POS services are available to target. Leaving this empty applies to
                      all services.
                    </p>
                  ) : null}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold">
                  Branches{' '}
                  <span className="font-normal text-slate-500">(none selected means all)</span>
                </p>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {campaignOptions.branches.map((branch) => (
                    <label
                      key={branch.id}
                      className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold"
                    >
                      <input
                        name="eligibleBranchIds"
                        value={branch.id}
                        type="checkbox"
                        defaultChecked={current?.eligibleBranchIds.includes(branch.id)}
                      />
                      {branch.name}
                    </label>
                  ))}
                  {!campaignOptions.branches.length ? (
                    <p className="rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-500">
                      No active branches are available to target. Leaving this empty applies to all
                      branches.
                    </p>
                  ) : null}
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-3 rounded-2xl border border-slate-200 p-4">
              <legend className="px-2 text-sm font-black">3. Customer and budget limits</legend>
              <div className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                <ShieldCheck className="mr-1 inline size-4" />
                <b>Both customer limits apply.</b> Awards stop when either the count or points cap
                is reached.
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold">
                  Maximum awards per customer
                  <input
                    required
                    name="maxAwardsPerCustomer"
                    type="number"
                    min="1"
                    max="1000"
                    defaultValue={current?.maxAwardsPerCustomer ?? 1}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs font-bold">
                  Maximum points per customer
                  <input
                    key={eventType}
                    required
                    name="perCustomerCap"
                    type="number"
                    min="1"
                    max="1000000"
                    defaultValue={current?.perCustomerCap ?? defaultCustomerCap(eventType)}
                    className={inputClass}
                  />
                </label>
              </div>
              <label className="block text-xs font-bold">
                Total campaign points budget
                <input
                  required
                  name="totalPointsBudget"
                  type="number"
                  min="1"
                  max="100000000"
                  defaultValue={current?.totalPointsBudget ?? 10000}
                  className={inputClass}
                />
              </label>
              <label className="block text-xs font-bold">
                Overlap priority{' '}
                <span className="font-normal text-slate-500">(higher runs first)</span>
                <input
                  required
                  name="priority"
                  type="number"
                  min="1"
                  max="1000"
                  defaultValue={current?.priority ?? 100}
                  className={inputClass}
                />
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold">
                <input
                  name="allowStacking"
                  type="checkbox"
                  defaultChecked={current?.allowStacking ?? false}
                />
                Allow this reward alongside another eligible campaign
              </label>
            </fieldset>

            <fieldset className="space-y-3 rounded-2xl border border-slate-200 p-4">
              <legend className="px-2 text-sm font-black">4. Link and explain</legend>
              <label className="block text-xs font-bold">
                Linked campaign <span className="font-normal text-slate-500">(optional)</span>
                <select
                  name="linkedCampaignId"
                  defaultValue={current?.linkedCampaignId ?? ''}
                  className={inputClass}
                >
                  <option value="">No linked campaign</option>
                  {campaigns
                    .filter((campaign) => campaign.id !== current?.id)
                    .map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </option>
                    ))}
                </select>
                <span className="mt-1 block font-normal leading-5 text-slate-500">
                  Use this to group a follow-on, tier variant or related promotion. Each linked
                  campaign keeps its own limits.
                </span>
              </label>
              <label className="block text-xs font-bold">
                Customer-facing terms
                <textarea
                  name="terms"
                  maxLength={1000}
                  defaultValue={current?.terms ?? ''}
                  className={`${inputClass} min-h-28 py-3`}
                  placeholder="Explain who qualifies, when points arrive and the limits."
                />
              </label>
              <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                <Target className="mr-1 inline size-4" />A draft can be edited freely. Once awards
                exist, its limits cannot be reduced below usage. Ended or cancelled campaigns cannot
                be reactivated; clone one to run it again.
              </div>
            </fieldset>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setEditing(null)} className="button-secondary">
              Cancel
            </button>
            <button disabled={pending} className="button-primary min-w-48">
              <Save className="size-4" />
              {pending ? 'Saving…' : current?.id ? 'Save changes' : 'Create campaign'}
            </button>
          </div>
        </form>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <UsersRound className="size-5 text-[#7f1d2d]" />
          <h3 className="mt-2 font-black">Customer-safe limits</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Count, points, spend and total-budget controls prevent an event from issuing without
            bounds.
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <Link2 className="size-5 text-[#7f1d2d]" />
          <h3 className="mt-2 font-black">Linked variants</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Build Bronze, Silver, Gold or Diamond variants and connect them as one promotion family.
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4">
          <ShieldCheck className="size-5 text-[#7f1d2d]" />
          <h3 className="mt-2 font-black">Audited changes</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Every create and modification records the administrator and before/after configuration.
          </p>
        </article>
      </section>
    </div>
  )
}
