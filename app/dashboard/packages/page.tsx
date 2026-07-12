import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import PageHeader from '@/app/components/PageHeader.client'
import PackagesDashboardClient from './PackagesDashboardClient'
import { getPackagePageHeader } from './packagePageHeader'

export const metadata = {
  title: 'Packages - PT Portal',
  description: 'Create and share holidays, ziyarat, and umrah package quotes',
}

export default async function PackagesPage() {
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

  const header = await getPackagePageHeader(
    supabase,
    session.user.id,
    session.user.user_metadata?.full_name,
  )

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <PageHeader
        employeeName={header.employeeName}
        role={header.role}
        location={header.location}
        userId={session.user.id}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <PackagesDashboardClient currentUserId={session.user.id} currentUserRole={header.role} />
      </main>
    </div>
  )
}
