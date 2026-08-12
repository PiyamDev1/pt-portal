/**
 * Shared Supabase Client Singleton
 * Reuses connection across all requests for better performance
 *
 * @module lib/supabaseClient
 */

import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import type { LegacyDatabase } from '@/types/supabase'

let supabaseClient: SupabaseClient<LegacyDatabase> | null = null

/**
 * Get or create the Supabase client singleton
 * Uses service role key for server-side operations (full access)
 */
export function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient<LegacyDatabase>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return supabaseClient
}

/**
 * Exact generated-schema view of the shared client.
 *
 * Existing callers use `getSupabaseClient` while their payloads are migrated.
 * New server code should prefer this accessor so table rows and mutations are
 * checked against the linked Supabase schema.
 */
export function getStrictSupabaseClient(): SupabaseClient<Database> {
  return getSupabaseClient() as unknown as SupabaseClient<Database>
}

/**
 * Get Supabase client with anon key (client-side auth)
 * Used in server components that need to respect RLS
 */
export function getSupabaseAnonClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
