import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request) {
  const origin = request.headers.get('origin') || '*'

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      console.error('[PAK Status History] Missing Supabase env vars')
      return NextResponse.json({ error: 'Server not configured' }, { status: 500, headers: { 'Access-Control-Allow-Origin': origin } })
    }

    const supabase = createClient(url, key)

    const { searchParams } = new URL(request.url)
    const applicationId = searchParams.get('applicationId')

    if (!applicationId) {
      return NextResponse.json({ error: 'applicationId required' }, { status: 400, headers: { 'Access-Control-Allow-Origin': origin } })
    }

    // Get the passport record for this application (expecting one)
    const { data: passportData, error: passportErr } = await supabase
      .from('pakistani_passport_applications')
      .select('id, status, created_at, updated_at')
      .eq('application_id', applicationId)
      .limit(1)
      .maybeSingle()

    if (passportErr) {
      console.error('[PAK Status History] Passport fetch error:', passportErr)
    }

    if (!passportData?.id) {
      return NextResponse.json({ history: [] }, { status: 200, headers: { 'Access-Control-Allow-Origin': origin } })
    }

    // Pull detailed status events if history table exists
    const { data: historyData, error: historyErr } = await supabase
      .from('pakistani_passport_status_history')
      .select(`
        id,
        new_status,
        changed_at,
        changed_by,
        employees ( full_name )
      `)
      .eq('passport_application_id', passportData.id)
      .order('changed_at', { ascending: false })

    if (historyErr) {
      console.error('[PAK Status History] History fetch error:', historyErr)
    }

    // Map history rows; fallback to current record if no history
    let history = historyData?.map(row => ({
      status: row.new_status,
      timestamp: row.changed_at,
      description: `Status: ${row.new_status}`,
      updated_by: row.employees?.full_name || row.changed_by || 'System'
    })) || []

    if (!history.length) {
      history = [{
        status: passportData.status,
        timestamp: passportData.updated_at || passportData.created_at,
        description: `Status: ${passportData.status}`
      }]
    }

    return NextResponse.json({ history }, { status: 200, headers: { 'Access-Control-Allow-Origin': origin } })
  } catch (error) {
    console.error('Status History Error:', error)
    return NextResponse.json({
      error: 'Failed to fetch status history',
      details: error.message
    }, { status: 500, headers: { 'Access-Control-Allow-Origin': origin } })
  }
}
