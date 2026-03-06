import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

function toClientError(error) {
  const message = error?.message || 'Database error'
  if (message.includes('column') && message.includes('notes')) {
    return 'Database migration required: add notes column to pakistani_passport_applications.'
  }
  return message
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const applicationId = searchParams.get('applicationId')

    if (!applicationId) {
      return NextResponse.json({ error: 'applicationId is required' }, { status: 400 })
    }

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('pakistani_passport_applications')
      .select('id, notes')
      .eq('application_id', applicationId)
      .maybeSingle()

    if (error) {
      console.error('Get Notes Error:', error)
      return NextResponse.json({ error: toClientError(error) }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ notes: '' }, { status: 200 })
    }

    return NextResponse.json({ notes: data.notes || '' }, { status: 200 })
  } catch (error) {
    console.error('Get Notes Route Error:', error)
    return NextResponse.json({ error: error.message || 'Unexpected error' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { applicationId, notes, userId } = body || {}

    if (!applicationId) {
      return NextResponse.json({ error: 'applicationId is required' }, { status: 400 })
    }

    if (typeof notes !== 'string') {
      return NextResponse.json({ error: 'notes must be a string' }, { status: 400 })
    }

    const normalizedNotes = notes.trim() || null

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('pakistani_passport_applications')
      .update({
        notes: normalizedNotes,
        employee_id: userId
      })
      .eq('application_id', applicationId)
      .select('id, notes')
      .maybeSingle()

    if (error) {
      console.error('Save Notes Error:', error)
      return NextResponse.json({ error: toClientError(error) }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Passport application record not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, notes: data.notes || '' }, { status: 200 })
  } catch (error) {
    console.error('Save Notes Route Error:', error)
    return NextResponse.json({ error: error.message || 'Unexpected error' }, { status: 500 })
  }
}
