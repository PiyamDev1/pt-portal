import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Create a Supabase Admin client to access the 'auth' schema directly
// Only initialize if keys are available
const supabaseAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
  : null;

export async function GET(request: Request) {
  try {
    // 1. Verify the User (Security Check)
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
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Query the 'auth.sessions' table directly using Admin client
    // Note: We access the 'auth' schema which is normally hidden
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 });
    }

    const { data: sessions, error: dbError } = await supabaseAdmin
      .schema('auth')
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (dbError) throw dbError;

    // 3. Mark the current session
    // We get the current session ID from the user's cookie via the standard client
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    const currentSessionId = currentSession?.access_token 
        ? JSON.parse(atob(currentSession.access_token.split('.')[1])).session_id 
        : null;

    // 4. Format the data for the frontend
    const formattedSessions = sessions.map((s: any) => ({
      id: s.id,
      created_at: s.created_at,
      last_active: s.updated_at || s.created_at, // timestamp of last use
      ip: s.ip || 'Unknown IP', // Supabase sometimes stores IP here
      user_agent: s.user_agent, // Browser/Device string
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
    // 1. Verify User
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
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, type } = await request.json(); // id = session_id, type = 'single' | 'all'

    if (type === 'all') {
      // Sign out everywhere (invalidates all refresh tokens)
      if (!supabaseAdmin) {
        return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 });
      }

      const { error } = await supabaseAdmin.auth.admin.signOut(user.id);
      if (error) throw error;
      return NextResponse.json({ message: 'All devices signed out' });
    } 
    else if (type === 'single' && id) {
      // Delete specific session row from auth.sessions
      if (!supabaseAdmin) {
        return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 });
      }

      const { error } = await supabaseAdmin
        .schema('auth')
        .from('sessions')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id); // Extra safety check
      
      if (error) throw error;
      return NextResponse.json({ message: 'Session revoked' });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
