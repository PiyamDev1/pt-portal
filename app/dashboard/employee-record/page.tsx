import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import EmployeeRecordClient from './client'
import type { BranchOption, EmployeeDocument, EmployeeSummary } from './client'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Employee Record - PT Portal',
  description: 'Employee dashboard for HR setup, payslips, and documents',
}

export default async function EmployeeRecordPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {}
        },
      },
    },
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const [{ data: employee }, { data: profile }, { count: attendanceEventsLast7Days }] = await Promise.all([
    supabase
      .from('employees')
      .select('id, full_name, email, roles(name), locations(name, branch_code)')
      .eq('id', session.user.id)
      .single(),
    supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle(),
    supabase
      .from('timeclock_events')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', session.user.id)
      .gte('scanned_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
  ])

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations
  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles
  const roleName = role?.name || profile?.role || 'Employee'
  const isHrView = ['Admin', 'Master Admin', 'Maintenance Admin'].includes(roleName)

  const { data: ownDocuments, error: ownDocumentsError } = await supabase
    .from('employee_documents')
    .select('id, employee_id, document_type, file_name, file_size, file_type, uploaded_at')
    .eq('employee_id', session.user.id)
    .eq('deleted', false)
    .order('uploaded_at', { ascending: false })

  const documentsSupported = !ownDocumentsError
  const initialDocuments: EmployeeDocument[] = documentsSupported
    ? (ownDocuments || []).map((row) => ({
        id: row.id,
        employeeId: row.employee_id,
        documentType: row.document_type,
        fileName: row.file_name,
        fileSize: row.file_size,
        fileType: row.file_type,
        uploadedAt: row.uploaded_at,
      }))
    : []

  let initialEmployees: EmployeeSummary[] = []
  let initialBranches: BranchOption[] = []

  if (isHrView) {
    const [{ data: employeeRows }, { data: locationRows }] = await Promise.all([
      supabase
        .from('employees')
        .select('id, full_name, email, is_active, pay_basis, hourly_source, hourly_rate, annual_salary, working_hours_per_week, salary_currency, payroll_effective_from, employment_type, employment_start_date, employment_end_date, work_start_time, work_end_time, national_insurance_number, payroll_notes, work_schedule, statutory_break_paid, company_lunch_break_minutes, company_lunch_break_paid, locations(id, name, branch_code)')
        .order('full_name', { ascending: true }),
      supabase
        .from('locations')
        .select('id, name, branch_code')
        .order('name', { ascending: true }),
    ])

    initialBranches = (locationRows || []).map((row) => ({
      id: row.id as string,
      name: (row.name as string) || '',
      branch_code: (row.branch_code as string | null) ?? null,
    }))

    initialEmployees = (employeeRows || []).map((row) => {
      const loc = Array.isArray(row.locations) ? row.locations[0] : (row.locations as { id?: string; name?: string; branch_code?: string | null } | null)
      return {
        id: row.id,
        full_name: row.full_name,
        email: row.email,
        is_active: row.is_active,
        pay_basis: row.pay_basis,
        hourly_source: row.hourly_source,
        hourly_rate: row.hourly_rate,
        annual_salary: row.annual_salary,
        working_hours_per_week: row.working_hours_per_week,
        salary_currency: row.salary_currency,
        payroll_effective_from: row.payroll_effective_from,
        employment_type: row.employment_type,
        employment_start_date: row.employment_start_date,
        employment_end_date: row.employment_end_date,
        work_start_time: row.work_start_time,
        work_end_time: row.work_end_time,
        national_insurance_number: row.national_insurance_number,
        payroll_notes: row.payroll_notes,
        work_schedule: row.work_schedule,
        statutory_break_paid: row.statutory_break_paid,
        company_lunch_break_minutes: row.company_lunch_break_minutes,
        company_lunch_break_paid: row.company_lunch_break_paid,
        location_id: loc?.id ?? null,
        location_name: loc?.name ?? null,
        branch_code: loc?.branch_code ?? null,
      } as EmployeeSummary
    })
  } else {
    initialEmployees =
      employee?.id
        ? [
            {
              id: employee.id,
              full_name: employee.full_name,
              email: employee.email,
            },
          ]
        : []
  }

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50">
        <PageHeader
          employeeName={employee?.full_name || session?.user?.user_metadata?.full_name}
          role={roleName}
          location={location}
          userId={session.user.id}
          showBack={true}
        />

        <main className="max-w-7xl mx-auto p-6 space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Employee Record</h1>
            <p className="text-slate-500 mt-1">
              {isHrView
                ? 'HR workspace for pay setup, working hours, and document management.'
                : 'Your workspace for payslips, documents, and leave updates.'}
            </p>
          </div>

          <EmployeeRecordClient
            currentUserId={session.user.id}
            roleName={roleName}
            isHrView={isHrView}
            quickStats={{
              attendanceEventsLast7Days: Number(attendanceEventsLast7Days || 0),
              myDocumentCount: initialDocuments.length,
            }}
            initialEmployees={initialEmployees}
            initialBranches={initialBranches}
            initialDocuments={initialDocuments}
            documentsSupported={documentsSupported}
          />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
