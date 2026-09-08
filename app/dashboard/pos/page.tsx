import type { Metadata } from 'next'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import type { PosLedgerPayload } from '@/lib/pos/contracts'
import { loadPosLedger } from '@/lib/pos/ledgerServer'
import PosPreviewClient from './PosPreviewClient'

export const metadata: Metadata = {
  title: 'POS - PT Portal',
  description: 'Daily branch transactions and till workspace',
}

function currentDateInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export default async function PosPreviewPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('full_name, roles(name), locations(id, name, branch_code, timezone)')
    .eq('id', user.id)
    .single()

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations
  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles
  const timezone = location?.timezone || 'Europe/London'
  const ledgerDate = currentDateInTimezone(timezone)
  let initialLoadError: string | null = null
  let initialLedger: PosLedgerPayload

  try {
    initialLedger = await loadPosLedger(user.id, 'day', ledgerDate)
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
        period: 'day',
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
          employeeName={employee?.full_name}
          role={role?.name}
          location={location}
          userId={user.id}
          showBack
        />

        <main className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <PosPreviewClient
            branchName={location?.name || initialLedger.context.branchName}
            initialLedger={initialLedger}
            initialLoadError={initialLoadError}
          />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
