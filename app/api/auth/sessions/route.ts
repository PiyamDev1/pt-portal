import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
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

    // 2. Get current session ID from the JWT
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    let currentSessionId = null;
    if (currentSession?.access_token) {
        try {
            const payload = JSON.parse(Buffer.from(currentSession.access_token.split('.')[1], 'base64').toString());
            currentSessionId = payload.session_id;
        } catch {}
    }

    // 3. Use admin client to get all sessions for the user
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get all sessions from auth.sessions table
    const { data: allSessions, error: dbError } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(20); // Get more to allow for deduplication

    if (dbError) {
      console.error('Session fetch error:', dbError);
      // Fallback to RPC if direct table access fails
      const { data: rpcSessions, error: rpcError } = await supabase.rpc('get_my_sessions');
      if (rpcError) throw rpcError;
      
      const formattedSessions = (rpcSessions || []).map((s: any) => ({
        id: s.id,
        created_at: s.created_at,
        last_active: s.updated_at || s.created_at,
        ip: s.ip || 'Unknown IP',
        user_agent: s.user_agent,
        is_current: s.id === currentSessionId,
        is_active: true
      }));
      
      return NextResponse.json({ sessions: formattedSessions });
    }

    // 4. Process sessions: deduplicate by device and categorize
    const now = new Date();
    const sessionTimeout = 60 * 60 * 1000; // 1 hour in milliseconds
    
    interface ProcessedSession {
      id: string;
      created_at: string;
      last_active: string;
      ip: string;
      user_agent: string;
      is_current: boolean;
      is_active: boolean;
      device_key: string;
    }

    const processedSessions: ProcessedSession[] = (allSessions || []).map((s: any) => {
      const lastActiveTime = new Date(s.updated_at || s.created_at).getTime();
      const isActive = (now.getTime() - lastActiveTime) < sessionTimeout;
      
      // Create a device key from user agent + IP for more reliable deduplication
      const userAgent = s.user_agent || '';
      const ip = s.ip || '';
      const combinedKey = `${userAgent}|${ip}`.toLowerCase().replace(/[^a-z0-9|]/g, '');
      const deviceKey = combinedKey.substring(0, 100); // Limit key length
      
      return {
        id: s.id,
        created_at: s.created_at,
        last_active: s.updated_at || s.created_at,
        ip: s.ip || 'Unknown IP',
        user_agent: userAgent,
        is_current: s.id === currentSessionId,
        is_active: isActive,
        device_key: deviceKey
      };
    });

    // 5. Deduplicate: keep only the latest session per device
    const deviceMap = new Map<string, ProcessedSession>();
    
    for (const session of processedSessions) {
      const existing = deviceMap.get(session.device_key);
      if (!existing || new Date(session.last_active) > new Date(existing.last_active)) {
        deviceMap.set(session.device_key, session);
      } else if (session.is_current) {
        // Always keep current session even if not the latest
        deviceMap.set(session.device_key, session);
      }
    }

    // 6. Convert back to array and limit to 6 most recent
    const deduplicatedSessions = Array.from(deviceMap.values())
      .sort((a, b) => new Date(b.last_active).getTime() - new Date(a.last_active).getTime())
      .slice(0, 6);

    // 7. Format for frontend (remove device_key)
    const formattedSessions = deduplicatedSessions.map(({ device_key, ...session }) => session);

    return NextResponse.json({ sessions: formattedSessions });
  } catch (error: any) {
    console.error('Session Fetch Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
    );
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, type } = await request.json();

    if (type === 'all') {
      // Admin client required for global sign out
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
