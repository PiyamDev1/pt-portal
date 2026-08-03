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
        has_documents,
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

  const serviceSupabase = getServiceSupabaseClient()

  const { data: drafts } = await serviceSupabase
    .from('pakistani_passport_drafts')
    .select(
      `
        id,
        draft_id,
        applicant_id,
        applicant_name,
        applicant_cnic,
        applicant_email,
        applicant_phone,
        family_head_email,
        application_type,
        category,
        page_count,
        speed,
        old_passport_number,
        fingerprints_completed,
        requested_page_number,
        requested_page_provided,
        notes,
        status,
        payment_status,
        payment_amount,
        payment_note,
        payment_refunded_at,
        assigned_employee_id,
        created_by,
        updated_by,
        sent_to_external_at,
        converted_application_id,
        converted_by,
        converted_at,
        official_tracking_number,
        cancelled_at,
        cancelled_by,
        cancellation_reason,
        created_at,
        updated_at,
        assigned_employee:employees!pakistani_passport_drafts_assigned_employee_id_fkey(id, full_name),
        created_by_employee:employees!pakistani_passport_drafts_created_by_fkey(id, full_name)
      `,
    )
    .not('status', 'in', '("Converted","Cancelled")')
    .order('updated_at', { ascending: false })
    .limit(1000)

  const { data: employees } = await serviceSupabase
    .from('employees')
    .select('id, full_name')
    .order('full_name', { ascending: true })

  // Build documentCounts from the has_documents marker stored on each application.
  // No second query needed — the flag is maintained by the upload/delete APIs.
  const documentCounts: Record<string, number> = {}
  for (const app of applications || []) {
    if ((app as { has_documents?: boolean }).has_documents) {
      documentCounts[app.id] = 1
    }
  }

  const draftDocumentCounts: Record<string, number> = {}
  const draftIds = (drafts || []).map((draft) => draft.draft_id).filter(Boolean)
  if (draftIds.length > 0) {
    const { data: draftDocuments } = await serviceSupabase
      .from('documents')
      .select('family_head_id')
      .in('family_head_id', draftIds)
      .eq('deleted', false)
      .neq('category', 'zip-archive')

    for (const document of draftDocuments || []) {
      const key = document.family_head_id
      if (key) {
        draftDocumentCounts[key] = (draftDocumentCounts[key] || 0) + 1
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
          <div className="mb-8 flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-bold text-slate-800">Pakistani Passports</h1>
              <p className="text-slate-500">
                Manage renewals, new arrivals, and custody of old passports.
              </p>
            </div>
          </div>
          <PakPassportClient
            initialApplications={applications || []}
            initialDrafts={drafts || []}
            currentUserId={session.user.id}
            documentCounts={documentCounts}
            draftDocumentCounts={draftDocumentCounts}
            employeeOptions={employees || []}
          />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
