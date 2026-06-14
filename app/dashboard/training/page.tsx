/**
 * Training and Certification Page.
 *
 * Server component that protects the module behind IMS auth and passes the
 * current staff identity into the shared dashboard chrome.
 */

import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'

const TrainingClient = dynamic(() => import('./client'), {
  loading: () => (
    <div className="h-96 animate-pulse rounded-[2rem] border border-slate-200 bg-white" />
  ),
})

export const metadata = {
  title: 'Training & Certification - PT Portal',
  description: 'Internal staff training, certification, and compliance tracking',
}

export default async function TrainingPage() {
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

  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles
  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50">
        <PageHeader
          employeeName={employee?.full_name}
          role={role?.name || 'Employee'}
          location={location}
          userId={session.user.id}
          showBack={true}
        />
        <main className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 md:py-8">
          <TrainingClient />
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
