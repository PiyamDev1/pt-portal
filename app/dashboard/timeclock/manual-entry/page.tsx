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

  // Check if user is a manager (has reports) or has Master Admin role
  const { data: user } = await supabase
    .from('employees')
    .select('roles(name)')
    .eq('id', session.user.id)
    .single()

  const { count: reportCount } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('manager_id', session.user.id)

  const role = Array.isArray(user?.roles) ? user.roles[0] : user?.roles
  const isManager = role?.name === 'Master Admin' || (reportCount || 0) > 0
  
  if (!isManager) {
    redirect('/dashboard/timeclock')
  }

  return <ManualEntryClient userId={session.user.id} />
}
