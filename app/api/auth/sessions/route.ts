import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {}
        }
      }
    );
    
    // 1. Verify User
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 2. Call the RPC function we created (Securely fetches own sessions)
    const { data: sessions, error: dbError } = await supabase.rpc('get_my_sessions');

    if (dbError) throw dbError;

    // 3. Identify current session ID from the JWT
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    let currentSessionId = null;
    if (currentSession?.access_token) {
        try {
            // Decode JWT payload to get session_id
            const payload = JSON.parse(Buffer.from(currentSession.access_token.split('.')[1], 'base64').toString());
            currentSessionId = payload.session_id;
        } catch {}
    }

    // 4. Format for frontend
    const formattedSessions = (sessions || []).map((s: any) => ({
      id: s.id,
      created_at: s.created_at,
      last_active: s.updated_at || s.created_at,
      ip: s.ip || 'Unknown IP',
      user_agent: s.user_agent,
      is_current: s.id === currentSessionId
    }));

    return NextResponse.json({ sessions: formattedSessions });
  } catch (error: any) {
    console.error('Session Fetch Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
    );
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, type } = await request.json();

    if (type === 'all') {
      // For "Sign out all", we need the Admin client
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      await supabaseAdmin.auth.admin.signOut(user.id);
      return NextResponse.json({ message: 'All devices signed out' });
    } 
    else if (type === 'single' && id) {
      // Use the RPC function to revoke a specific session
      const { error } = await supabase.rpc('revoke_my_session', { session_id: id });
      if (error) throw error;
      return NextResponse.json({ message: 'Session revoked' });
    }
    
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
