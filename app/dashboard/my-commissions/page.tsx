import { redirect } from 'next/navigation'
import { requireStaffSession } from '@/lib/auth/staffSession'

export const metadata = {
  title: 'My performance - PT Portal',
  description: 'Review your recorded work, attendance and commission earnings',
}

export const dynamic = 'force-dynamic'

/** Preserve staff bookmarks while My commissions becomes part of My performance. */
export default async function LegacyMyCommissionsRedirect() {
  const access = await requireStaffSession()
  if (!access.authorized) {
    redirect(access.response.status === 401 ? '/login' : '/dashboard')
  }
  redirect('/dashboard/my-performance?view=earnings')
}
