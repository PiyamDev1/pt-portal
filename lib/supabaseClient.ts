/**
 * Shared Supabase Client Singleton
 * Reuses connection across all requests for better performance
 *
 * @module lib/supabaseClient
 */

import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

let supabaseClient: SupabaseClient<any, any, any> | null = null

/**
 * Get or create the Supabase client singleton
 * Uses service role key for server-side operations (full access)
 */
export function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return supabaseClient
}

/**
 * Get Supabase client with anon key (client-side auth)
 * Used in server components that need to respect RLS
 */
export function getSupabaseAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
