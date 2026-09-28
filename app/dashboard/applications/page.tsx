/**
 * Applications Hub Page
 *
 * Loads the shared read-only Applications summary through the authenticated
 * user's Supabase client so source-module row-level security stays in force.
 */
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { loadApplicationSummary } from '@/lib/applications/summary.server'
import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'
import ApplicationsClient from './client'

export default async function ApplicationsHubPage() {
  const { supabase, userId, employeeName, role, location } = await loadDashboardPageContext()

  const summary = await loadApplicationSummary(supabase)

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
        <main className="max-w-7xl mx-auto p-6 w-full flex-grow">
          <ApplicationsClient
            summary={summary}
            roleName={role || ''}
            locationName={location?.name || ''}
          />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
