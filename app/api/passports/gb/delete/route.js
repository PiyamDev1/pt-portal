import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { id, authCode, userId } = await request.json()

    if (!authCode) {
      return NextResponse.json({ error: 'Auth code required' }, { status: 403 })
    }

    // Get the record to be deleted
    const { data: gbRecord, error: gbErr } = await supabase
      .from('british_passport_applications')
      .select('*, applications(id), applicants(id)')
      .eq('id', id)
      .single()

    if (gbErr || !gbRecord) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    // Log deletion
    const { error: logError } = await supabase.from('deletion_logs').insert({
      record_type: 'GB Passport Application',
      deleted_record_data: gbRecord,
      deleted_by: userId || null,
      auth_code_used: authCode
    })

    if (logError) throw logError

    // Delete the GB passport application
    const { error: deleteGbErr } = await supabase
      .from('british_passport_applications')
      .delete()
      .eq('id', id)

    if (deleteGbErr) throw deleteGbErr

    // Delete parent application if exists
    if (gbRecord.application_id) {
      await supabase
        .from('applications')
        .delete()
        .eq('id', gbRecord.application_id)
    }

    // Check if applicant has other applications, if not delete
    if (gbRecord.applicant_id) {
      const { data: otherApps } = await supabase
        .from('british_passport_applications')
        .select('id')
        .eq('applicant_id', gbRecord.applicant_id)

      // If no other GB passport apps exist for this applicant, delete applicant
      if (!otherApps || otherApps.length === 0) {
        // Check if applicant has any other application types
        const { data: nadraApps } = await supabase
          .from('nadra_services')
          .select('id')
          .eq('applicant_id', gbRecord.applicant_id)

        const { data: pakApps } = await supabase
          .from('pak_passport_applications')
          .select('id')
          .eq('applicant_id', gbRecord.applicant_id)

        // Only delete applicant if they have no applications anywhere
        if ((!nadraApps || nadraApps.length === 0) && (!pakApps || pakApps.length === 0)) {
          await supabase
            .from('applicants')
            .delete()
            .eq('id', gbRecord.applicant_id)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete' },
      { status: 500 }
    )
  }
}
