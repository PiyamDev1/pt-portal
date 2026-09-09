'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  CheckCircle2,
  Coins,
  FileUp,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Store,
} from 'lucide-react'
import { toast } from 'sonner'
import type { ApiResponse } from '@/lib/api/http'
import type {
  PosBootstrapPayload,
  PosLedgerPeriod,
  PosLedgerTransaction,
  PosLegacyImportPreview,
  PosMutationResult,
  PosReportPayload,
} from '@/lib/pos/contracts'

export type PosWorkspaceView =
  | 'Daily transactions'
  | 'Open till'
  | 'Closeout'
  | 'Cash management'
  | 'Refunds & corrections'
  | 'Reports'
  | 'Unreconciled'
  | 'Import history'

type Props = {
  view: PosWorkspaceView
  bootstrap: PosBootstrapPayload
  transactions: PosLedgerTransaction[]
  period: PosLedgerPeriod
  date: string
  selectedTransactionId: string
  onSelectedTransaction: (id: string) => void
  onRefresh: () => Promise<void>
}

const DENOMINATIONS = [1, 2, 5, 10, 20, 50, 100, 200] as const

function money(value: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value)
}

function parseCsvLine(line: string) {
  const values: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"' && line[index + 1] === '"' && quoted) {
      value += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === ',' && !quoted) {
      values.push(value.trim())
      value = ''
    } else {
      value += character
    }
  }
  values.push(value.trim())
  return values
}

function parseLegacyCsv(csv: string) {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean)
  const headers = parseCsvLine(lines.shift() || '')
  return lines.map((line) => {
    const row = Object.fromEntries(
      parseCsvLine(line)
        .map((entry, index) => [headers[index], entry] as const)
        .filter(([header, entry]) => Boolean(header) && entry !== ''),
    )
    return { ...row, amount: Number(row.amount) }
  })
}

async function postMutation<T extends object>(
  path: string,
  body: unknown,
  key = crypto.randomUUID(),
) {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  })
  const payload = (await response.json()) as ApiResponse<T>
  if (!response.ok || 'error' in payload) {
    throw new Error('error' in payload ? payload.error : 'The POS action failed.')
  }
  return payload
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
      />
    </label>
  )
}

function ActionButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export default function PosOperationsPanel(props: Props) {
  const { bootstrap, transactions, view } = props
  const [busy, setBusy] = useState(false)
  const [openingFloat, setOpeningFloat] = useState(
    String((bootstrap.closeouts[0]?.countedDrawer || 0).toFixed(2)),
  )
  const [selectedTill, setSelectedTill] = useState(bootstrap.tills[0]?.id || '')
  const [countedDrawer, setCountedDrawer] = useState(String(bootstrap.balances.drawer.toFixed(2)))
  const [countedReserve, setCountedReserve] = useState(
    String(bootstrap.balances.reserve.toFixed(2)),
  )
  const [reason, setReason] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [cashType, setCashType] = useState<
    'RESERVE_IN' | 'RESERVE_OUT' | 'DEPOSIT' | 'WITHDRAWAL' | 'CORRECTION'
  >('RESERVE_IN')
  const [cashCorrectionDirection, setCashCorrectionDirection] = useState<'IN' | 'OUT'>('IN')
  const [cashAmount, setCashAmount] = useState('0.00')
  const [coinValue, setCoinValue] = useState<(typeof DENOMINATIONS)[number]>(100)
  const [coinCount, setCoinCount] = useState('0')
  const [report, setReport] = useState<PosReportPayload | null>(null)
  const [refundKind, setRefundKind] = useState<'LINKED' | 'GENERAL'>('LINKED')
  const [refundAmount, setRefundAmount] = useState('0.00')
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'CARD' | 'BANK'>('CASH')
  const [refundNote, setRefundNote] = useState('Customer refund')
  const [refundReason, setRefundReason] = useState('CUSTOMER_REQUEST')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [csv, setCsv] = useState('')
  const [importPreview, setImportPreview] = useState<PosLegacyImportPreview | null>(null)

  const selectedTransaction = useMemo(
    () =>
      transactions.find((transaction) => transaction.id === props.selectedTransactionId) || null,
    [props.selectedTransactionId, transactions],
  )

  useEffect(() => {
    setSelectedTill((current) => current || bootstrap.tills[0]?.id || '')
    setCountedDrawer(bootstrap.balances.drawer.toFixed(2))
    setCountedReserve(bootstrap.balances.reserve.toFixed(2))
  }, [bootstrap.balances.drawer, bootstrap.balances.reserve, bootstrap.tills])

  useEffect(() => {
    if (view !== 'Reports' && view !== 'Unreconciled') return
    const controller = new AbortController()
    const params = new URLSearchParams({ period: props.period, date: props.date })
    void fetch(`/api/pos/reports?${params}`, {
      cache: 'no-store',
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as ApiResponse<PosReportPayload>
        if (!response.ok || 'error' in payload)
          throw new Error('error' in payload ? payload.error : 'Unable to load reports.')
        setReport(payload)
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        toast.error(error instanceof Error ? error.message : 'Unable to load reports.')
      })
    return () => controller.abort()
  }, [props.date, props.period, view, bootstrap.loadedAt])

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      await action()
      toast.success(success)
      setReason('')
      setVerificationCode('')
      await props.onRefresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The POS action failed.')
    } finally {
      setBusy(false)
    }
  }

  if (view === 'Daily transactions') return null

  if (!bootstrap.schemaReady) {
    return (
      <section className="rounded-[1.15rem] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-black">POS database upgrade pending</p>
        <p className="mt-1 text-xs">
          Live operations will unlock after capability version{' '}
          {bootstrap.capabilityVersion || 2026090902} is deployed.
        </p>
      </section>
    )
  }

  if (view === 'Open till') {
    return (
      <section className="rounded-[1.15rem] border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-black">
          <Store className="h-4 w-4" /> Till and active shift
        </h2>
        {bootstrap.activeShift ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <p className="rounded-xl bg-emerald-50 p-3 text-xs">
              <b>Open:</b> {bootstrap.activeShift.tillName}
            </p>
            <p className="rounded-xl bg-slate-50 p-3 text-xs">
              <b>Business date:</b> {bootstrap.activeShift.businessDate}
            </p>
            <p className="rounded-xl bg-slate-50 p-3 text-xs">
              <b>Opening float:</b> {money(bootstrap.activeShift.openingFloat)}
            </p>
            <p className="rounded-xl bg-slate-50 p-3 text-xs">
              <b>Opened by:</b> {bootstrap.activeShift.openedBy}
            </p>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase text-slate-500">
                Till
              </span>
              <select
                value={selectedTill}
                onChange={(event) => setSelectedTill(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs font-semibold"
              >
                {bootstrap.tills.map((till) => (
                  <option key={till.id} value={till.id}>
                    {till.name} · {till.code}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Opening float"
              value={openingFloat}
              onChange={setOpeningFloat}
              type="number"
            />
            <ActionButton
              disabled={busy || !selectedTill}
              onClick={() =>
                void run(
                  () =>
                    postMutation<PosMutationResult>('/api/pos/shifts', {
                      action: 'OPEN',
                      tillId: selectedTill,
                      openingFloat: Number(openingFloat),
                    }),
                  'Till opened',
                )
              }
            >
              Open shift
            </ActionButton>
          </div>
        )}
      </section>
    )
  }

  if (view === 'Closeout') {
    return (
      <section className="space-y-4 rounded-[1.15rem] border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-black">
          <ShieldCheck className="h-4 w-4" /> Closeout and independent approval
        </h2>
        {bootstrap.activeShift ? (
          <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
            <Field
              label="Counted drawer"
              value={countedDrawer}
              onChange={setCountedDrawer}
              type="number"
            />
            <Field
              label="Counted reserve"
              value={countedReserve}
              onChange={setCountedReserve}
              type="number"
            />
            <Field
              label="Difference reason"
              value={reason}
              onChange={setReason}
              placeholder="Required when counts differ"
            />
            <ActionButton
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    postMutation('/api/pos/shifts', {
                      action: 'CLOSE',
                      shiftId: bootstrap.activeShift!.id,
                      countedDrawer: Number(countedDrawer),
                      countedReserve: Number(countedReserve),
                      drawerDenominations: [],
                      reserveDenominations: [],
                      ...(reason ? { reason } : {}),
                    }),
                  'Till counted and closed',
                )
              }
            >
              Close shift
            </ActionButton>
          </div>
        ) : (
          <p className="text-xs text-slate-500">There is no open shift to close.</p>
        )}
        <div className="space-y-2">
          {bootstrap.closeouts.map((closeout) => (
            <article
              key={closeout.id}
              className="flex flex-col justify-between gap-3 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center"
            >
              <div className="text-xs">
                <p className="font-black">
                  {closeout.tillName} · {closeout.status}
                </p>
                <p className="mt-1 text-slate-500">
                  Counted by {closeout.countedBy} · drawer {money(closeout.drawerDifference)} ·
                  reserve {money(closeout.reserveDifference)}
                </p>
              </div>
              {closeout.canApprove && (
                <div className="flex gap-2">
                  <input
                    aria-label="2FA code"
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value)}
                    placeholder="2FA code"
                    className="h-9 w-28 rounded-lg border px-2 text-xs"
                  />
                  <ActionButton
                    disabled={busy || !verificationCode}
                    onClick={() =>
                      void run(
                        () =>
                          postMutation('/api/pos/shifts', {
                            action: 'APPROVE',
                            closeoutId: closeout.id,
                            verificationCode,
                            verificationMethod: 'auto',
                          }),
                        'Closeout approved',
                      )
                    }
                  >
                    Approve
                  </ActionButton>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    )
  }

  if (view === 'Cash management') {
    const needsCoins = cashType === 'RESERVE_IN' || cashType === 'RESERVE_OUT'
    const denominations = needsCoins ? [{ valuePence: coinValue, count: Number(coinCount) }] : []
    const calculated = (coinValue * Number(coinCount || 0)) / 100
    return (
      <section className="rounded-[1.15rem] border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-black">
          <Coins className="h-4 w-4" /> Cash management
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Expected drawer {money(bootstrap.balances.drawer)} · reserve{' '}
          {money(bootstrap.balances.reserve)}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:items-end">
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase text-slate-500">
              Movement
            </span>
            <select
              value={cashType}
              onChange={(event) => setCashType(event.target.value as typeof cashType)}
              className="h-10 w-full rounded-xl border px-2 text-xs"
            >
              <option value="RESERVE_IN">Drawer to reserve</option>
              <option value="RESERVE_OUT">Reserve to drawer</option>
              <option value="DEPOSIT">Bank deposit</option>
              <option value="WITHDRAWAL">Cash withdrawal</option>
              <option value="CORRECTION">Cash correction</option>
            </select>
          </label>
          {needsCoins ? (
            <>
              <label>
                <span className="mb-1 block text-[10px] font-black uppercase text-slate-500">
                  Coin
                </span>
                <select
                  value={coinValue}
                  onChange={(event) => setCoinValue(Number(event.target.value) as typeof coinValue)}
                  className="h-10 w-full rounded-xl border px-2 text-xs"
                >
                  {DENOMINATIONS.map((value) => (
                    <option key={value} value={value}>
                      {money(value / 100)}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Count"
                value={coinCount}
                onChange={(value) => {
                  setCoinCount(value)
                  setCashAmount(String((coinValue * Number(value || 0)) / 100))
                }}
                type="number"
              />
            </>
          ) : (
            <Field label="Amount" value={cashAmount} onChange={setCashAmount} type="number" />
          )}
          {cashType === 'CORRECTION' && (
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase text-slate-500">
                Direction
              </span>
              <select
                value={cashCorrectionDirection}
                onChange={(event) =>
                  setCashCorrectionDirection(event.target.value as typeof cashCorrectionDirection)
                }
                className="h-10 w-full rounded-xl border px-2 text-xs"
              >
                <option value="IN">Money in</option>
                <option value="OUT">Money out</option>
              </select>
            </label>
          )}
          <Field label="Reason" value={reason} onChange={setReason} />
          <Field
            label="Manager 2FA"
            value={verificationCode}
            onChange={setVerificationCode}
            placeholder="Controlled movements only"
          />
          <ActionButton
            disabled={busy || !bootstrap.activeShift || (needsCoins && calculated <= 0)}
            onClick={() =>
              void run(
                () =>
                  postMutation('/api/pos/cash-movements', {
                    shiftId: bootstrap.activeShift!.id,
                    movementType: cashType,
                    ...(cashType === 'CORRECTION' ? { direction: cashCorrectionDirection } : {}),
                    amount: needsCoins ? calculated : Number(cashAmount),
                    denominations,
                    reason,
                    ...(verificationCode ? { verificationCode, verificationMethod: 'auto' } : {}),
                  }),
                'Cash movement recorded',
              )
            }
          >
            Record movement
          </ActionButton>
        </div>
      </section>
    )
  }

  if (view === 'Refunds & corrections') {
    const candidates = transactions.filter(
      (transaction) => !transaction.isLegacy && transaction.amount > 0,
    )
    return (
      <section className="space-y-3 rounded-[1.15rem] border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-black">
          <RotateCcw className="h-4 w-4" /> Refunds and controlled corrections
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase text-slate-500">
              Refund route
            </span>
            <select
              value={refundKind}
              onChange={(event) => setRefundKind(event.target.value as typeof refundKind)}
              className="h-10 w-full rounded-xl border px-3 text-xs"
            >
              <option value="LINKED">Linked transaction</option>
              <option value="GENERAL">General refund</option>
            </select>
          </label>
          {refundKind === 'LINKED' && (
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase text-slate-500">
                Original
              </span>
              <select
                value={props.selectedTransactionId}
                onChange={(event) => props.onSelectedTransaction(event.target.value)}
                className="h-10 w-full rounded-xl border px-2 text-xs"
              >
                {candidates.map((transaction) => (
                  <option key={transaction.id} value={transaction.id}>
                    {transaction.reference} · {transaction.name} ·{' '}
                    {money(
                      transaction.refundableRemaining ??
                        transaction.amountPaid ??
                        transaction.amount,
                    )}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Field
            label="Refund amount"
            value={refundAmount}
            onChange={setRefundAmount}
            type="number"
          />
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase text-slate-500">
              Method
            </span>
            <select
              value={refundMethod}
              onChange={(event) => setRefundMethod(event.target.value as typeof refundMethod)}
              className="h-10 w-full rounded-xl border px-3 text-xs"
            >
              <option>CASH</option>
              <option>CARD</option>
              <option>BANK</option>
            </select>
          </label>
          <Field label="Reason code" value={refundReason} onChange={setRefundReason} />
          <Field label="Note" value={refundNote} onChange={setRefundNote} />
          <Field
            label="Evidence reference"
            value={evidenceReference}
            onChange={setEvidenceReference}
            placeholder="Required for general refunds"
          />
          <Field
            label="Manager 2FA"
            value={verificationCode}
            onChange={setVerificationCode}
            placeholder="Required for exceptions"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            disabled={
              busy || !bootstrap.activeShift || (refundKind === 'LINKED' && !selectedTransaction)
            }
            onClick={() =>
              void run(
                () =>
                  postMutation('/api/pos/refunds', {
                    shiftId: bootstrap.activeShift!.id,
                    refundKind,
                    ...(refundKind === 'LINKED'
                      ? { originalTransactionId: selectedTransaction!.id }
                      : {
                          originalEvidence: {
                            originalDate: props.date,
                            customerName: selectedTransaction?.name || 'Unknown customer',
                            service: selectedTransaction?.category || 'Legacy service',
                            originalAmount: Number(refundAmount),
                            originalPaymentMethod: 'UNKNOWN',
                          },
                        }),
                    amount: Number(refundAmount),
                    tenders: [{ method: refundMethod, amount: Number(refundAmount) }],
                    reasonCode: refundReason,
                    note: refundNote,
                    ...(evidenceReference ? { supportingReference: evidenceReference } : {}),
                    ...(verificationCode
                      ? {
                          verificationCode,
                          verificationMethod: 'auto',
                          approvalReason: reason || 'Approved general or threshold refund',
                        }
                      : {}),
                  }),
                'Refund recorded',
              )
            }
          >
            Record refund
          </ActionButton>
          {selectedTransaction?.outgoingType === 'EXPENSE' && bootstrap.permissions.canManage && (
            <ActionButton
              disabled={busy || !bootstrap.activeShift || !verificationCode || reason.length < 10}
              onClick={() =>
                void run(
                  () =>
                    postMutation('/api/pos/corrections', {
                      shiftId: bootstrap.activeShift?.id,
                      originalTransactionId: selectedTransaction.id,
                      reason,
                      verificationCode,
                      verificationMethod: 'auto',
                    }),
                  'Expense correction posted',
                )
              }
            >
              Reverse selected expense
            </ActionButton>
          )}
        </div>
      </section>
    )
  }

  if (view === 'Unreconciled') {
    return (
      <section className="rounded-[1.15rem] border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-black">
          <RefreshCcw className="h-4 w-4" /> Unreconciled card and bank items
        </h2>
        <div className="mt-3 space-y-2">
          {(report?.unreconciled || []).map((item) => (
            <article
              key={`${item.kind}:${item.tenderId}`}
              className="flex flex-col justify-between gap-3 rounded-xl bg-amber-50 p-3 sm:flex-row sm:items-center"
            >
              <div className="text-xs">
                <p className="font-black">
                  {item.reference} · {item.method} · {money(item.amount)}
                </p>
                <p className="mt-1 text-amber-800">
                  {item.status} · {item.externalReference || 'No external reference'}
                </p>
              </div>
              <ActionButton
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      postMutation('/api/pos/reconciliation', {
                        ...(item.kind === 'REFUND'
                          ? { refundTenderId: item.tenderId }
                          : { transactionTenderId: item.tenderId }),
                        status: 'COMPLETED',
                        note: 'Confirmed by POS operator',
                      }),
                    'Tender reconciled',
                  )
                }
              >
                Mark completed
              </ActionButton>
            </article>
          ))}
          {report && report.unreconciled.length === 0 && (
            <p className="text-xs text-slate-500">No unresolved non-cash tenders in this period.</p>
          )}
        </div>
      </section>
    )
  }

  if (view === 'Import history') {
    return (
      <section className="rounded-[1.15rem] border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-black">
          <FileUp className="h-4 w-4" /> Historical Excel/CSV import
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Export the sheet as CSV. Required headers: legacySource, legacyRowKey, businessDate,
          catalogueKey, customerName, direction, amount, paymentMethod. Optional: outgoingType,
          note, externalReference, originalReference.
        </p>
        <textarea
          value={csv}
          onChange={(event) => setCsv(event.target.value)}
          className="mt-3 h-40 w-full rounded-xl border p-3 font-mono text-xs"
          placeholder="legacySource,legacyRowKey,businessDate,catalogueKey,customerName,direction,amount,paymentMethod,note"
        />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field
            label="Manager 2FA for commit"
            value={verificationCode}
            onChange={setVerificationCode}
          />
          <ActionButton
            disabled={busy || !csv.trim()}
            onClick={() =>
              void run(async () => {
                const result = await postMutation<PosLegacyImportPreview>('/api/pos/import', {
                  mode: 'DRY_RUN',
                  rows: parseLegacyCsv(csv),
                })
                setImportPreview(result)
              }, 'Import dry run complete')
            }
          >
            Dry run
          </ActionButton>
          <ActionButton
            disabled={busy || !verificationCode || !importPreview}
            onClick={() =>
              void run(
                () =>
                  postMutation('/api/pos/import', {
                    mode: 'COMMIT',
                    rows: parseLegacyCsv(csv),
                    verificationCode,
                    verificationMethod: 'auto',
                  }),
                'Historical rows imported',
              )
            }
          >
            Commit import
          </ActionButton>
        </div>
        {importPreview && (
          <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs">
            <b>{importPreview.importableRows}</b> importable · <b>{importPreview.duplicateRows}</b>{' '}
            duplicates · <b>{importPreview.totalRows}</b> total
          </p>
        )}
      </section>
    )
  }

  return (
    <section className="rounded-[1.15rem] border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-black">
        <BarChart3 className="h-4 w-4" /> POS reports
      </h2>
      {report ? (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <p className="rounded-xl bg-emerald-50 p-3 text-xs">
              Gross receipts
              <br />
              <b className="text-lg">{money(report.totals.moneyIn)}</b>
            </p>
            <p className="rounded-xl bg-rose-50 p-3 text-xs">
              Refunds/out
              <br />
              <b className="text-lg">{money(report.totals.moneyOut)}</b>
            </p>
            <p className="rounded-xl bg-slate-50 p-3 text-xs">
              Drawer
              <br />
              <b className="text-lg">{money(report.totals.drawerBalance)}</b>
            </p>
            <p className="rounded-xl bg-amber-50 p-3 text-xs">
              Reserve
              <br />
              <b className="text-lg">{money(report.totals.reserveBalance)}</b>
            </p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <h3 className="text-xs font-black">By category</h3>
              {report.byCategory.map((row) => (
                <p key={row.key} className="mt-2 flex justify-between text-xs">
                  <span>{row.label}</span>
                  <b>{money(row.net)}</b>
                </p>
              ))}
            </div>
            <div>
              <h3 className="text-xs font-black">By payment</h3>
              {report.byPaymentMethod.map((row) => (
                <p key={row.method} className="mt-2 flex justify-between text-xs">
                  <span>{row.method}</span>
                  <b>{money(row.net)}</b>
                </p>
              ))}
            </div>
            <div>
              <h3 className="text-xs font-black">By agent</h3>
              {report.byAgent.map((row) => (
                <p key={row.id} className="mt-2 flex justify-between text-xs">
                  <span>{row.name}</span>
                  <b>{money(row.net)}</b>
                </p>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="mt-3 text-xs text-slate-500">Loading branch report…</p>
      )}
      <p className="mt-4 flex items-center gap-2 text-[10px] text-slate-400">
        <CheckCircle2 className="h-3.5 w-3.5" /> Scope: {bootstrap.branch.name}, {props.period},
        starting {props.date}; refunds included.
      </p>
    </section>
  )
}
