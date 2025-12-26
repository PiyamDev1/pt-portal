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
      applicantCnic,
      applicantName,
      applicantEmail,
      familyHeadCnic,
      familyHeadName,
      applicationType,
      category,
      pageCount,
      speed,
      oldPassportNumber,
      trackingNumber,
      currentUserId
    } = body

    // 0. Basic validation
    if (!applicantCnic || !trackingNumber) {
      return NextResponse.json({
        error: 'Required fields missing',
        details: 'Applicant CNIC and Tracking Number are required.'
      }, { status: 400, headers: { 'Access-Control-Allow-Origin': origin } })
    }

    // 1. Find or Create Applicant
    let { data: applicant } = await supabase
      .from('applicants')
      .select('id, email')
      .eq('citizen_number', applicantCnic)
      .single()

    if (!applicant && applicantName) {
      const parts = applicantName.split(' ')
      const { data: newApp, error: newAppErr } = await supabase.from('applicants').insert({
        first_name: parts[0],
        last_name: parts.slice(1).join(' ') || 'N/A',
        citizen_number: applicantCnic,
        email: applicantEmail || null
      }).select('id, email').single()
      if (newAppErr) throw newAppErr
      applicant = newApp
    } else if (applicant && applicantEmail && !applicant.email) {
      await supabase.from('applicants')
        .update({ email: applicantEmail })
        .eq('id', applicant.id)
      applicant = { ...applicant, email: applicantEmail }
    }

    if (!applicant?.id) {
      throw new Error('Applicant not found or created')
    }

    // 2. Find or Create Family Head
    let headId = null
    if (familyHeadCnic) {
      let { data: head } = await supabase
        .from('applicants')
        .select('id')
        .eq('citizen_number', familyHeadCnic)
        .single()

      if (!head && familyHeadName) {
        const parts = familyHeadName.split(' ')
        const { data: newHead } = await supabase.from('applicants').insert({
          first_name: parts[0],
          last_name: parts.slice(1).join(' ') || 'N/A',
          citizen_number: familyHeadCnic
        }).select('id').single()
        headId = newHead?.id || null
      } else {
        headId = head?.id || null
      }
    }

    // 3. Optional duplicate check on tracking number
    const { data: existingApp } = await supabase
      .from('applications')
      .select('id')
      .eq('tracking_number', trackingNumber)
      .maybeSingle?.() ?? { data: null }
    if (existingApp) {
      return NextResponse.json({
        error: 'Duplicate in system not allowed',
        details: 'This tracking number is already registered.'
      }, { status: 409, headers: { 'Access-Control-Allow-Origin': origin } })
    }

    // 4. INSERT APPLICATION (Master Record)
    const { data: appRecord, error: appError } = await supabase
      .from('applications')
      .insert({
        tracking_number: trackingNumber,
        family_head_id: headId || applicant.id,
        applicant_id: applicant.id,
        submitted_by_employee_id: currentUserId,
        status: 'In Progress'
      })
      .select('id')
      .single()

    if (appError) throw appError

    // 5. INSERT PASSPORT DETAILS (Linked by shared id)
    const { error: ppError } = await supabase
      .from('pakistani_passport_applications')
      .insert({
        id: appRecord.id,
        application_type: applicationType,
        category: category,
        page_count: pageCount,
        speed: speed,
        status: 'In Progress',
        old_passport_number: oldPassportNumber || null,
        is_old_passport_returned: false,
        old_passport_returned_at: null,
        new_passport_number: null
      })

    if (ppError) {
      if (ppError.code === '23505') {
        return NextResponse.json({
          error: 'Duplicate in system not allowed',
          details: 'Passport record already exists for this application.'
        }, { status: 409, headers: { 'Access-Control-Allow-Origin': origin } })
      }
      throw ppError
    }

    return NextResponse.json({ success: true, id: appRecord.id }, {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': origin }
    })

  } catch (error) {
    console.error('[PAK PASSPORT ADD] Unexpected error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message
    }, { status: 500, headers: { 'Access-Control-Allow-Origin': origin } })
  }
}
