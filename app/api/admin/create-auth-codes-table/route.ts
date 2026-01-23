import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Create auth_codes table
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS auth_codes (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
          code VARCHAR(10) NOT NULL,
          purpose VARCHAR(50) NOT NULL,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          used_at TIMESTAMP WITH TIME ZONE
        );

        CREATE INDEX IF NOT EXISTS idx_auth_codes_employee ON auth_codes(employee_id);
        CREATE INDEX IF NOT EXISTS idx_auth_codes_code ON auth_codes(code);
        CREATE INDEX IF NOT EXISTS idx_auth_codes_expires ON auth_codes(expires_at);
      `
    })

    if (error) throw error

    return NextResponse.json({ 
      success: true, 
      message: 'auth_codes table created successfully' 
    })
  } catch (error: any) {
    console.error('Migration error:', error)
    return NextResponse.json({ 
      error: error.message,
      note: 'You may need to run this SQL manually in Supabase SQL Editor'
    }, { status: 500 })
  }
}
