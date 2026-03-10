/**
 * Pakistani Passport Documents Page
 * Per-application document management interface
 *
 * Route: /dashboard/applications/passports/documents/[applicationId]
 */

import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { DocumentHub } from '@/app/dashboard/applications/nadra/components/DocumentHub'
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
    }
  )

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
    .select(`
      id,
      tracking_number,
      applicants:applicants!applications_applicant_id_fkey(
        first_name,
        last_name,
        citizen_number
      )
    `)
    .eq('id', applicationId)
    .single()

  if (!application) {
    notFound()
  }

  const location = Array.isArray(employee?.locations)
    ? employee.locations[0]
    : employee?.locations
  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles

  const applicant = Array.isArray(application.applicants)
    ? application.applicants[0]
    : application.applicants

  const applicantName = applicant
    ? `${applicant.first_name} ${applicant.last_name}`
    : 'Applicant'

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <PageHeader
          employeeName={employee?.full_name}
          role={role?.name}
          location={location}
          userId={session.user.id}
          showBack={true}
        />

        <main className="flex-1 max-w-7xl mx-auto p-6 w-full">
          <div className="mb-6">
            <a
              href="/dashboard/applications/passports"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium mb-4"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Pakistani Passports
            </a>
          </div>

          <div className="min-h-[calc(100vh-280px)] rounded-lg">
            <DocumentHub
              familyHeadId={applicationId}
              familyHeadName={applicantName}
              customSubtitle={`Manage documents for ${applicantName}`}
              showStatus={true}
            />
          </div>
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
