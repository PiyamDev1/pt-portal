import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Valid status values from the enum
const VALID_STATUSES = [
  'Pending Submission',
  'Submitted',
  'In Progress',
  'Completed',
  'Cancelled'
]

export async function POST(req) {
  try {
    const { passportId, status } = await req.json()

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      console.error('[PAK Status Update] Missing Supabase env vars')
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
    }

    const supabase = createClient(url, key)

    if (!passportId || !status) {
      return NextResponse.json(
        { error: 'Missing passportId or status' },
        { status: 400 }
      )
    }

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Valid options: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    console.log(`[PAK Status Update] Updating passport ${passportId} to status: ${status}`)

    const { error } = await supabase
      .from('pakistani_passport_applications')
      .update({ status })
      .eq('id', passportId)

    if (error) {
      console.error('[PAK Status Update] Error:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to update status' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, newStatus: status })
  } catch (err) {
    console.error('[PAK Status Update] Exception:', err)
    return NextResponse.json(
      { error: err.message || 'Server error' },
      { status: 500 }
    )
  }
}
