'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CircleAlert,
  Landmark,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  WalletCards,
} from 'lucide-react'
import {
  branchTotals,
  displayMonth,
  nextMonth,
  type AccountingLedgerResponse,
  type BranchLedgerPayload,
  type CompanyLedgerPayload,
  type LedgerItem,
  type LedgerKind,
  type LedgerSheet,
  type NamedBalance,
} from '@/lib/accounting/ledger'

type LedgerView = 'branch' | 'company'
type SaveState = 'saved' | 'pending' | 'saving' | 'error'

const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
})

function currentLondonMonth() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  return year && month ? `${year}-${month}` : new Date().toISOString().slice(0, 7)
}

const todayMonth = currentLondonMonth()

function money(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function saveLabel(state: SaveState) {
  if (state === 'saving') return 'Saving…'
  if (state === 'pending') return 'Changes pending'
  if (state === 'error') return 'Save failed'
  return 'Saved to Supabase'
}

function branchPayloadCanSave(payload: BranchLedgerPayload) {
  return (
    payload.incomeGroups.every((group) => group.trim()) &&
    payload.expenseGroups.every((group) => group.trim()) &&
    payload.items.every(
      (item) =>
        item.label.trim() && item.group.trim() && Number.isFinite(item.amount) && item.amount >= 0,
    )
  )
}

function companyPayloadCanSave(payload: CompanyLedgerPayload) {
  return [...payload.suppliers, ...payload.banks].every(
    (balance) =>
      balance.name.trim() && Number.isFinite(balance.start) && Number.isFinite(balance.end),
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${
        state === 'error'
          ? 'bg-rose-100 text-rose-800'
          : state === 'saving' || state === 'pending'
            ? 'bg-amber-100 text-amber-800'
            : 'bg-emerald-100 text-emerald-800'
      }`}
    >
      {state === 'saving' ? (
        <LoaderCircle className="h-3 w-3 animate-spin" />
      ) : state === 'saved' ? (
        <Save className="h-3 w-3" />
      ) : (
        <CircleAlert className="h-3 w-3" />
      )}
      {saveLabel(state)}
    </span>
  )
}

function SummaryCard({
  label,
  value,
  tone = 'slate',
  detail,
  format = 'money',
}: {
  label: string
  value: number
  tone?: 'slate' | 'emerald' | 'rose' | 'violet'
  detail?: string
  format?: 'money' | 'number'
}) {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-950',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    rose: 'border-rose-200 bg-rose-50 text-rose-950',
    violet: 'border-violet-200 bg-violet-50 text-violet-950',
  }
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone]}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.12em] opacity-60">{label}</p>
      <p className="mt-2 text-xl font-black tabular-nums sm:text-2xl">
        {format === 'money' ? GBP.format(value) : value.toLocaleString('en-GB')}
      </p>
      {detail ? <p className="mt-1 text-xs font-semibold opacity-60">{detail}</p> : null}
    </div>
  )
}

function CategoryColumn({
  kind,
  groups,
  manualItems,
  sourceItems,
  disabled,
  onChange,
}: {
  kind: LedgerKind
  groups: string[]
  manualItems: LedgerItem[]
  sourceItems: LedgerItem[]
  disabled: boolean
  onChange: (payload: { groups?: string[]; items?: LedgerItem[] }) => void
}) {
  const [drafts, setDrafts] = useState<Record<string, { label: string; amount: string }>>({})
  const [newCategory, setNewCategory] = useState('')
  const title = kind === 'income' ? 'Income' : 'Expenses'
  const tint = kind === 'income' ? 'emerald' : 'rose'
  const allItems = [...manualItems, ...sourceItems]
  const total = allItems.reduce((sum, item) => sum + item.amount, 0)

  function renameGroup(oldName: string, name: string) {
    const nextName = name.trim()
    if (!nextName || groups.some((group) => group === nextName && group !== oldName)) return
    onChange({
      groups: groups.map((group) => (group === oldName ? nextName : group)),
      items: manualItems.map((item) =>
        item.group === oldName ? { ...item, group: nextName, carriedFrom: undefined } : item,
      ),
    })
  }

  function addItem(group: string) {
    const draft = drafts[group]
    const label = draft?.label.trim()
    if (!label) return
    onChange({
      items: [...manualItems, { id: newId(kind), label, group, amount: money(draft.amount), kind }],
    })
    setDrafts((current) => ({ ...current, [group]: { label: '', amount: '' } }))
  }

  function addCategory() {
    const name = newCategory.trim()
    if (!name || groups.includes(name)) return
    onChange({ groups: [...groups, name] })
    setNewCategory('')
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header
        className={`flex items-center justify-between border-b px-4 py-4 sm:px-5 ${
          tint === 'emerald' ? 'border-emerald-100 bg-emerald-50' : 'border-rose-100 bg-rose-50'
        }`}
      >
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            Monthly entries
          </p>
          <h2 className="mt-1 text-lg font-black text-slate-950">{title}</h2>
        </div>
        <p
          className={`text-xl font-black tabular-nums ${
            tint === 'emerald' ? 'text-emerald-800' : 'text-rose-800'
          }`}
        >
          {GBP.format(total)}
        </p>
      </header>

      <div className="divide-y divide-slate-100">
        {groups.map((group) => {
          const groupItems = allItems.filter((item) => item.group === group)
          const draft = drafts[group] || { label: '', amount: '' }
          return (
            <div key={group}>
              <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-2.5 sm:px-5">
                <input
                  aria-label={`Rename ${group} category`}
                  defaultValue={group}
                  disabled={
                    disabled || group === 'Module profit' || group === 'Module losses / costs'
                  }
                  onBlur={(event) => renameGroup(group, event.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-1 text-xs font-black text-slate-800 outline-none hover:border-slate-200 focus:border-amber-300 focus:bg-white disabled:cursor-not-allowed"
                />
                <span className="text-[10px] font-bold text-slate-400">
                  {groupItems.length} {groupItems.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>

              {groupItems.map((item) => (
                <div
                  key={item.id}
                  className={`grid grid-cols-[minmax(0,1fr)_112px_34px] items-center gap-2 px-4 py-2.5 sm:px-5 ${
                    item.sourceKey ? 'bg-violet-50/70' : ''
                  }`}
                >
                  <div className="min-w-0">
                    {item.sourceKey ? (
                      <>
                        <p className="truncate text-xs font-black text-violet-950">{item.label}</p>
                        <p className="mt-0.5 text-[9px] font-black uppercase tracking-wide text-violet-600">
                          Live from {item.sourceKey}
                        </p>
                      </>
                    ) : (
                      <>
                        <input
                          aria-label={`Edit ${item.label} name`}
                          value={item.label}
                          disabled={disabled}
                          onChange={(event) =>
                            onChange({
                              items: manualItems.map((entry) =>
                                entry.id === item.id
                                  ? { ...entry, label: event.target.value, carriedFrom: undefined }
                                  : entry,
                              ),
                            })
                          }
                          className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-xs font-bold text-slate-900 outline-none hover:border-slate-200 focus:border-amber-300 focus:bg-amber-50 disabled:cursor-not-allowed"
                        />
                        {item.carriedFrom ? (
                          <span className="ml-1 text-[9px] font-bold text-amber-700">
                            Carried from {displayMonth(item.carriedFrom)}
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>
                  {item.sourceKey ? (
                    <span className="text-right font-mono text-xs font-black text-violet-900">
                      {GBP.format(item.amount)}
                    </span>
                  ) : (
                    <input
                      aria-label={`Edit ${item.label} amount`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.amount}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange({
                          items: manualItems.map((entry) =>
                            entry.id === item.id
                              ? {
                                  ...entry,
                                  amount: money(event.target.value),
                                  carriedFrom: undefined,
                                }
                              : entry,
                          ),
                        })
                      }
                      className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-right font-mono text-xs font-black outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed disabled:bg-slate-50"
                    />
                  )}
                  {item.sourceKey ? (
                    <span className="text-center text-[9px] font-black text-violet-600">LIVE</span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Remove ${item.label}`}
                      disabled={disabled}
                      onClick={() =>
                        onChange({ items: manualItems.filter((entry) => entry.id !== item.id) })
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}

              {group !== 'Module profit' && group !== 'Module losses / costs' ? (
                <div className="grid grid-cols-[minmax(0,1fr)_112px_34px] gap-2 px-4 py-3 sm:px-5">
                  <input
                    aria-label={`${title} ${group} new item`}
                    placeholder="Add description"
                    value={draft.label}
                    disabled={disabled}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [group]: { ...draft, label: event.target.value },
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') addItem(group)
                    }}
                    className="h-9 min-w-0 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 text-xs font-semibold outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed"
                  />
                  <input
                    aria-label={`${title} ${group} new amount`}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={draft.amount}
                    disabled={disabled}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [group]: { ...draft, amount: event.target.value },
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') addItem(group)
                    }}
                    className="h-9 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2 text-right font-mono text-xs font-black outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    aria-label={`Add item to ${group}`}
                    disabled={disabled || !draft.label.trim()}
                    onClick={() => addItem(group)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <footer className="flex gap-2 border-t border-slate-200 bg-slate-50 p-3 sm:px-5">
        <input
          aria-label={`New ${kind} category`}
          placeholder={`New ${kind} category`}
          value={newCategory}
          disabled={disabled}
          onChange={(event) => setNewCategory(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') addCategory()
          }}
          className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
        />
        <button
          type="button"
          disabled={disabled || !newCategory.trim()}
          onClick={addCategory}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Category
        </button>
      </footer>
    </section>
  )
}

