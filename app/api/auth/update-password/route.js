import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';

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

    // Server-side password strength validation
    const password = newPassword;
    const passErrors = [];
    if (password.length < 8) passErrors.push('at least 8 characters');
    if (!/[a-z]/.test(password)) passErrors.push('a lowercase letter');
    if (!/[A-Z]/.test(password)) passErrors.push('an uppercase letter');
    if (!/[0-9]/.test(password)) passErrors.push('a number');
    if (!/[!@#$%^&*(),.?":{}|<>\-_=+\\/\[\];']/.test(password)) passErrors.push('a special character');

    if (passErrors.length > 0) {
      return NextResponse.json({ error: `Password must contain ${passErrors.join(', ')}` }, { status: 400 });
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

    // 3. Record password hash in password_history (keep latest 5)
    try {
      const hash = await bcrypt.hash(password, 12)
      await supabaseAdmin.from('password_history').insert({ employee_id: userId, password_hash: hash })

      // Keep only last 5 entries
      const { data: rows } = await supabaseAdmin
        .from('password_history')
        .select('id')
        .eq('employee_id', userId)
        .order('created_at', { ascending: false })
        .limit(5)

      const keepIds = (rows || []).map(r => r.id).filter(Boolean)
      if (keepIds.length > 0) {
        await supabaseAdmin
          .from('password_history')
          .delete()
          .eq('employee_id', userId)
          .not('id', 'in', `(${keepIds.join(',')})`)
      }
    } catch (e) {
      console.error('Failed to write password history:', e)
    }

    return NextResponse.json({ success: true, message: 'Password updated successfully' }, { status: 200 });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
