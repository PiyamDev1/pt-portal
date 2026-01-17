import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const body = await request.json()
    const { id, status, notes, userId, applicantName, applicantPassport, dateOfBirth, phoneNumber, pexNumber } = body

    // Get the applicant ID
    const { data: gbApp, error: gbErr } = await supabase
      .from('british_passport_applications')
      .select('applicant_id')
      .eq('id', id)
      .single()

    if (gbErr || !gbApp) {
      throw new Error('Application not found')
    }

    // Update applicant record if any applicant fields provided
    const applicantUpdate = {}
    if (applicantName) {
      const parts = applicantName.toLowerCase().split(' ')
      applicantUpdate.first_name = parts[0]
      applicantUpdate.last_name = parts.slice(1).join(' ') || '.'
    }
    if (applicantPassport) applicantUpdate.passport_number = applicantPassport
    if (dateOfBirth) applicantUpdate.date_of_birth = dateOfBirth
    if (phoneNumber) applicantUpdate.phone_number = phoneNumber

    if (Object.keys(applicantUpdate).length > 0) {
      const { error: aErr } = await supabase
        .from('applicants')
        .update(applicantUpdate)
        .eq('id', gbApp.applicant_id)

      if (aErr) throw new Error(`Failed to update applicant: ${aErr.message}`)
    }

    // Update british_passport_applications record
    const gbUpdate = {}
    if (pexNumber) gbUpdate.pex_number = pexNumber.toUpperCase()
    if (status) gbUpdate.status = status

    if (Object.keys(gbUpdate).length > 0) {
      const { error: gbUpdateErr } = await supabase
        .from('british_passport_applications')
        .update(gbUpdate)
        .eq('id', id)

      if (gbUpdateErr) throw new Error(`Failed to update application: ${gbUpdateErr.message}`)
    }

    // Log status history if status changed
    if (status) {
      const { data: current } = await supabase
        .from('british_passport_applications')
        .select('status')
        .eq('id', id)
        .single()

      await supabase.from('british_passport_status_history').insert({
        passport_id: id,
        old_status: current?.status,
        new_status: status,
        notes: notes || null,
        changed_by: userId
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
