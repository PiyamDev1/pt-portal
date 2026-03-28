import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

type NotesContext = 'nadra' | 'pk-passport'

const parseContext = (value: unknown): NotesContext | null => {
  if (value === 'nadra' || value === 'pk-passport') return value
  return null
}

const getSessionUserId = async () => {
  const cookieStore = await cookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll() {},
    },
  })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  return session?.user?.id || null
}

const getAdminClient = () => createClient(supabaseUrl, serviceKey)

export async function GET(request: Request) {
  try {
    if (!supabaseUrl || !supabaseAnonKey || !serviceKey) {
      return apiError('Supabase not configured', 500)
    }

    const userId = await getSessionUserId()
    if (!userId) {
      return apiError('Unauthorized', 401)
    }

    const { searchParams } = new URL(request.url)
    const context = parseContext(searchParams.get('context'))
    if (!context) {
      return apiError('Invalid context', 400)
    }

    const rawRecordIds = (searchParams.get('recordIds') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)

    if (rawRecordIds.length === 0) {
      return apiOk({ readSignatures: {} })
    }

    const recordIds = Array.from(new Set(rawRecordIds)).slice(0, 500)

    const adminSupabase = getAdminClient()
    const { data, error } = await adminSupabase
      .from('application_note_reads')
      .select('record_id, note_signature')
      .eq('context', context)
      .eq('user_id', userId)
      .in('record_id', recordIds)

    if (error) {
      return apiError(toErrorMessage(error, 'Failed to load note read status'), 500)
    }

    const readSignatures: Record<string, string> = {}
    ;(data || []).forEach((row: { record_id: string; note_signature: string }) => {
      if (!row?.record_id || typeof row.note_signature !== 'string') return
      readSignatures[row.record_id] = row.note_signature
    })

    return apiOk({ readSignatures })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Unexpected error'), 500)
  }
}

export async function POST(request: Request) {
  try {
    if (!supabaseUrl || !supabaseAnonKey || !serviceKey) {
      return apiError('Supabase not configured', 500)
    }

    const userId = await getSessionUserId()
    if (!userId) {
      return apiError('Unauthorized', 401)
    }

    const body = await request.json().catch(() => ({}))
    const context = parseContext(body?.context)
    const recordId = String(body?.recordId || '').trim()
    const noteSignature = String(body?.noteSignature || '').trim()

    if (!context) {
      return apiError('Invalid context', 400)
    }
    if (!recordId) {
      return apiError('recordId is required', 400)
    }

    const adminSupabase = getAdminClient()

    if (!noteSignature) {
      const { error } = await adminSupabase
        .from('application_note_reads')
        .delete()
        .eq('context', context)
        .eq('record_id', recordId)
        .eq('user_id', userId)

      if (error) {
        return apiError(toErrorMessage(error, 'Failed to clear note read status'), 500)
      }

      return apiOk({ recordId, removed: true })
    }

    const { error } = await adminSupabase.from('application_note_reads').upsert(
      {
        context,
        record_id: recordId,
        user_id: userId,
        note_signature: noteSignature,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'context,record_id,user_id' },
    )

    if (error) {
      return apiError(toErrorMessage(error, 'Failed to save note read status'), 500)
    }

    return apiOk({ recordId, noteSignature })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Unexpected error'), 500)
  }
}

export async function DELETE(request: Request) {
  try {
    if (!supabaseUrl || !supabaseAnonKey || !serviceKey) {
      return apiError('Supabase not configured', 500)
    }

    const userId = await getSessionUserId()
    if (!userId) {
      return apiError('Unauthorized', 401)
    }

    const body = await request.json().catch(() => ({}))
    const context = parseContext(body?.context)
    const recordId = String(body?.recordId || '').trim()

    if (!context) {
      return apiError('Invalid context', 400)
    }
    if (!recordId) {
      return apiError('recordId is required', 400)
    }

    const adminSupabase = getAdminClient()
    const { error } = await adminSupabase
      .from('application_note_reads')
      .delete()
      .eq('context', context)
      .eq('record_id', recordId)
      .eq('user_id', userId)

    if (error) {
      return apiError(toErrorMessage(error, 'Failed to mark note as unread'), 500)
    }

    return apiOk({ recordId, unread: true })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Unexpected error'), 500)
  }
}
