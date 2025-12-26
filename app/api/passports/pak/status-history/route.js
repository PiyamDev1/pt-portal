import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request) {
  const origin = request.headers.get('origin') || '*'

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { searchParams } = new URL(request.url)
    const applicationId = searchParams.get('applicationId')

    if (!applicationId) {
      return NextResponse.json({ error: 'applicationId required' }, { status: 400, headers: { 'Access-Control-Allow-Origin': origin } })
    }

    // Get the application and all passport records for it
    const { data: appData } = await supabase
      .from('applications')
      .select('id, tracking_number, created_at')
      .eq('id', applicationId)
      .single()

    if (!appData) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404, headers: { 'Access-Control-Allow-Origin': origin } })
    }

    // Get all passport records and their status updates
    const { data: passportData } = await supabase
      .from('pakistani_passport_applications')
      .select('id, status, created_at, updated_at')
      .eq('application_id', applicationId)

    // Build timeline of status changes
    const history = passportData?.map(pp => ({
      status: pp.status,
      timestamp: pp.updated_at || pp.created_at,
      description: `Status: ${pp.status}`
    })) || []

    // Sort by timestamp descending (newest first)
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

    return NextResponse.json({ history }, { status: 200, headers: { 'Access-Control-Allow-Origin': origin } })
  } catch (error) {
    console.error('Status History Error:', error)
    return NextResponse.json({
      error: 'Failed to fetch status history',
      details: error.message
    }, { status: 500, headers: { 'Access-Control-Allow-Origin': origin } })
  }
}
