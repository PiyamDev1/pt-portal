/**
 * Module: app/dashboard/logout-button.client.tsx
 * Dashboard module for logout-button.client.tsx.
 */

'use client'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/auth/browserSupabase'

export default function LogoutButton() {
  const router = useRouter()
  const supabase = getBrowserSupabaseClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition border border-red-100"
    >
      Sign Out
    </button>
  )
}
