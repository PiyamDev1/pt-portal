import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from './client-wrapper'

export default async function Dashboard() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: any[]) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('full_name, roles(name), locations(name, branch_code)')
    .eq('id', session.user.id)
    .single()

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations
  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50">
        <PageHeader employeeName={employee?.full_name} role={role?.name} location={location} userId={session.user.id} />

      <main className="p-8 max-w-7xl mx-auto space-y-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <h2 className="text-2xl font-light text-slate-800 mb-2">Welcome back, {employee?.full_name}</h2>
          <p className="text-slate-500">Select a module below to begin working.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Ticketing Module */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition cursor-pointer group">
            <div className="h-12 w-12 bg-blue-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-100">
              <span className="text-2xl">✈️</span>
            </div>
            <h3 className="font-bold text-slate-800">Ticketing</h3>
            <p className="text-sm text-slate-500 mt-1">Issue tickets and manage bookings.</p>
          </div>

          {/* Applications Module */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition cursor-pointer group">
            <div className="h-12 w-12 bg-purple-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-purple-100">
              <span className="text-2xl">🛂</span>
            </div>
            <h3 className="font-bold text-slate-800">Visas & Passports</h3>
            <p className="text-sm text-slate-500 mt-1">Manage Nadra and Passport applications.</p>
          </div>

          {/* Settings Module (Visible to ALL users now) */}
          <Link href="/dashboard/settings" className="block">
            <div className="bg-white p-6 rounded-xl border border-slate-200 hover:border-slate-400 hover:shadow-md transition cursor-pointer group h-full">
              <div className="h-12 w-12 bg-slate-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-slate-200">
                <span className="text-2xl">⚙️</span>
              </div>
              <h3 className="font-bold text-slate-800">Settings</h3>
              <p className="text-sm text-slate-500 mt-1">My account, security, and preferences.</p>
            </div>
          </Link>

        </div>
      </main>
      </div>
    </DashboardClientWrapper>
  )
}