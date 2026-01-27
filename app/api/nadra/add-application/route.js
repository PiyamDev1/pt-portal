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
      serviceType,
      serviceOption,
      trackingNumber,
      pin,
      currentUserId
    } = body

    // 1. Find or Create Applicant
    let applicant = null
    const hasCnic = applicantCnic && applicantCnic.trim() !== ''

    if (hasCnic) {
      // Existing adult flow: search by CNIC
      const { data: existing } = await supabase
        .from('applicants')
        .select('id, email')
        .eq('citizen_number', applicantCnic)
        .maybeSingle()

      if (existing) {
        applicant = existing
        // Update email if missing
        if (applicantEmail && !existing.email) {
          await supabase.from('applicants').update({ email: applicantEmail }).eq('id', existing.id)
          applicant = { ...existing, email: applicantEmail }
        }
      } else {
        const parts = applicantName.split(' ')
        const { data: newApp, error } = await supabase.from('applicants').insert({
          first_name: parts[0],
          last_name: parts.slice(1).join(' ') || 'N/A',
          citizen_number: applicantCnic,
          email: applicantEmail || null,
          is_new_born: false
        }).select('id, email').single()
        if (error) throw error
        applicant = newApp
      }
    } else {
      // New born: no CNIC provided, always create fresh
      const parts = applicantName.split(' ')
      const { data: newBaby, error } = await supabase.from('applicants').insert({
        first_name: parts[0],
        last_name: parts.slice(1).join(' ') || '.',
        citizen_number: null,
        is_new_born: true,
        email: applicantEmail || null
      }).select('id, email').single()
      if (error) throw error
      applicant = newBaby
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

    // 3. INSERT APPLICATION FIRST (The Master Record)
    const { data: appRecord, error: appError } = await supabase
      .from('applications')
      .insert({
        tracking_number: trackingNumber,
        family_head_id: headId || applicant.id,
        applicant_id: applicant.id,
        submitted_by_employee_id: currentUserId,
        status: 'Pending Submission'
      })
      .select('id')
      .single()

    if (appError) throw appError

    // 4. INSERT NADRA SERVICE (Linked to Application) with duplicate handling
    const payload = {
      application_id: appRecord.id,
      applicant_id: applicant.id,
      employee_id: currentUserId,
      service_type: serviceType,
      tracking_number: trackingNumber,
      application_pin: pin || null,
      status: 'Pending Submission'
    }

    const { data: nadraRecord, error: nadraError } = await supabase
      .from('nadra_services')
      .insert(payload)
      .select()
      .single()

    if (nadraError) {
      if (nadraError.code === '23505') {
        return NextResponse.json({
          error: 'Duplicate in system not allowed',
          details: 'This tracking number is already registered.'
        }, { status: 409, headers: { 'Access-Control-Allow-Origin': origin } })
      }

      return NextResponse.json({
        error: 'Database error',
        details: nadraError.message
      }, { status: 500, headers: { 'Access-Control-Allow-Origin': origin } })
    }

    // 5. Dual Table Logic: nicop_cnic_details
    if (serviceOption) {
      const { error: detailsError } = await supabase
        .from('nicop_cnic_details')
        .insert({
          id: nadraRecord.id,
          service_option: serviceOption
        })
    }

    // 6. Insert initial status history record
    const { error: historyError } = await supabase
      .from('nadra_status_history')
      .insert({
        nadra_service_id: nadraRecord.id,
        new_status: 'Pending Submission',
        changed_by: currentUserId
      })

    return NextResponse.json({ success: true, data: nadraRecord }, { 
      status: 200, 
      headers: { 'Access-Control-Allow-Origin': origin } 
    })

  } catch (error) {
    console.error('[NADRA API] Unexpected error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500, headers: { 'Access-Control-Allow-Origin': origin } })
  }
}
