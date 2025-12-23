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
      serviceType,
      serviceOption,
      trackingNumber,
      pin,
      currentUserId
    } = body

    // 1. Find or Create Applicant
    let { data: applicant } = await supabase
      .from('applicants')
      .select('id')
      .eq('citizen_number', applicantCnic)
      .single()

    if (!applicant && applicantName) {
      const parts = applicantName.split(' ')
      const { data: newApp } = await supabase.from('applicants').insert({
        first_name: parts[0],
        last_name: parts.slice(1).join(' ') || 'N/A',
        citizen_number: applicantCnic
      }).select('id').single()
      applicant = newApp
    }

    // 2. Insert into nadra_services
    const { data: nadraRecord, error: nadraError } = await supabase
      .from('nadra_services')
      .insert({
        applicant_id: applicant.id,
        employee_id: currentUserId,
        service_type: serviceType,
        tracking_number: trackingNumber,
        application_pin: pin || null,
        status: 'Pending Submission'
      })
      .select()
      .single()

    if (nadraError) throw nadraError

    // 3. Handle Dual Table: Insert into nicop_cnic_details
    // Only if the service is NICOP/CNIC and we have an option selected
    if (serviceType === 'NICOP/CNIC' && serviceOption) {
      const { error: detailsError } = await supabase
        .from('nicop_cnic_details')
        .insert({
          id: nadraRecord.id,
          service_option: serviceOption
        })
      
      if (detailsError) console.error('[NADRA API] Details Insert Error:', detailsError)
    }

    return NextResponse.json({ success: true, data: nadraRecord }, { 
      status: 200, 
      headers: { 'Access-Control-Allow-Origin': origin } 
    })

  } catch (error) {
    console.error('[NADRA API] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
