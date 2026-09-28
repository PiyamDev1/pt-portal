/**
 * Frappe HRMS transfer page.
 *
 * Lets the signed-in employee complete first-time HRMS details and create/link their
 * Frappe Employee record.
 */

import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { FrappeTransferClient } from './client'
import { FrappeHandoffLaunchClient } from './HandoffLaunchClient'
import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'
import { getFrappeProvisioningCandidate } from '@/lib/integrations/frappe/provisioning'

export const metadata = {
  title: 'Employee Module - PT Portal',
  description: 'Complete your Frappe HRMS employee transfer',
}

type FrappeTransferPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function FrappeTransferPage({ searchParams }: FrappeTransferPageProps) {
  const params = await searchParams
  const handoffStatus = typeof params?.handoff === 'string' ? params.handoff : null
  const { userId, employeeName, role, location } = await loadDashboardPageContext()
  const candidate = await getFrappeProvisioningCandidate(userId)

  const shouldLaunchFrappe = Boolean(
    candidate?.frappe_employee_id && (!handoffStatus || handoffStatus === 'required'),
  )

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50">
        <PageHeader
          employeeName={employeeName}
          role={role}
          location={location}
          userId={userId}
          showBack={true}
        />

        <main className="mx-auto max-w-6xl p-6">
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-700">
              Frappe HRMS
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Employee Module</h1>
            <p className="mt-2 max-w-3xl text-slate-600">
              If this is your first time, complete your HRMS transit setup here. Once your profile
              is linked, this module opens Frappe HRMS directly.
            </p>
          </div>

          {shouldLaunchFrappe ? (
            <FrappeHandoffLaunchClient
              employeeName={employeeName}
              returningFromFrappe={handoffStatus === 'required'}
            />
          ) : (
            <FrappeTransferClient />
          )}
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
