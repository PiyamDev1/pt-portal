/**
 * British Passport Applications Page
 *
 * British passport application management:
 * - View British passport application status
 * - Submit passport application forms and documents
 * - Track passport printing and delivery from UK Home Office
 * - Manage passport renewals and emergency replacements
 * - Download passport documents when issued
 *
 * Server component that:
 * - Authenticates user access to GB passport records
 * - Loads British passport applications
 * - Integrates with UK Home Office status tracking
 *
 * @module app/dashboard/applications/passports-gb/page
 */
import PageHeader from '@/app/components/PageHeader.client'
import GbPassportsClient from './client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { loadDashboardPageContext } from '@/lib/dashboard/pageContext'

export default async function GbPassportsPage() {
  const { supabase, userId, employeeName, role, location } = await loadDashboardPageContext()

  // Fetch Data
  const { data: passports } = await supabase
    .from('british_passport_applications')
    .select(
      `
      *,
      applicants (id, first_name, last_name, date_of_birth, phone_number),
      applications (id, tracking_number)
    `,
    )
    .order('created_at', { ascending: false })

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
          <GbPassportsClient initialData={passports || []} currentUserId={userId} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
