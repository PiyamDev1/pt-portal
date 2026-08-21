import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import PageHeader from '@/app/components/PageHeader.client'
import { getPackagePageHeader } from '../packagePageHeader'
import PackageGroupsClient from './PackageGroupsClient'

export const metadata = {
  title: 'Group Packages - PT Portal',
  description: 'Manage linked travel package groups and their shared customer links',
}

export default async function PackageGroupsPage() {
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
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50 text-slate-950">
        <PageHeader
          employeeName={header.employeeName}
          role={header.role}
          location={header.location}
          userId={session.user.id}
        />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <PackageGroupsClient currentUserRole={header.role} />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
