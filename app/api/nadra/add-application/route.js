import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    // Grab cookies once and pass through to Supabase client
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

    // Check authentication
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
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

    // First, find or get the applicant by CNIC
    const { data: applicant, error: applicantError } = await supabase
      .from('applicants')
      .select('id, email')
      .eq('citizen_number', applicantCnic)
      .single()

    if (applicantError || !applicant) {
      console.error('Applicant lookup error:', applicantError)
      return NextResponse.json({ 
        error: 'Applicant not found. Please ensure the applicant exists in the system.',
        details: applicantError?.message
      }, { status: 404 })
    }

    // Insert the NADRA service record
    const payload = {
      applicant_id: applicant.id,
      service_type: serviceType,
      urgency_level: urgencyLevel,
      tracking_number: trackingNumber,
      application_pin: pin,
      application_email: applicant.email,
      status: 'pending',
      created_by: session.user.id,
    }

    // Attempt insert; if urgency column is missing, retry without it to avoid hard failure
    let { data: nadraService, error: insertError } = await supabase
      .from('nadra_services')
      .insert(payload)
      .select(`
        *,
        applicants ( first_name, last_name, citizen_number, email )
      `)
      .single()

    if (insertError && insertError.message?.includes('urgency')) {
      const fallbackPayload = { ...payload }
      delete fallbackPayload.urgency_level

      console.warn('Retrying insert without urgency_level column due to error:', insertError.message)
      const retry = await supabase
        .from('nadra_services')
        .insert(fallbackPayload)
        .select(`
          *,
          applicants ( first_name, last_name, citizen_number, email )
        `)
        .single()

      nadraService = retry.data
      insertError = retry.error
    }

    if (insertError) {
      console.error('Insert error:', insertError)
      return NextResponse.json({ 
        error: 'Failed to save application',
        details: insertError.message 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      data: nadraService 
    })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 })
  }
}
