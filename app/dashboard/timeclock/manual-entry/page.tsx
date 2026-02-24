import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import ManualEntryClient from './client'

export default async function ManualEntryPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    redirect('/login')
  }

  // Check if user is manager, admin, or superadmin
  const { data: user } = await supabase
    .from('employees')
    .select('role, manager_id')
    .eq('id', session.user.id)
    .single()

  const isManager = user?.role === 'manager' || user?.role === 'admin' || user?.role === 'superadmin'
  if (!isManager) {
    redirect('/dashboard/timeclock')
  }

  return <ManualEntryClient userId={session.user.id} />
}
