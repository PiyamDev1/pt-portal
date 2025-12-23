import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    // Grab cookies and create Supabase client
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    // Check authentication
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    console.log('[NADRA API] Received request body:', JSON.stringify(body, null, 2))

    const { 
      familyHeadName,
      familyHeadCnic,
      applicantName,
      applicantCnic,
      serviceType,
      urgencyLevel,
      trackingNumber,
      pin
    } = body

    // Validate required fields
    if (!applicantCnic || !serviceType || !trackingNumber) {
      return NextResponse.json({ 
        error: 'Missing required fields: applicantCnic, serviceType, trackingNumber' 
      }, { status: 400 })
    }

    // First, find the applicant by CNIC
    console.log('[NADRA API] Looking up applicant with CNIC:', applicantCnic)
    const { data: applicant, error: applicantError } = await supabase
      .from('applicants')
      .select('id, email')
      .eq('citizen_number', applicantCnic)
      .single()

    if (applicantError) {
      console.error('[NADRA API] Applicant lookup error:', applicantError)
      return NextResponse.json({ 
        error: 'Applicant not found. Please ensure the applicant exists in the system.',
        details: applicantError.message
      }, { status: 404 })
    }

    if (!applicant) {
      console.error('[NADRA API] No applicant found for CNIC:', applicantCnic)
      return NextResponse.json({ 
        error: 'Applicant not found. Please ensure the applicant exists in the system.'
      }, { status: 404 })
    }

    // Build minimal payload - only include fields that definitely exist
    const payload = {
      applicant_id: applicant.id,
      service_type: serviceType,
      tracking_number: trackingNumber,
      application_pin: pin || null,
      status: 'pending',
    }

    console.log('[NADRA API] Attempting insert with payload:', JSON.stringify(payload, null, 2))

    const { data: nadraService, error: insertError } = await supabase
      .from('nadra_services')
      .insert(payload)
      .select()
      .single()

    if (insertError) {
      console.error('[NADRA API] Insert error:', insertError)
      return NextResponse.json({ 
        error: 'Failed to save application',
        details: insertError.message,
        code: insertError.code
      }, { status: 500 })
    }

    console.log('[NADRA API] Successfully inserted record:', nadraService.id)

    // Now fetch with relations for the response
    const { data: fullRecord } = await supabase
      .from('nadra_services')
      .select(`
        *,
        applicants ( first_name, last_name, citizen_number, email )
      `)
      .eq('id', nadraService.id)
      .single()

    return NextResponse.json({ 
      success: true, 
      data: fullRecord 
    })

  } catch (error) {
    console.error('[NADRA API] Unexpected error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 })
  }
}
