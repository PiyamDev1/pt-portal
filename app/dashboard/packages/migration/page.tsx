import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import PageHeader from '@/app/components/PageHeader.client'
import { getPackagePageHeader } from '../packagePageHeader'
import PackageMigrationClient from './PackageMigrationClient'

export const metadata = { title: 'Package Migration - PT Portal' }

export default async function PackageMigrationPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
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
  if (header.role.trim().toLowerCase() !== 'super admin') {
    redirect('/dashboard/packages')
  }
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <PageHeader
        employeeName={header.employeeName}
        role={header.role}
        location={header.location}
        userId={session.user.id}
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <PackageMigrationClient />
      </main>
    </div>
  )
}
