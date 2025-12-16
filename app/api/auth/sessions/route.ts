import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

// Helper to get admin client (bypasses RLS)
const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

export async function GET(request: Request) {
  try {
    const cookieStore = cookies()
    
    // 1. Create standard Auth Helper client to verify the user
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {}
        }
      }
    )
    
    // 2. Check Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 3. Fetch Sessions using Admin client (accessing 'auth' schema requires service role)
    const supabaseAdmin = getSupabaseAdmin()
    const { data: sessions, error: dbError } = await supabaseAdmin
      .schema('auth')
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (dbError) throw dbError

    // 4. Identify current session
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    
    // Helper to extract session ID from JWT
    let currentSessionId = null
    if (currentSession?.access_token) {
      try {
        const payload = JSON.parse(Buffer.from(currentSession.access_token.split('.')[1], 'base64').toString())
        currentSessionId = payload.session_id
      } catch {}
    }

    const formattedSessions = sessions.map((s: any) => ({
      id: s.id,
      created_at: s.created_at,
      last_active: s.updated_at || s.created_at,
      ip: s.ip || 'Unknown IP',
      user_agent: s.user_agent,
      is_current: s.id === currentSessionId
    }))

    return NextResponse.json({ sessions: formattedSessions })

  } catch (error: any) {
    console.error('Session API Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {}
        }
      }
    )
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()
    const { id, type } = await request.json()

    if (type === 'all') {
      await supabaseAdmin.auth.admin.signOut(user.id)
      return NextResponse.json({ message: 'All devices signed out' })
    } else if (type === 'single' && id) {
      await supabaseAdmin.schema('auth').from('sessions').delete().eq('id', id).eq('user_id', user.id)
      return NextResponse.json({ message: 'Session revoked' })
    }
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
