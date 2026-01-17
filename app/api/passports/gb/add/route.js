import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Re-defining pricing here for backend security (or import if using TS compiler)
const PRICING_DB = {
  'Child_34_Standard':       { cost: 61.50, price: 95.00 },
  'Child_54_Standard':       { cost: 74.50, price: 110.00 },
  'Child_34_Fast Track 1wk': { cost: 145.50, price: 180.00 },
  'Child_54_Fast Track 1wk': { cost: 158.50, price: 210.00 },
  'Adult_34_Standard':       { cost: 94.50, price: 135.00 },
  'Adult_54_Standard':       { cost: 107.50, price: 150.00 },
  'Adult_34_Fast Track 1wk': { cost: 178.50, price: 225.00 },
  'Adult_54_Fast Track 1wk': { cost: 191.50, price: 250.00 },
  'Adult_34_Premium 1D':     { cost: 222.50, price: 275.00 },
  'Adult_54_Premium 1D':     { cost: 235.50, price: 295.00 },
};

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const body = await request.json()
    const { 
      applicantName, applicantPassport, // Search/Create params
      dateOfBirth,
      pexNumber, ageGroup, serviceType, pages, 
      currentUserId 
    } = body

    // 1. Calculate Financials
    const priceKey = `${ageGroup}_${pages}_${serviceType}`;
    const pricing = PRICING_DB[priceKey] || { cost: 0, price: 0 };

    // 2. Find or Create Applicant
    let applicantId = null;
    let query = supabase.from('applicants').select('id')
    
    // Prioritize Passport Number search
    if (applicantPassport) query = query.eq('passport_number', applicantPassport)
    else {
        // Fallback to Name
        const parts = applicantName.split(' ')
        query = query.eq('first_name', parts[0]).eq('last_name', parts.slice(1).join(' ') || '.')
    }
    
    const { data: existingApp } = await query.maybeSingle()

    if (existingApp) {
      applicantId = existingApp.id
      // Update DOB if provided
      if (dateOfBirth) {
        await supabase
        .from('applicants')
        .update({ date_of_birth: dateOfBirth })
        .eq('id', applicantId)
      }
    } else {
        const parts = applicantName.split(' ')
        const { data: newApp, error: aErr } = await supabase.from('applicants').insert({
            first_name: parts[0],
            last_name: parts.slice(1).join(' ') || '.',
        passport_number: applicantPassport,
        date_of_birth: dateOfBirth
        }).select('id').single()
        
        if (aErr) throw new Error(`Applicant Error: ${aErr.message}`)
        applicantId = newApp.id
    }

    // 3. Create Parent Application (The "Folder")
    const trackingNo = `GB-${Date.now().toString().slice(-6)}`;
    const { data: parentApp, error: pErr } = await supabase.from('applications').insert({
        tracking_number: trackingNo,
        family_head_id: applicantId,
        applicant_id: applicantId,
        submitted_by_employee_id: currentUserId,
        status: 'Pending Submission'
    }).select('id').single()

    if (pErr) throw pErr

    // 4. Create GB Passport Record
    const { error: gbErr } = await supabase.from('british_passport_applications').insert({
        application_id: parentApp.id,
        applicant_id: applicantId,
        employee_id: currentUserId,
        pex_number: pexNumber,
        age_group: ageGroup,
        service_type: serviceType,
        pages: pages,
        cost_price: pricing.cost,
        sale_price: pricing.price,
        status: 'Pending Submission'
    })

    if (gbErr) throw gbErr

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
