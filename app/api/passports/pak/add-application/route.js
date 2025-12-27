import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  const origin = request.headers.get('origin') || '*'

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const body = await request.json()
    const { 
      applicantCnic, applicantName, applicantEmail,
      applicationType, category, pageCount, speed, 
      oldPassportNumber, trackingNumber, 
      fingerprintsCompleted,
      currentUserId 
    } = body

    // ... (Validation & Applicant Creation same as before) ...
    // NOTE: Keeping it brief, just ensuring the STATUS usage below is correct:

    // 1. Find/Create Applicant (simplified for brevity, keep your existing logic)
    let { data: applicant } = await supabase.from('applicants').select('id').eq('citizen_number', applicantCnic).single()
    if (!applicant) {
         const parts = applicantName.split(' ')
         const { data: newApp } = await supabase.from('applicants').insert({
            first_name: parts[0], last_name: parts.slice(1).join(' ') || 'N/A', citizen_number: applicantCnic, email: applicantEmail
         }).select('id').single()
         applicant = newApp
    }

    // 2. Create Application Hierarchy
    const { data: appRecord, error: appError } = await supabase.from('applications').insert({
      tracking_number: trackingNumber,
      family_head_id: applicant.id, 
      applicant_id: applicant.id,
      submitted_by_employee_id: currentUserId,
      status: 'Pending Submission' // Matches new workflow
    }).select('id').single()

    if (appError) throw appError

    // 3. Create Passport Record
    const { error: ppError } = await supabase.from('pakistani_passport_applications').insert({
      application_id: appRecord.id,
      applicant_id: applicant.id,
      employee_id: currentUserId,
      application_type: applicationType,
      category: category,
      page_count: pageCount,
      speed: speed,
      old_passport_number: oldPassportNumber || null,
      is_old_passport_returned: false,
      fingerprints_completed: fingerprintsCompleted || false,
      status: 'Pending Submission' // Matches new workflow
    })

    if (ppError) {
       await supabase.from('applications').delete().eq('id', appRecord.id)
       throw ppError
    }

    return NextResponse.json({ success: true }, { status: 200, headers: { 'Access-Control-Allow-Origin': origin } })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': origin } })
  }
}
