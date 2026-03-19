import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { apiError, apiOk } from '@/lib/api/http'

export async function createLmsSupabaseServerClient() {
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

export function toDayStartIso(dateInput?: string | null) {
  return dateInput ? new Date(`${dateInput}T00:00:00Z`).toISOString() : new Date().toISOString()
}

export function jsonOk(body: Record<string, unknown>) {
  return apiOk(body)
}

export function jsonBadRequest(message: string, status = 400) {
  return apiError(message, status)
}

export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}
