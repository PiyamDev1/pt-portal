import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import ApplicationsClient from './client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'

type QueryResult<T> = {
  label: string
  data: T
}

type QueryWarning = {
  label: string
  message: string
}

async function runLabeledQuery<T>(
  label: string,
  query: PromiseLike<{ data: T | null; error: { message?: string } | null }>,
): Promise<QueryResult<T>> {
  const { data, error } = await query
  if (error) throw new Error(`${label}: ${error.message || 'query failed'}`)
  return { label, data: (data || []) as T }
}

function getSuccessfulData<T>(
  settled: PromiseSettledResult<QueryResult<T>>[],
  label: string,
  warnings: QueryWarning[],
): T {
  const hit = settled.find((entry) => entry.status === 'fulfilled' && entry.value.label === label)
  if (hit && hit.status === 'fulfilled') {
    return hit.value.data
  }

  const failed = settled.find(
    (entry) =>
      entry.status === 'rejected' &&
      String(entry.reason || '')
        .toLowerCase()
        .includes(label.toLowerCase()),
  )
  if (failed && failed.status === 'rejected') {
    warnings.push({ label, message: String(failed.reason) })
  } else {
    warnings.push({ label, message: `${label} unavailable` })
  }
  return [] as T
}

export default async function ApplicationsHubPage() {
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

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations
  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles

  // All-settled loading keeps the dashboard operational even when one module query fails.
  const settled = await Promise.allSettled([
    runLabeledQuery(
      'nadraStatuses',
      supabase.from('nadra_services').select('id, status, created_at'),
    ),
    runLabeledQuery(
      'pakStatuses',
      supabase.from('pakistani_passport_applications').select('id, status, created_at'),
    ),
    runLabeledQuery(
      'gbStatuses',
      supabase.from('british_passport_applications').select('id, status, created_at'),
    ),
    runLabeledQuery(
      'visaStatuses',
      supabase.from('visa_applications').select('id, status, created_at'),
    ),

    runLabeledQuery(
      'nadraRecent',
      supabase
        .from('applications')
        .select(
          `
      id, tracking_number, created_at,
      applicants:applicants!applications_applicant_id_fkey(first_name, last_name),
      nadra_services!inner(id, status, service_type, created_at, tracking_number)
    `,
        )
        .order('created_at', { ascending: false })
        .limit(16),
    ),

    runLabeledQuery(
      'pakRecent',
      supabase
        .from('applications')
        .select(
          `
      id, tracking_number, created_at,
      applicants:applicants!applications_applicant_id_fkey(first_name, last_name),
      pakistani_passport_applications!inner(id, status, application_type, created_at)
    `,
        )
        .order('created_at', { ascending: false })
        .limit(16),
    ),

    runLabeledQuery(
      'gbRecent',
      supabase
        .from('british_passport_applications')
        .select(
          `
      id, status, created_at,
      applicants(first_name, last_name),
      applications(id, tracking_number)
    `,
        )
        .order('created_at', { ascending: false })
        .limit(16),
    ),

    runLabeledQuery(
      'visaRecent',
      supabase
        .from('visa_applications')
        .select(
          `
      id, status, created_at,
      applicants(first_name, last_name),
      visa_countries(name)
    `,
        )
        .order('created_at', { ascending: false })
        .limit(16),
    ),

    runLabeledQuery(
      'nadraAttention',
      supabase
        .from('applications')
        .select(
          `
      id, tracking_number, created_at,
      applicants:applicants!applications_applicant_id_fkey(first_name, last_name),
      nadra_services!inner(id, status, service_type, created_at, tracking_number)
    `,
        )
        .eq('nadra_services.status', 'Pending Submission')
        .order('created_at', { ascending: false })
        .limit(8),
    ),

    runLabeledQuery(
      'pakAttention',
      supabase
        .from('applications')
        .select(
          `
      id, tracking_number, created_at,
      applicants:applicants!applications_applicant_id_fkey(first_name, last_name),
      pakistani_passport_applications!inner(id, status, application_type, created_at)
    `,
        )
        .eq('pakistani_passport_applications.status', 'Passport Arrived')
        .order('created_at', { ascending: false })
        .limit(8),
    ),

    runLabeledQuery(
      'gbAttention',
      supabase
        .from('british_passport_applications')
        .select(
          `
      id, status, created_at,
      applicants(first_name, last_name),
      applications(id, tracking_number)
    `,
        )
        .eq('status', 'Pending Submission')
        .order('created_at', { ascending: false })
        .limit(8),
    ),

    runLabeledQuery(
      'visaAttention',
      supabase
        .from('visa_applications')
        .select(
          `
      id, status, created_at,
      applicants(first_name, last_name),
      visa_countries(name)
    `,
        )
        .eq('status', 'Pending')
        .order('created_at', { ascending: false })
        .limit(8),
    ),
  ])

  const warnings: QueryWarning[] = []
  const nadraStatuses = getSuccessfulData<unknown[]>(settled, 'nadraStatuses', warnings)
  const pakStatuses = getSuccessfulData<unknown[]>(settled, 'pakStatuses', warnings)
  const gbStatuses = getSuccessfulData<unknown[]>(settled, 'gbStatuses', warnings)
  const visaStatuses = getSuccessfulData<unknown[]>(settled, 'visaStatuses', warnings)

  const nadraRecent = getSuccessfulData<unknown[]>(settled, 'nadraRecent', warnings)
  const pakRecent = getSuccessfulData<unknown[]>(settled, 'pakRecent', warnings)
  const gbRecent = getSuccessfulData<unknown[]>(settled, 'gbRecent', warnings)
  const visaRecent = getSuccessfulData<unknown[]>(settled, 'visaRecent', warnings)

  const nadraAttention = getSuccessfulData<unknown[]>(settled, 'nadraAttention', warnings)
  const pakAttention = getSuccessfulData<unknown[]>(settled, 'pakAttention', warnings)
  const gbAttention = getSuccessfulData<unknown[]>(settled, 'gbAttention', warnings)
  const visaAttention = getSuccessfulData<unknown[]>(settled, 'visaAttention', warnings)

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
        <main className="max-w-7xl mx-auto p-6 w-full flex-grow">
          <ApplicationsClient
            nadraStatuses={nadraStatuses || []}
            pakStatuses={pakStatuses || []}
            gbStatuses={gbStatuses || []}
            visaStatuses={visaStatuses || []}
            nadraRecent={nadraRecent || []}
            pakRecent={pakRecent || []}
            gbRecent={gbRecent || []}
            visaRecent={visaRecent || []}
            nadraAttention={nadraAttention || []}
            pakAttention={pakAttention || []}
            gbAttention={gbAttention || []}
            visaAttention={visaAttention || []}
            roleName={role?.name || ''}
            locationName={location?.name || ''}
            dataWarnings={warnings}
          />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
