import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Helper to get admin client (created on demand to avoid build-time issues)
const getSupabaseAdmin = () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase credentials')
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { 
        global: {
          headers: {
            cookie: cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ')
          }
        }
      }
    );
    
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
    
    // Helper to decode JWT to find session_id
    const currentSessionId = currentSession?.access_token 
        ? JSON.parse(atob(currentSession.access_token.split('.')[1])).session_id 
        : null;

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
    const cookieStore = await cookies();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { 
        global: {
          headers: {
            cookie: cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ')
          }
        }
      }
    );
    
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
