import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/dist/client/components/navigation'

export default async function Dashboard() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // This can fail on the client side
          }
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) {
    redirect('/login')
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('full_name, roles(name), locations(name, branch_code)')
    .eq('id', session.user.id)
    .single()

  const location = Array.isArray(employee?.locations) 
    ? employee.locations[0] 
    : employee?.locations

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 bg-blue-900 rounded-full flex items-center justify-center text-white font-bold">PT</div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Piyam Travels IMS</h1>
            <p className="text-xs text-slate-500">{location?.name}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-slate-900">{employee?.full_name}</p>
        </div>
      </nav>

      <main className="p-8 max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <h2 className="text-3xl font-light text-slate-800 mb-4">Welcome back, {employee?.full_name}</h2>
          <p className="text-slate-500 max-w-md mx-auto">Select a module to begin.</p>
        </div>
      </main>
    </div>
  )
}
