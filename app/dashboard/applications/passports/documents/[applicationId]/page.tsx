/**
 * Pakistani Passport Documents Page
 * Per-application document management interface
 *
 * Route: /dashboard/applications/passports/documents/[applicationId]
 */

import { redirect, notFound } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { ApplicationDocumentHub } from '@/app/dashboard/applications/components/ApplicationDocumentHub'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Document Management - Pakistani Passports',
  description: 'Manage documents for a Pakistani passport application',
}

interface PassportDocumentsPageProps {
  params: Promise<{
    applicationId: string
  }>
}

export default async function PassportDocumentsPage({ params }: PassportDocumentsPageProps) {
  const { applicationId } = await params

  const supabase = await getRouteSupabaseClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect('/login')
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('full_name, roles(name), locations(name, branch_code)')
    .eq('id', session.user.id)
    .single()

  const { data: application } = await supabase
    .from('applications')
    .select(
      `
      id,
      tracking_number,
      applicants:applicants!applications_applicant_id_fkey(
        first_name,
        last_name,
        citizen_number
      )
    `,
    )
    .eq('id', applicationId)
    .single()

  if (!application) {
    notFound()
  }

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations
  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles

  const applicant = Array.isArray(application.applicants)
    ? application.applicants[0]
    : application.applicants

  const applicantName = applicant ? `${applicant.first_name} ${applicant.last_name}` : 'Applicant'

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <PageHeader
          employeeName={employee?.full_name}
          role={role?.name}
          location={location}
          userId={session.user.id}
          showBack={true}
          backHref="/dashboard/applications/passports"
          backLabel="Pakistani Passports"
        />

        <main className="flex-1 max-w-7xl mx-auto p-6 w-full">
          <div className="min-h-[calc(100vh-280px)] rounded-lg">
            <ApplicationDocumentHub
              familyHeadId={applicationId}
              familyHeadName={applicantName}
              customSubtitle={`Manage documents for ${applicantName}`}
              showStatus={true}
              zipFileName={
                application.tracking_number || applicant?.citizen_number || applicationId
              }
            />
          </div>
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
