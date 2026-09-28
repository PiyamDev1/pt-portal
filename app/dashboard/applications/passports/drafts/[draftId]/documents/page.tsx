/**
 * Pakistani Passport Draft Documents Page
 * Per-draft document management before official tracking exists.
 */

import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { ApplicationDocumentHub } from '@/app/dashboard/applications/components/ApplicationDocumentHub'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'

export const metadata: Metadata = {
  title: 'Draft Document Management - Pakistani Passports',
  description: 'Manage documents for a Pakistani passport draft',
}

type PassportDraftDocumentsPageProps = {
  params: Promise<{
    draftId: string
  }>
}

export default async function PassportDraftDocumentsPage({
  params,
}: PassportDraftDocumentsPageProps) {
  const { draftId } = await params
  const decodedDraftId = decodeURIComponent(draftId || '').toUpperCase()

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

  const serviceSupabase = getServiceSupabaseClient()
  const { data: draft } = await serviceSupabase
    .from('pakistani_passport_drafts')
    .select('id, draft_id, applicant_name, applicant_cnic, status')
    .eq('draft_id', decodedDraftId)
    .single()

  if (!draft) {
    notFound()
  }

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations
  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <PageHeader
          employeeName={employee?.full_name}
          role={role?.name}
          location={location}
          userId={session.user.id}
          showBack={true}
          backHref="/dashboard/applications/passports/drafts"
          backLabel="Passport Drafts"
        />

        <main className="flex-1 max-w-7xl mx-auto p-6 w-full">
          <div className="min-h-[calc(100vh-280px)] rounded-lg">
            <ApplicationDocumentHub
              familyHeadId={draft.draft_id}
              familyHeadName={draft.applicant_name || 'Applicant'}
              customSubtitle={`Draft ${draft.draft_id} - ${draft.applicant_name || 'Applicant'}`}
              showStatus={true}
              zipFileName={draft.draft_id}
            />
          </div>
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