function BalanceList({
  title,
  balances,
  disabled,
  onChange,
}: {
  title: string
  balances: NamedBalance[]
  disabled: boolean
  onChange: (balances: NamedBalance[]) => void
}) {
  const [name, setName] = useState('')
  const [end, setEnd] = useState('')

  function add() {
    const trimmed = name.trim()
    if (!trimmed) return
    onChange([...balances, { id: newId('balance'), name: trimmed, start: 0, end: money(end) }])
    setName('')
    setEnd('')
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
        <h3 className="text-sm font-black text-slate-950">{title}</h3>
        <p className="mt-0.5 text-[11px] text-slate-500">Opening and closing company balance</p>
      </header>
      <div className="divide-y divide-slate-100">
        {balances.length === 0 ? (
          <p className="px-5 py-6 text-center text-xs text-slate-400">
            No {title.toLowerCase()} added.
          </p>
        ) : null}
        {balances.map((balance) => (
          <div
            key={balance.id}
            className="grid grid-cols-[minmax(0,1fr)_100px_100px_34px] items-center gap-2 px-4 py-2.5 sm:px-5"
          >
            <input
              aria-label={`Edit ${balance.name} name`}
              value={balance.name}
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  balances.map((entry) =>
                    entry.id === balance.id
                      ? { ...entry, name: event.target.value, carriedFrom: undefined }
                      : entry,
                  ),
                )
              }
              className="min-w-0 rounded-md border border-transparent px-1 py-1 text-xs font-bold outline-none hover:border-slate-200 focus:border-amber-300 disabled:cursor-not-allowed"
            />
            <input
              aria-label={`Start of month ${balance.name} balance`}
              type="number"
              step="0.01"
              value={balance.start}
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  balances.map((entry) =>
                    entry.id === balance.id
                      ? { ...entry, start: money(event.target.value), carriedFrom: undefined }
                      : entry,
                  ),
                )
              }
              className="h-8 rounded-lg border border-slate-200 px-2 text-right font-mono text-xs font-black outline-none focus:border-amber-400 disabled:cursor-not-allowed disabled:bg-slate-50"
            />
            <input
              aria-label={`End of month ${balance.name} balance`}
              type="number"
              step="0.01"
              value={balance.end}
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  balances.map((entry) =>
                    entry.id === balance.id
                      ? { ...entry, end: money(event.target.value), carriedFrom: undefined }
                      : entry,
                  ),
                )
              }
              className="h-8 rounded-lg border border-slate-200 px-2 text-right font-mono text-xs font-black outline-none focus:border-amber-400 disabled:cursor-not-allowed disabled:bg-slate-50"
            />
            <button
              type="button"
              aria-label={`Remove ${balance.name}`}
              disabled={disabled}
              onClick={() => onChange(balances.filter((entry) => entry.id !== balance.id))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <footer className="grid grid-cols-[minmax(0,1fr)_100px_34px] gap-2 border-t border-slate-200 bg-slate-50 p-3 sm:px-5">
        <input
          aria-label={`New ${title.toLowerCase()} name`}
          placeholder="Name"
          value={name}
          disabled={disabled}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') add()
          }}
          className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:border-amber-400"
        />
        <input
          aria-label={`New ${title.toLowerCase()} closing balance`}
          type="number"
          step="0.01"
          placeholder="0.00"
          value={end}
          disabled={disabled}
          onChange={(event) => setEnd(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') add()
          }}
          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-right font-mono text-xs font-black outline-none focus:border-amber-400"
        />
        <button
          type="button"
          aria-label={`Add ${title.toLowerCase()}`}
          disabled={disabled || !name.trim()}
          onClick={add}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200"
        >
          <Plus className="h-4 w-4" />
        </button>
      </footer>
    </section>
  )
}

