import { NextRequest, NextResponse } from 'next/server'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const supabase = await getRouteSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('user_security_preferences')
      .select('backup_codes_downloaded_at,backup_reminder_dismissed_until')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      preferences: {
        backup_codes_downloaded_at: data?.backup_codes_downloaded_at ?? null,
        backup_reminder_dismissed_until: data?.backup_reminder_dismissed_until ?? null,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await getRouteSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as {
      backup_codes_downloaded?: boolean
      backup_reminder_dismissed_until?: string | null
    }

    const payload: Record<string, unknown> = {
      user_id: user.id,
    }

    if (body.backup_codes_downloaded !== undefined) {
      payload.backup_codes_downloaded_at = body.backup_codes_downloaded ? new Date().toISOString() : null
    }
    if (body.backup_reminder_dismissed_until !== undefined) {
      payload.backup_reminder_dismissed_until = body.backup_reminder_dismissed_until
    }

    const { data, error } = await supabase
      .from('user_security_preferences')
      .upsert(payload, { onConflict: 'user_id' })
      .select('backup_codes_downloaded_at,backup_reminder_dismissed_until')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      preferences: data,
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
