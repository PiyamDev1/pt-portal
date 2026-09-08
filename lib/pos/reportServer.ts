import 'server-only'

import type { StaffSession } from '@/lib/auth/staffSession'
import type {
  PosLedgerPeriod,
  PosLedgerTransaction,
  PosPaymentMethod,
  PosReportPayload,
} from '@/lib/pos/contracts'
import {
  loadPosLedger,
  posLedgerPeriodBounds,
  summarizePosLedgerItems,
} from '@/lib/pos/ledgerServer'
import { loadPosBootstrap } from '@/lib/pos/server'

type Aggregate = { moneyIn: number; moneyOut: number; net: number }

function addAggregate(map: Map<string, Aggregate>, key: string, amount: number) {
  const value = map.get(key) || { moneyIn: 0, moneyOut: 0, net: 0 }
  value.moneyIn += Math.max(amount, 0)
  value.moneyOut += Math.abs(Math.min(amount, 0))
  value.net += amount
  map.set(key, value)
}

export async function loadPosReport(
  access: StaffSession,
  period: PosLedgerPeriod,
  date: string,
): Promise<PosReportPayload> {
  const bootstrapPromise = loadPosBootstrap(access)
  const items: PosLedgerTransaction[] = []
  let cursor: string | undefined
  let pageCount = 0
  do {
    const page = await loadPosLedger(access.employee.id, period, date, {}, cursor)
    items.push(...page.items)
    cursor = page.nextCursor || undefined
    pageCount += 1
  } while (cursor && pageCount < 100)
  if (cursor) throw new Error('POS report exceeds the safe 50,000-row monthly limit')
  const bootstrap = await bootstrapPromise
  const category = new Map<string, Aggregate & { label: string }>()
  const agent = new Map<string, Aggregate & { name: string }>()
  const methods = new Map<PosPaymentMethod, Aggregate>()
  const unreconciled: PosReportPayload['unreconciled'] = []

  for (const item of items) {
    const categoryKey = item.categoryKey || 'uncategorised'
    const categoryValue = category.get(categoryKey) || {
      label: item.category,
      moneyIn: 0,
      moneyOut: 0,
      net: 0,
    }
    categoryValue.moneyIn += Math.max(item.amount, 0)
    categoryValue.moneyOut += Math.abs(Math.min(item.amount, 0))
    categoryValue.net += item.amount
    category.set(categoryKey, categoryValue)

    const agentKey = item.entryAgentId || item.entryAgent
    const agentValue = agent.get(agentKey) || {
      name: item.entryAgent,
      moneyIn: 0,
      moneyOut: 0,
      net: 0,
    }
    agentValue.moneyIn += Math.max(item.amount, 0)
    agentValue.moneyOut += Math.abs(Math.min(item.amount, 0))
    agentValue.net += item.amount
    agent.set(agentKey, agentValue)

    for (const tender of item.tenders) {
      if (!tender.methodCode) continue
      const signed = tender.direction === 'OUT' ? -tender.amount : tender.amount
      addAggregate(methods, tender.methodCode, signed)
      if (!['COMPLETED', 'CLEARED'].includes(tender.reconciliationStatus) && tender.id) {
        unreconciled.push({
          tenderId: tender.id,
          reference: item.reference,
          method: tender.methodCode,
          amount: tender.amount,
          status:
            tender.reconciliationStatus === 'CLEARED'
              ? 'COMPLETED'
              : tender.reconciliationStatus === 'OWED_TO_US' ||
                  tender.reconciliationStatus === 'UNPAID_DEBT_IN'
                ? 'PENDING'
                : tender.reconciliationStatus,
          externalReference: tender.externalReference || null,
          kind: item.outgoingType === 'REFUND' ? 'REFUND' : 'TRANSACTION',
        })
      }
    }
  }

  const { startDate, endDate } = posLedgerPeriodBounds(date, period)
  const closeoutDifference = bootstrap.closeouts
    .filter(
      (closeout) =>
        closeout.countedAt.slice(0, 10) >= startDate && closeout.countedAt.slice(0, 10) <= endDate,
    )
    .reduce((sum, closeout) => sum + closeout.drawerDifference + closeout.reserveDifference, 0)
  return {
    range: { startDate, endDate },
    totals: {
      ...summarizePosLedgerItems(items),
      drawerBalance: bootstrap.balances.drawer,
      reserveBalance: bootstrap.balances.reserve,
      closeoutDifference,
    },
    byCategory: [...category].map(([key, value]) => ({ key, ...value })),
    byAgent: [...agent].map(([id, value]) => ({ id, ...value })),
    byPaymentMethod: [...methods].map(([method, value]) => ({ method, ...value })),
    suppliers: bootstrap.suppliers,
    unreconciled,
  }
}
