import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// We need the SERVICE KEY to update the user's password without requiring the old one again
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { userId, newPassword } = await request.json();

    if (!userId || !newPassword) {
      return NextResponse.json({ error: 'Missing requirements' }, { status: 400 });
    }

    // 1. Update Password in Supabase Auth (The real login system)
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // 2. Update the Flag in your Employees Table (So they aren't asked again)
    const { error: dbError } = await supabaseAdmin
      .from('employees')
      .update({ is_temporary_password: false })
      .eq('id', userId);

    if (dbError) {
      return NextResponse.json({ error: 'Password set, but DB flag failed.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Password updated successfully' }, { status: 200 });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
