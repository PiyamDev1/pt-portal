/**
 * Timeclock History Page
 *
 * Employee time tracking history and records:
 * - View attendance history with punch records
 * - Filter by date range and employee
 * - Export time records report
 * - Identify attendance patterns and absences
 * - Review approved time adjustments
 *
 * Server component that:
 * - Authenticates user access
 * - Loads time records from database
 * - Renders filterable history table
 *
 * @module app/dashboard/timeclock/history/page
 */
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'
import TimeclockHistoryClient from './client'

export const metadata = {
  title: 'My Timeclock - PT Portal',
  description: 'Review your clock-in and clock-out history',
}

export default async function TimeclockHistoryPage() {
  const { userId, employeeName, role, location } = await loadDashboardPageContext()

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <PageHeader
          employeeName={employeeName}
          role={role}
          location={location}
          userId={userId}
          showBack={true}
        />

        <main className="max-w-5xl mx-auto p-6 w-full flex-grow space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 mb-2">My punches</h1>
            <p className="text-slate-500">Review the attendance evidence used by My Performance.</p>
          </div>
          <TimeclockHistoryClient />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
