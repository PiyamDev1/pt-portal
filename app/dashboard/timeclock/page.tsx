import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import TimeclockClient from './client'

export const metadata = {
  title: 'Timeclock - PT Portal',
  description: 'Clock in and out using QR codes',
}

export default async function TimeclockPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: any[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('full_name, role, roles(name), locations(name, branch_code)')
    .eq('id', session.user.id)
    .single()

  const { count: reportCount } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('manager_id', session.user.id)

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations
  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles
  const isManager = employee?.role === 'manager' || employee?.role === 'admin'
  const canSeeTeam = role?.name === 'Master Admin' || (reportCount || 0) > 0

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

        <main className="max-w-4xl mx-auto p-6 w-full flex-grow">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">Timeclock</h1>
          <p className="text-slate-500 mb-6">Scan the QR code on the device to clock in or out.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <a
              href="/dashboard/timeclock/history"
              className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:border-blue-300 transition"
            >
              <h2 className="text-lg font-semibold text-slate-800">My punches</h2>
              <p className="text-sm text-slate-500">Review your recent timeclock activity.</p>
            </a>
            {canSeeTeam && (
              <a
                href="/dashboard/timeclock/team"
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:border-blue-300 transition"
              >
                <h2 className="text-lg font-semibold text-slate-800">Team punches</h2>
                <p className="text-sm text-slate-500">See punches for your reporting team.</p>
              </a>
            )}
            {isManager && (
              <a
                href="/dashboard/timeclock/manual-entry"
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:border-green-300 transition"
              >
                <h2 className="text-lg font-semibold text-slate-800">Manual entry</h2>
                <p className="text-sm text-slate-500">Use QR code or 4-4 numeric code for punches.</p>
              </a>
            )}
          </div>
          <TimeclockClient />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
