import type { Metadata } from 'next'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { loadEmployeeDepartmentNames } from '@/lib/auth/departmentMemberships'
import type { StaffSession } from '@/lib/auth/staffSession'
import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'
import { formatIsoDateInTimezone } from '@/lib/dateFormatter'
import type { PosLedgerFilters, PosLedgerPayload, PosLedgerPeriod } from '@/lib/pos/contracts'
import { isIsoDate, loadPosLedger } from '@/lib/pos/ledgerServer'
import { loadPosBootstrap } from '@/lib/pos/server'
import PosPreviewClient from './PosPreviewClient'

export const metadata: Metadata = {
  title: 'POS - PT Portal',
  description: 'Daily branch transactions and till workspace',
}

export default async function PosPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string | string[]
    period?: string | string[]
    date?: string | string[]
    status?: string | string[]
  }>
}) {
  const params = await searchParams
  const firstValue = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value
  const requestedSearch = Array.isArray(params.search) ? params.search[0] : params.search
  const initialSearch = String(requestedSearch || '')
    .trim()
    .slice(0, 120)
  const { supabase, userId, userEmail, employeeEmail, employeeName, role, location } =
    await loadDashboardPageContext()

  const { departmentNames } = await loadEmployeeDepartmentNames(supabase, userId)

  const timezone = location?.timezone || 'Europe/London'
  const currentDate = formatIsoDateInTimezone(new Date(), timezone)
  const requestedDate = firstValue(params.date)
  const ledgerDate = requestedDate && isIsoDate(requestedDate) ? requestedDate : currentDate
  const ledgerPeriod: PosLedgerPeriod = firstValue(params.period) === 'month' ? 'month' : 'day'
  const allowedStatuses = new Set<NonNullable<PosLedgerFilters['status']>>([
    'POSTED',
    'PARTIALLY_REFUNDED',
    'REFUNDED',
    'CORRECTED',
    'UNRECONCILED',
  ])
  const requestedStatus = firstValue(params.status)
  const statusFilter = allowedStatuses.has(
    requestedStatus as NonNullable<PosLedgerFilters['status']>,
  )
    ? (requestedStatus as NonNullable<PosLedgerFilters['status']>)
    : undefined
  let initialLoadError: string | null = null
  let initialLedger: PosLedgerPayload
  const access: StaffSession = {
    user: { id: userId, email: userEmail || employeeEmail || '' },
    employee: {
      id: userId,
      email: employeeEmail || userEmail || '',
      fullName: employeeName || userEmail || 'Staff member',
      role: role || '',
      departments: departmentNames,
    },
  }
  const initialBootstrap = await loadPosBootstrap(access).catch((error) => {
    console.error('[pos] initial bootstrap load failed', {
      errorType: error instanceof Error ? error.name : typeof error,
    })
    return null
  })

  try {
    initialLedger = await loadPosLedger(
      userId,
      ledgerPeriod,
      ledgerDate,
      statusFilter ? { status: statusFilter } : {},
    )
  } catch (error) {
    console.error('[pos] initial ledger load failed', {
      errorType: error instanceof Error ? error.name : typeof error,
    })
    initialLoadError = 'Live ledger data is temporarily unavailable.'
    initialLedger = {
      items: [],
      summary: {
        moneyIn: 0,
        moneyOut: 0,
        netMovement: 0,
        cashNet: 0,
        cardNet: 0,
        bankNet: 0,
        unreconciledCount: 0,
      },
      context: {
        branchId: location?.id || '',
        branchName: location?.name || 'Branch',
        timezone,
        period: ledgerPeriod,
        date: ledgerDate,
        loadedAt: new Date().toISOString(),
        source: 'daily_ledger_entries',
        truncated: false,
      },
    }
  }

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-[#f5f5f5] text-slate-950">
        <PageHeader
          employeeName={employeeName}
          role={role}
          location={location}
          userId={userId}
          showBack
        />

        <main className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <PosPreviewClient
            branchName={location?.name || initialLedger.context.branchName}
            employeeId={userId}
            initialLedger={initialLedger}
            initialBootstrap={initialBootstrap || undefined}
            initialLoadError={initialLoadError}
            initialSearch={initialSearch}
            initialStatusFilter={statusFilter || ''}
          />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
