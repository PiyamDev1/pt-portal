/**
 * Pakistani Passport Applications Page
 *
 * Pakistani passport application management:
 * - View passport application status and progress
 * - Submit application documents and forms
 * - Track passport printing and delivery
 * - Manage passport renewals and reissues
 * - Download passport e-documents when available
 *
 * Server component that:
 * - Authenticates user access to passport records
 * - Loads Pakistani passport applications
 * - Renders application status dashboard
 *
 * @module app/dashboard/applications/passports/page
 */
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import PageHeader from '@/app/components/PageHeader.client'
import PakPassportClient from './client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'

export default async function PakPassportPage() {
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
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('full_name, roles(name), locations(name, branch_code)')
    .eq('id', session.user.id)
    .single()

  // Fetch Hierarchy: App -> Applicant -> Passport Details
  const { data: applications } = await supabase
    .from('applications')
    .select(
      `
        id,
        tracking_number,
        applicants:applicants!applications_applicant_id_fkey(
          id, first_name, last_name, citizen_number, email, phone_number
        ),
        pakistani_passport_applications!inner (
          id,
          application_id,
          application_type,
          category,
          page_count,
          speed,
          status,
          requested_page_number,
          requested_page_provided,
          old_passport_number,
          new_passport_number,
          family_head_email,
          is_old_passport_returned,
          is_refunded,
          refunded_at,
          old_passport_returned_at,
          fingerprints_completed,
          notes,
          created_at
        )
      `,
    )
    .order('created_at', { ascending: false })
    .limit(10000)

  // Documents have historically been owned by an application UUID, its
  // applicant UUID, or the PKD identifier of a converted draft. Resolve those
  // server-side aliases so the badge reflects the files the workspace loads.
  const documentCounts: Record<string, number> = {}
  const applicationIds = (applications || []).map((application) => application.id)
  const scopeOwners = new Map<string, Set<string>>()
  const registerScope = (scopeId: string | null | undefined, applicationId: string) => {
    if (!scopeId) return
    const owners = scopeOwners.get(scopeId) || new Set<string>()
    owners.add(applicationId)
    scopeOwners.set(scopeId, owners)
  }

  for (const application of applications || []) {
    const applicant = Array.isArray(application.applicants)
      ? application.applicants[0]
      : application.applicants
    registerScope(application.id, application.id)
    registerScope(applicant?.id, application.id)
  }

  const serviceSupabase = getServiceSupabaseClient()
  for (let offset = 0; offset < applicationIds.length; offset += 500) {
    const { data: convertedDrafts, error: convertedDraftsError } = await serviceSupabase
      .from('pakistani_passport_drafts')
      .select('draft_id, converted_application_id')
      .in('converted_application_id', applicationIds.slice(offset, offset + 500))

    if (convertedDraftsError) throw convertedDraftsError

    for (const draft of convertedDrafts || []) {
      if (draft.converted_application_id) {
        registerScope(draft.draft_id, draft.converted_application_id)
      }
    }
  }

  const scopeIds = Array.from(scopeOwners.keys())
  for (let offset = 0; offset < scopeIds.length; offset += 500) {
    const { data: documents, error: documentsError } = await serviceSupabase
      .from('documents')
      .select('family_head_id')
      .in('family_head_id', scopeIds.slice(offset, offset + 500))
      .eq('deleted', false)
      .neq('category', 'zip-archive')

    if (documentsError) throw documentsError

    for (const document of documents || []) {
      for (const applicationId of scopeOwners.get(document.family_head_id) || []) {
        documentCounts[applicationId] = (documentCounts[applicationId] || 0) + 1
      }
    }
  }

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations
  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50">
        <PageHeader
          employeeName={employee?.full_name}
          role={role?.name}
          location={location}
          userId={session.user.id}
          showBack={true}
        />
        <main className="max-w-7xl mx-auto p-6">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-800">Pakistani Passports</h1>
              <p className="text-slate-500">
                Manage renewals, new arrivals, and custody of old passports.
              </p>
            </div>
            <Link
              href="/dashboard/applications/passports/drafts"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-green-200 bg-white px-5 py-2.5 text-sm font-black text-green-700 shadow-sm transition hover:bg-green-50"
            >
              <ClipboardList className="h-4 w-4" />
              Draft Mode
            </Link>
          </div>
          <PakPassportClient
            initialApplications={applications || []}
            currentUserId={session.user.id}
            documentCounts={documentCounts}
          />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
