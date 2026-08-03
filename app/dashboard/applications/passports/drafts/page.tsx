/**
 * Pakistani Passport Drafts Page
 *
 * Dedicated workspace for pre-tracking Pakistani passport draft applications.
 */

import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata as NextMetadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import DraftModePanel from '../components/DraftModePanel'
import type { Metadata } from '../components/types'

export const metadata: NextMetadata = {
  title: 'Pakistani Passport Drafts',
  description: 'Manage pre-tracking Pakistani passport draft applications',
}

const FALLBACK_METADATA: Metadata = {
  categories: ['Adult 10 Year', 'Adult 5 Year', 'Child 5 Year'],
  speeds: ['Normal', 'Executive'],
  applicationTypes: ['First Time', 'Renewal', 'Modification', 'Lost'],
  pageCounts: ['34 pages', '54 pages', '72 pages', '100 pages'],
}

function namesFromRows(
  rows: Array<Record<string, string | null>> | null | undefined,
  field: string,
  fallback: string[],
) {
  const values = (rows || [])
    .map((row) => row[field])
    .filter((value): value is string => Boolean(value))
  return values.length > 0 ? values : fallback
}

function withLost(applicationTypes: string[]) {
  return applicationTypes.includes('Lost') ? applicationTypes : [...applicationTypes, 'Lost']
}

export default async function PakPassportDraftsPage() {
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

  const serviceSupabase = getServiceSupabaseClient()

  const [drafts, employees, categories, speeds, applicationTypes, pages] = await Promise.all([
    serviceSupabase
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
      .limit(1000),
    serviceSupabase.from('employees').select('id, full_name').order('full_name', {
      ascending: true,
    }),
    serviceSupabase.from('pk_passport_categories').select('name').eq('is_active', true).order('name'),
    serviceSupabase.from('pk_passport_speeds').select('name').eq('is_active', true).order('name'),
    serviceSupabase
      .from('pk_passport_application_types')
      .select('name')
      .eq('is_active', true)
      .order('name'),
    serviceSupabase
      .from('pk_passport_pages')
      .select('option_label')
      .eq('is_active', true)
      .order('option_label'),
  ])

  const draftDocumentCounts: Record<string, number> = {}
  const draftIds = (drafts.data || []).map((draft) => draft.draft_id).filter(Boolean)
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

  const passportMetadata: Metadata = {
    categories: namesFromRows(categories.data, 'name', FALLBACK_METADATA.categories),
    speeds: namesFromRows(speeds.data, 'name', FALLBACK_METADATA.speeds),
    applicationTypes: withLost(
      namesFromRows(applicationTypes.data, 'name', FALLBACK_METADATA.applicationTypes),
    ),
    pageCounts: namesFromRows(pages.data, 'option_label', FALLBACK_METADATA.pageCounts),
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
        <main className="mx-auto max-w-7xl p-6">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-800">Pakistani Passport Drafts</h1>
              <p className="text-slate-500">
                Prepare applications and documents before the official tracking number is issued.
              </p>
            </div>
            <Link
              href="/dashboard/applications/passports"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-black"
            >
              <ArrowLeft className="h-4 w-4" />
              Live Mode
            </Link>
          </div>
          <DraftModePanel
            drafts={drafts.data || []}
            documentCounts={draftDocumentCounts}
            employeeOptions={employees.data || []}
            metadata={passportMetadata}
            currentUserId={session.user.id}
          />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
