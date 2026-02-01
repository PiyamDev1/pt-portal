import PageHeader from '@/app/components/PageHeader.client'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Commissions - PT Portal',
  description: 'Track earnings and sales commissions',
}

export default async function CommissionsPage() {
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

  const location = { name: 'Headquarters', branch_code: 'HQ' }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <PageHeader employeeName={session?.user?.user_metadata?.full_name} role="Employee" location={location} userId={session?.user?.id} />
      
      <main className="container mx-auto px-4 py-8">
        <div className="bg-slate-800 rounded-lg p-8 text-center">
          <p className="text-2xl font-bold mb-2">📊 Commissions Dashboard</p>
          <p className="text-slate-300">This feature is coming soon. Check back later for commission tracking and analytics.</p>
        </div>
      </main>
    </div>
  )
}
