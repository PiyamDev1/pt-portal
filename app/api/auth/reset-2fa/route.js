import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    // Initialize client inside the function
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    // 1. List existing factors
    const { data: factors, error: listError } = await supabaseAdmin.auth.admin.mfa.listFactors({
      userId
    });

    if (listError) throw listError;

    // 2. Delete them all
    const deletePromises = (factors?.factors || []).map(f => 
      supabaseAdmin.auth.admin.mfa.deleteFactor({
        id: f.id,
        userId
      })
    );

    await Promise.all(deletePromises);

    // 3. Reset the DB flag so they are forced to setup again on next login
    await supabaseAdmin
      .from('employees')
      .update({ two_factor_enabled: false })
      .eq('id', userId);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Reset 2FA Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
