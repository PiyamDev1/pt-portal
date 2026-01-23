import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { data: methods, error } = await supabase
      .from('loan_payment_methods')
      .select('*')
      .order('name')

    if (error) throw error

    return NextResponse.json({ methods })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
