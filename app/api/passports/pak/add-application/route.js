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

    // 1. Validation
    if (!applicantCnic || !trackingNumber || !applicantName) {
      return NextResponse.json({ error: 'Missing Required Fields (Name, CNIC, or Tracking)' }, { status: 400, headers: { 'Access-Control-Allow-Origin': origin } })
    }

    // 2. Find or Create Applicant
    let { data: applicant } = await supabase
      .from('applicants')
      .select('id')
      .eq('citizen_number', applicantCnic)
      .single()

    if (!applicant) {
      const parts = applicantName.split(' ')
      const { data: newApp, error: createError } = await supabase.from('applicants').insert({
        first_name: parts[0],
        last_name: parts.slice(1).join(' ') || 'N/A',
        citizen_number: applicantCnic,
        email: applicantEmail || null
      }).select('id').single()
      
      if (createError) {
        console.error('Applicant Create Error:', createError)
        return NextResponse.json({ error: `Applicant Error: ${createError.message}` }, { status: 500, headers: { 'Access-Control-Allow-Origin': origin } })
      }
      applicant = newApp
    }

    // 3. Insert into Applications (Hierarchy)
    const { data: appRecord, error: appError } = await supabase.from('applications').insert({
      tracking_number: trackingNumber,
      family_head_id: applicant.id, 
      applicant_id: applicant.id,
      submitted_by_employee_id: currentUserId,
      status: 'pending'
    }).select('id').single()

    if (appError) {
      if (appError.code === '23505') return NextResponse.json({ error: 'Tracking Number already exists' }, { status: 409, headers: { 'Access-Control-Allow-Origin': origin } })
      console.error('Application Hierarchy Error:', appError)
      return NextResponse.json({ error: `Hierarchy Error: ${appError.message}` }, { status: 500, headers: { 'Access-Control-Allow-Origin': origin } })
    }

    // 4. Insert Passport Specifics
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
      status: 'pending'
    })

    if (ppError) {
      // Rollback: Delete the hierarchy record if passport details failed
      await supabase.from('applications').delete().eq('id', appRecord.id)
      
      console.error('Passport Details Insert Error:', ppError)
      return NextResponse.json({ error: `Passport DB Error: ${ppError.message}` }, { status: 500, headers: { 'Access-Control-Allow-Origin': origin } })
    }

    return NextResponse.json({ success: true }, { status: 200, headers: { 'Access-Control-Allow-Origin': origin } })
  } catch (error) {
    console.error('Unhandled Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': origin } })
  }
}
