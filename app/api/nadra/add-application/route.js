import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const cookieStore = await cookies()
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
      return NextResponse.json({ 
        error: 'Applicant not found. Please ensure the applicant exists in the system.' 
      }, { status: 404 })
    }

    // Insert the NADRA service record
    const { data: nadraService, error: insertError } = await supabase
      .from('nadra_services')
      .insert({
        applicant_id: applicant.id,
        service_type: serviceType,
        urgency_level: urgencyLevel,
        tracking_number: trackingNumber,
        application_pin: pin,
        application_email: applicant.email,
        status: 'pending',
        created_by: session.user.id,
        family_head_name: familyHeadName,
        family_head_cnic: familyHeadCnic
      })
      .select(`
        *,
        applicants ( first_name, last_name, citizen_number, email )
      `)
      .single()

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
