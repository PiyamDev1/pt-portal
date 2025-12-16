import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Helper to get admin client (created on demand to avoid build-time issues)
const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase credentials')
  }
  return createClient(
    supabaseUrl,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const decodeSessionId = (accessToken?: string | null) => {
  if (!accessToken) return null
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1] || '', 'base64').toString())
    return payload.session_id || null
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Check Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Get admin client
    const supabaseAdmin = getSupabaseAdmin();

    // Fetch Sessions directly from auth tables
    const { data: sessions, error: dbError } = await supabaseAdmin
      .schema('auth')
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (dbError) throw dbError;

    // Identify current session
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    const currentSessionId = decodeSessionId(currentSession?.access_token)

    const formattedSessions = sessions.map((s: any) => ({
      id: s.id,
      created_at: s.created_at,
      last_active: s.updated_at || s.created_at,
      ip: s.ip || 'Unknown IP', // Supabase stores IP here
      user_agent: s.user_agent,
      is_current: s.id === currentSessionId
    }));

    return NextResponse.json({ sessions: formattedSessions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Get admin client
    const supabaseAdmin = getSupabaseAdmin();

    const { id, type } = await request.json();

    if (type === 'all') {
      // Revoke all sessions
      await supabaseAdmin.auth.admin.signOut(user.id);
      return NextResponse.json({ message: 'All devices signed out' });
    } else if (type === 'single' && id) {
      // Delete specific session
      await supabaseAdmin.schema('auth').from('sessions').delete().eq('id', id).eq('user_id', user.id);
      return NextResponse.json({ message: 'Session revoked' });
    }
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
