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
      familyHeadCnic,
      familyHeadName,
      serviceType,
      trackingNumber,
      pin,
      currentUserId
    } = body

    if (!applicantCnic || !serviceType || !trackingNumber) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 1. Handle Applicant
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

    // 2. Handle Family Head
    let { data: familyHead } = await supabase
      .from('applicants')
      .select('id')
      .eq('citizen_number', familyHeadCnic)
      .single()

    if (!familyHead && familyHeadName) {
      const parts = familyHeadName.split(' ')
      const { data: newHead } = await supabase.from('applicants').insert({
        first_name: parts[0],
        last_name: parts.slice(1).join(' ') || 'N/A',
        citizen_number: familyHeadCnic
      }).select('id').single()
      familyHead = newHead
    }

    // 3. Insert into nadra_services (Credentials Ledger)
    const payload = {
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

    if (nadraError) throw nadraError

    // 4. Create Application Link (Hierarchy Record)
    if (familyHead) {
      await supabase.from('applications').insert({
        tracking_number: trackingNumber,
        family_head_id: familyHead.id,
        applicant_id: applicant.id,
        submitted_by_employee_id: body.currentUserId || (await supabase.auth.getUser()).data.user?.id,
        status: 'Pending Submission'
      })
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
