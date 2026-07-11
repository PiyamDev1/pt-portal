import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import PageHeader from '@/app/components/PageHeader.client'
import PackagesClient from '../../PackagesClient'

export const metadata = {
  title: 'New Package Quote - PT Portal',
  description: 'Create a holidays, ziyarat, or umrah package quote',
}

export default async function NewPackageQuotationPage() {
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

  const location = { name: 'Packages Desk', branch_code: 'PKG' }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <PageHeader
        employeeName={session.user.user_metadata?.full_name}
        role="Employee"
        location={location}
        userId={session.user.id}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <PackagesClient currentUserId={session.user.id} />
      </main>
    </div>
  )
}
