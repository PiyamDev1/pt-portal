/**
 * Frappe HRMS transfer page.
 *
 * Lets the signed-in employee complete first-time HRMS details and create/link their
 * Frappe Employee record.
 */

import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { FrappeTransferClient } from './client'
import { getFrappeProvisioningCandidate } from '@/lib/integrations/frappe/provisioning'

export const metadata = {
  title: 'Employee Module - PT Portal',
  description: 'Complete your Frappe HRMS employee transfer',
}

export default async function FrappeTransferPage() {
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

  const { data: employee } = await supabase
    .from('employees')
    .select('full_name, roles(name), locations(name, branch_code)')
    .eq('id', session.user.id)
    .single()

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations
  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles
  const candidate = await getFrappeProvisioningCandidate(session.user.id)

  if (candidate?.frappe_employee_id) {
    const frappeBaseUrl = process.env.FRAPPE_BASE_URL?.replace(/\/$/, '')
    if (frappeBaseUrl) {
      redirect(`${frappeBaseUrl}/app`)
    }
  }

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

        <main className="mx-auto max-w-6xl p-6">
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-700">
              Frappe HRMS
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Employee Module</h1>
            <p className="mt-2 max-w-3xl text-slate-600">
              If this is your first time, complete your HRMS transit setup here. Once your profile
              is linked, this module opens Frappe HRMS directly.
            </p>
          </div>

          <FrappeTransferClient />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