export default function BranchLedgerClient() {
  const [view, setView] = useState<LedgerView>('branch')
  const [month, setMonth] = useState(todayMonth)
  const [locationId, setLocationId] = useState('')
  const [data, setData] = useState<AccountingLedgerResponse | null>(null)
  const [branchPayload, setBranchPayload] = useState<BranchLedgerPayload | null>(null)
  const [companyPayload, setCompanyPayload] = useState<CompanyLedgerPayload | null>(null)
  const [branchRevision, setBranchRevision] = useState(0)
  const [companyRevision, setCompanyRevision] = useState(0)
  const [branchSaveState, setBranchSaveState] = useState<SaveState>('saved')
  const [companySaveState, setCompanySaveState] = useState<SaveState>('saved')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [migration, setMigration] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const branchSavedRef = useRef('')
  const companySavedRef = useRef('')
  const branchPayloadRef = useRef<BranchLedgerPayload | null>(null)
  const companyPayloadRef = useRef<CompanyLedgerPayload | null>(null)
  const branchSavingRef = useRef(false)
  const companySavingRef = useRef(false)

  const activeLocationId = locationId || data?.selectedBranch.id || ''

  const loadLedger = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setLoadError('')
      setMigration('')
      try {
        const query = new URLSearchParams({ month })
        if (locationId) query.set('locationId', locationId)
        const response = await fetch(`/api/accounting/ledger?${query}`, {
          cache: 'no-store',
          signal,
        })
        const payload = (await response.json().catch(() => ({}))) as AccountingLedgerResponse & {
          error?: string
          migration?: string
        }
        if (!response.ok) {
          setMigration(payload.migration || '')
          throw new Error(payload.error || 'Unable to load the Branch Ledger.')
        }
        setData(payload)
        setBranchPayload(payload.branchSheet.payload)
        setCompanyPayload(payload.companySheet.payload)
        setBranchRevision(payload.branchSheet.revision)
        setCompanyRevision(payload.companySheet.revision)
        branchPayloadRef.current = payload.branchSheet.payload
        companyPayloadRef.current = payload.companySheet.payload
        branchSavedRef.current = JSON.stringify(payload.branchSheet.payload)
        companySavedRef.current = JSON.stringify(payload.companySheet.payload)
        setBranchSaveState('saved')
        setCompanySaveState('saved')
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoadError(error instanceof Error ? error.message : 'Unable to load the Branch Ledger.')
        setData(null)
        setBranchPayload(null)
        setCompanyPayload(null)
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [locationId, month],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadLedger(controller.signal)
    return () => controller.abort()
  }, [loadLedger, refreshKey])

  const saveSheet = useCallback(
    async (
      scope: LedgerView,
      payload: BranchLedgerPayload | CompanyLedgerPayload,
      revision: number,
      finalize = false,
    ): Promise<LedgerSheet<BranchLedgerPayload | CompanyLedgerPayload>> => {
      const body =
        scope === 'branch'
          ? { scope, month, locationId: activeLocationId, revision, finalize, payload }
          : { scope, month, revision, finalize, payload }
      const response = await fetch('/api/accounting/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = (await response.json().catch(() => ({}))) as {
        sheet?: LedgerSheet<BranchLedgerPayload | CompanyLedgerPayload>
        error?: string
      }
      if (!response.ok || !result.sheet) {
        throw new Error(result.error || 'Unable to save the ledger changes.')
      }
      return result.sheet
    },
    [activeLocationId, month],
  )

  useEffect(() => {
    if (
      !data ||
      !branchPayload ||
      data.branchSheet.status === 'finalised' ||
      branchSavingRef.current ||
      branchSaveState === 'error' ||
      !branchPayloadCanSave(branchPayload)
    ) {
      return
    }
    const serialized = JSON.stringify(branchPayload)
    if (serialized === branchSavedRef.current) return
    const timer = window.setTimeout(async () => {
      branchSavingRef.current = true
      setBranchSaveState('saving')
      const payloadAtSave = branchPayloadRef.current
      if (!payloadAtSave) return
      try {
        const sheet = await saveSheet('branch', payloadAtSave, branchRevision)
        setBranchRevision(sheet.revision)
        branchSavedRef.current = JSON.stringify(sheet.payload)
        setData((current) =>
          current
            ? {
                ...current,
                branchSheet: sheet as LedgerSheet<BranchLedgerPayload>,
              }
            : current,
        )
        setBranchSaveState(
          JSON.stringify(branchPayloadRef.current) === branchSavedRef.current ? 'saved' : 'pending',
        )
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Unable to save branch changes.')
        setBranchSaveState('error')
      } finally {
        branchSavingRef.current = false
      }
    }, 650)
    return () => window.clearTimeout(timer)
  }, [branchPayload, branchRevision, branchSaveState, data, saveSheet])

  useEffect(() => {
    if (
      !data ||
      !companyPayload ||
      data.companySheet.status === 'finalised' ||
      companySavingRef.current ||
      companySaveState === 'error' ||
      !companyPayloadCanSave(companyPayload)
    ) {
      return
    }
    const serialized = JSON.stringify(companyPayload)
    if (serialized === companySavedRef.current) return
    const timer = window.setTimeout(async () => {
      companySavingRef.current = true
      setCompanySaveState('saving')
      const payloadAtSave = companyPayloadRef.current
      if (!payloadAtSave) return
      try {
        const sheet = await saveSheet('company', payloadAtSave, companyRevision)
        setCompanyRevision(sheet.revision)
        companySavedRef.current = JSON.stringify(sheet.payload)
        setData((current) =>
          current
            ? {
                ...current,
                companySheet: sheet as LedgerSheet<CompanyLedgerPayload>,
              }
            : current,
        )
        setCompanySaveState(
          JSON.stringify(companyPayloadRef.current) === companySavedRef.current
            ? 'saved'
            : 'pending',
        )
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Unable to save company changes.')
        setCompanySaveState('error')
      } finally {
        companySavingRef.current = false
      }
    }, 650)
    return () => window.clearTimeout(timer)
  }, [companyPayload, companyRevision, companySaveState, data, saveSheet])

  function changeBranch(updater: (current: BranchLedgerPayload) => BranchLedgerPayload) {
    if (!branchPayload || data?.branchSheet.status === 'finalised') return
    setBranchPayload((current) => {
      if (!current) return current
      const changed = updater(current)
      const next = {
        ...changed,
        profitEnd: branchTotals(changed, data?.sourceItems || []).profitEnd,
        sourceSnapshot: [],
      }
      branchPayloadRef.current = next
      return next
    })
    setBranchSaveState('pending')
    setLoadError('')
  }

  function changeCompany(updater: (current: CompanyLedgerPayload) => CompanyLedgerPayload) {
    if (!companyPayload || data?.companySheet.status === 'finalised') return
    setCompanyPayload((current) => {
      if (!current) return current
      const next = updater(current)
      companyPayloadRef.current = next
      return next
    })
    setCompanySaveState('pending')
    setLoadError('')
  }

  async function finalizeActive() {
    if (!data || !branchPayload || !companyPayload) return
    const state = view === 'branch' ? branchSaveState : companySaveState
    if (state !== 'saved') return
    try {
      if (view === 'branch') {
        setBranchSaveState('saving')
        await saveSheet('branch', branchPayload, branchRevision, true)
      } else {
        setCompanySaveState('saving')
        await saveSheet('company', companyPayload, companyRevision, true)
      }
      setMonth(nextMonth(month))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to finalise this ledger month.')
      if (view === 'branch') setBranchSaveState('error')
      else setCompanySaveState('error')
    }
  }

  const totals = useMemo(
    () => (branchPayload ? branchTotals(branchPayload, data?.sourceItems || []) : null),
    [branchPayload, data?.sourceItems],
  )

  if (loading && !data) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <div className="text-center">
          <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-emerald-700" />
          <p className="mt-3 text-sm font-bold text-slate-600">Loading live ledger…</p>
        </div>
      </div>
    )
  }

  if (!data || !branchPayload || !companyPayload) {
    return (
      <div className="space-y-5">
        <Link
          href="/dashboard/accounting"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-emerald-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Accounting home
        </Link>
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-950 shadow-sm">
          <CircleAlert className="h-6 w-6" />
          <h1 className="mt-3 text-xl font-black">Branch Ledger could not load</h1>
          <p className="mt-2 text-sm text-rose-800">{loadError}</p>
          {migration ? (
            <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 font-mono text-xs">
              Run {migration}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-rose-900 px-4 text-sm font-black text-white"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </section>
      </div>
    )
  }

  const selectedBranch =
    data.branches.find((branch) => branch.id === activeLocationId) || data.selectedBranch
  const branchFinalised = data.branchSheet.status === 'finalised'
  const companyFinalised = data.companySheet.status === 'finalised'
  const activeSaveState = view === 'branch' ? branchSaveState : companySaveState
  const activeFinalised = view === 'branch' ? branchFinalised : companyFinalised
  const controlsBusy =
    loading ||
    branchSaveState === 'pending' ||
    branchSaveState === 'saving' ||
    companySaveState === 'pending' ||
    companySaveState === 'saving'

  const displayedSummaries = data.branchSummaries.map((summary) => {
    if (summary.branch.id !== selectedBranch.id || !totals) return summary
    return {
      ...summary,
      income: totals.income,
      expenses: totals.expenses,
      net: totals.net,
      cashStart: branchPayload.cashStart,
      cashEnd: branchPayload.cashEnd,
      profitStart: branchPayload.profitStart,
      profitEnd: totals.profitEnd,
    }
  })
  const companyNet = displayedSummaries.reduce((sum, summary) => sum + summary.net, 0)
  const companyCash = displayedSummaries.reduce((sum, summary) => sum + summary.cashEnd, 0)

  return (
    <div className="space-y-5">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <Link
            href="/dashboard/accounting"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-emerald-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Accounting home
          </Link>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm">
              {view === 'branch' ? (
                <Building2 className="h-5 w-5" />
              ) : (
                <Landmark className="h-5 w-5" />
              )}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                  {view === 'branch' ? 'Branch Ledger' : 'Company Ledger'}
                </h1>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-800">
                  Live
                </span>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                {view === 'branch'
                  ? 'Fast monthly entry with live branch and module figures'
                  : 'All branches plus company-wide LMS, supplier and bank balances'}
              </p>
            </div>
          </div>
        </div>
        <SaveIndicator state={activeSaveState} />
      </header>

      <nav
        aria-label="Ledger view"
        className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
      >
        {(['branch', 'company'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setView(option)}
            className={`rounded-lg px-4 py-2 text-xs font-black ${
              view === option ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            {option === 'branch' ? 'Branch Ledger' : 'Company Ledger'}
          </button>
        ))}
      </nav>

      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-end lg:justify-between sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              Month
            </span>
            <span className="relative block">
              <CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                aria-label="Ledger month"
                type="month"
                value={month}
                disabled={controlsBusy}
                onChange={(event) => {
                  if (/^\d{4}-(?:0[1-9]|1[0-2])$/.test(event.target.value)) {
                    setMonth(event.target.value)
                  }
                }}
                className="h-10 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-black text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-wait"
              />
            </span>
          </label>
          {view === 'branch' ? (
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                Live branch
              </span>
              <select
                aria-label="Select branch"
                value={selectedBranch.id}
                disabled={controlsBusy}
                onChange={(event) => setLocationId(event.target.value)}
                className="h-10 min-w-52 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-wait"
              >
                {data.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                    {branch.branchCode ? ` · ${branch.branchCode}` : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] ${
              activeFinalised ? 'bg-slate-200 text-slate-700' : 'bg-sky-100 text-sky-800'
            }`}
          >
            {activeFinalised ? 'Finalised' : 'Open sheet'}
          </span>
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={controlsBusy}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          {!activeFinalised ? (
            <button
              type="button"
              onClick={() => void finalizeActive()}
              disabled={
                activeSaveState !== 'saved' || (view === 'branch' && data.sourceWarnings.length > 0)
              }
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Check className="h-4 w-4" /> Finalise {displayMonth(month)}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMonth(nextMonth(month))}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white hover:bg-slate-800"
            >
              Open next month <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </section>

      {loadError ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            className="shrink-0 font-black underline"
          >
            Reload
          </button>
        </div>
      ) : null}

      {view === 'branch' && totals ? (
        <>
          {data.sourceWarnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
              Live module totals are incomplete: {data.sourceWarnings.join(' ')} Refresh before
              finalising.
            </div>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Total income" value={totals.income} tone="emerald" />
            <SummaryCard label="Total expenses" value={totals.expenses} tone="rose" />
            <SummaryCard
              label="This month"
              value={totals.net}
              tone={totals.net >= 0 ? 'emerald' : 'rose'}
              detail={totals.net >= 0 ? 'Net profit' : 'Net loss'}
            />
            <SummaryCard
              label="Closing result"
              value={totals.profitEnd}
              tone="violet"
              detail={`Opened at ${GBP.format(branchPayload.profitStart)}`}
            />
          </section>

          <section className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-950 p-4 text-white shadow-sm sm:grid-cols-3 sm:p-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                {selectedBranch.name} cash
              </p>
              <p className="mt-1 text-sm font-black">
                Start and close the actual branch cash position
              </p>
            </div>
            <label>
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">
                Opening cash
              </span>
              <input
                aria-label={`Start of month ${selectedBranch.name} cash`}
                type="number"
                step="0.01"
                value={branchPayload.cashStart}
                disabled={branchFinalised}
                onChange={(event) =>
                  changeBranch((current) => ({
                    ...current,
                    cashStart: money(event.target.value),
                  }))
                }
                className="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-right font-mono text-sm font-black text-white outline-none focus:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">
                Closing cash
              </span>
              <input
                aria-label={`End of month ${selectedBranch.name} cash`}
                type="number"
                step="0.01"
                value={branchPayload.cashEnd}
                disabled={branchFinalised}
                onChange={(event) =>
                  changeBranch((current) => ({
                    ...current,
                    cashEnd: money(event.target.value),
                  }))
                }
                className="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-right font-mono text-sm font-black text-white outline-none focus:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
          </section>

          <section className="grid gap-4 2xl:grid-cols-2">
            <CategoryColumn
              kind="income"
              groups={branchPayload.incomeGroups}
              manualItems={branchPayload.items.filter((item) => item.kind === 'income')}
              sourceItems={data.sourceItems.filter((item) => item.kind === 'income')}
              disabled={branchFinalised}
              onChange={({ groups, items }) =>
                changeBranch((current) => ({
                  ...current,
                  incomeGroups: groups || current.incomeGroups,
                  items: items
                    ? [...items, ...current.items.filter((item) => item.kind === 'expense')]
                    : current.items,
                }))
              }
            />
            <CategoryColumn
              kind="expense"
              groups={branchPayload.expenseGroups}
              manualItems={branchPayload.items.filter((item) => item.kind === 'expense')}
              sourceItems={data.sourceItems.filter((item) => item.kind === 'expense')}
              disabled={branchFinalised}
              onChange={({ groups, items }) =>
                changeBranch((current) => ({
                  ...current,
                  expenseGroups: groups || current.expenseGroups,
                  items: items
                    ? [...current.items.filter((item) => item.kind === 'income'), ...items]
                    : current.items,
                }))
              }
            />
          </section>
        </>
      ) : null}

      {view === 'company' ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="All branch net result"
              value={companyNet}
              tone={companyNet >= 0 ? 'emerald' : 'rose'}
            />
            <SummaryCard label="Cash across branches" value={companyCash} tone="violet" />
            <SummaryCard
              label="LMS closing balance"
              value={companyPayload.lmsEnd}
              tone="slate"
              detail={`Opened at ${GBP.format(companyPayload.lmsStart)}`}
            />
            <SummaryCard
              label="Configured branches"
              value={data.branches.length}
              tone="slate"
              detail="Loaded live from Settings"
              format="number"
            />
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
              <h2 className="text-lg font-black text-slate-950">All branches</h2>
              <p className="mt-1 text-xs text-slate-500">
                Calculated from each live branch sheet. There are no duplicate totals to re-enter.
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-left text-xs">
                <thead className="bg-white text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Branch</th>
                    <th className="px-3 py-3 text-right">Income</th>
                    <th className="px-3 py-3 text-right">Expenses</th>
                    <th className="px-3 py-3 text-right">Net</th>
                    <th className="px-3 py-3 text-right">Cash</th>
                    <th className="px-5 py-3 text-right">Sheet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedSummaries.map((summary) => (
                    <tr key={summary.branch.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <p className="font-black text-slate-950">{summary.branch.name}</p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {summary.branch.branchCode || 'No branch code'} · {summary.status}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-emerald-700">
                        {GBP.format(summary.income)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-rose-700">
                        {GBP.format(summary.expenses)}
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono font-black ${summary.net >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}
                      >
                        {GBP.format(summary.net)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-slate-700">
                        {GBP.format(summary.cashEnd)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setLocationId(summary.branch.id)
                            setView('branch')
                          }}
                          disabled={controlsBusy}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-black text-slate-700 hover:border-emerald-300 hover:text-emerald-800 disabled:opacity-50"
                        >
                          Open <ArrowRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.8fr_1.1fr_1.1fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
              <WalletCards className="h-5 w-5 text-emerald-300" />
              <h2 className="mt-3 text-lg font-black">LMS balance</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Company-wide customer/company balance. This is not assigned to a branch.
              </p>
              <label className="mt-5 block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Opening balance
                </span>
                <input
                  aria-label="Start of month LMS balance"
                  type="number"
                  step="0.01"
                  value={companyPayload.lmsStart}
                  disabled={companyFinalised}
                  onChange={(event) =>
                    changeCompany((current) => ({
                      ...current,
                      lmsStart: money(event.target.value),
                    }))
                  }
                  className="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-right font-mono text-sm font-black outline-none focus:border-amber-400 disabled:opacity-60"
                />
              </label>
              <label className="mt-3 block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Closing balance
                </span>
                <input
                  aria-label="End of month LMS balance"
                  type="number"
                  step="0.01"
                  value={companyPayload.lmsEnd}
                  disabled={companyFinalised}
                  onChange={(event) =>
                    changeCompany((current) => ({
                      ...current,
                      lmsEnd: money(event.target.value),
                    }))
                  }
                  className="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-right font-mono text-sm font-black outline-none focus:border-amber-400 disabled:opacity-60"
                />
              </label>
            </div>
            <BalanceList
              title="Suppliers"
              balances={companyPayload.suppliers}
              disabled={companyFinalised}
              onChange={(suppliers) => changeCompany((current) => ({ ...current, suppliers }))}
            />
            <BalanceList
              title="Banks"
              balances={companyPayload.banks}
              disabled={companyFinalised}
              onChange={(banks) => changeCompany((current) => ({ ...current, banks }))}
            />
          </section>
        </>
      ) : null}
    </div>
  )
}
