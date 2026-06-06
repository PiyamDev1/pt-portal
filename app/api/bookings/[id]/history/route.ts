import { NextRequest, NextResponse } from 'next/server'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'

const SCHEMA_HINT = 'Booking schema is out of date. Run scripts/create-bookings-schema.sql in Supabase SQL editor.'

function isSchemaError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10'
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await getRouteSupabaseClient()

    const [{ data: auditLogs, error: auditError }, { data: emailLogs, error: emailError }] = await Promise.all([
      supabase
        .from('booking_audit_logs')
        .select('*')
        .eq('booking_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('booking_email_logs')
        .select('*')
        .eq('booking_id', id)
        .order('created_at', { ascending: false }),
    ])

    if (auditError || emailError) {
      const relevantError = auditError || emailError
      if (isSchemaError(relevantError)) {
        return NextResponse.json({ history: [], warning: SCHEMA_HINT }, { status: 200 })
      }
      return NextResponse.json({ error: relevantError?.message || 'Failed to load booking history' }, { status: 500 })
    }

    return NextResponse.json({
      audit_logs: auditLogs || [],
      email_logs: emailLogs || [],
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
