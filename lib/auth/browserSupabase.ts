'use client'

import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

let browserClient: SupabaseClient<Database> | null = null

/**
 * Return the portal's cookie-backed browser client.
 *
 * Passkeys are an experimental Supabase Auth capability and must be enabled on
 * every client that calls the native passkey APIs. All browser auth flows use
 * this singleton so sessions, listeners, MFA, OAuth, and WebAuthn ceremonies
 * cannot drift across separately configured client instances.
 */
export function getBrowserSupabaseClient(): SupabaseClient<Database> {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          experimental: { passkey: true },
        },
        isSingleton: true,
      },
    )
  }

  return browserClient
}
