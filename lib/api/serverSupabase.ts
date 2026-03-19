/**
 * Server-Side Supabase Client Factory
 * Creates authenticated Supabase clients in server components and API routes
 * Uses cookies for session management
 * 
 * @module lib/api/serverSupabase
 */

import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

/**
 * Create a Supabase client for use in API routes
 * Uses the current user's session from cookies
 * @returns Promise resolving to authenticated Supabase client
 */
export async function getRouteSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    },
  )
}
