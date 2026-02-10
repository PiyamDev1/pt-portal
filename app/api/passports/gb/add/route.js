import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const body = await request.json()
    const { 
      applicantName, applicantPassport, dateOfBirth, phoneNumber,
      pexNumber, ageGroup, serviceType, pages, 
      currentUserId 
    } = body

    // 1. LOOKUP FINANCIALS FROM DB (Secure)
    // Pricing table stores text values for age_group/pages/service_type
    const { data: pricing, error: pErr } = await supabase
        .from('gb_passport_pricing')
        .select('id, cost_price, sale_price')
        .eq('age_group', ageGroup)
        .eq('pages', pages)
        .eq('service_type', serviceType)
        .single()

    if (pErr || !pricing) {
        throw new Error("Pricing not found for this combination")
    }

    // 2. Find or Create Applicant
    let applicantId = null;
    let query = supabase.from('applicants').select('id')
    
    // Convert names to lowercase for DB
    const parts = applicantName.toLowerCase().split(' ')
    const firstName = parts[0]
    const lastName = parts.slice(1).join(' ') || '.'
    
    // Prioritize Passport Number search
    if (applicantPassport) query = query.eq('passport_number', applicantPassport)
    else {
        // Fallback to Name
        query = query.eq('first_name', firstName).eq('last_name', lastName)
    }
    
    const { data: existingApp } = await query.maybeSingle()

    if (existingApp) {
        applicantId = existingApp.id
        const updateData = {}
        if (dateOfBirth) updateData.date_of_birth = dateOfBirth
        if (phoneNumber) updateData.phone_number = phoneNumber
        if (Object.keys(updateData).length > 0) {
            await supabase.from('applicants').update(updateData).eq('id', applicantId)
        }
    } else {
        const insertData = {
            first_name: firstName,
            last_name: lastName,
            passport_number: applicantPassport,
            phone_number: phoneNumber
        }
        if (dateOfBirth) insertData.date_of_birth = dateOfBirth
        
        const { data: newApp, error: aErr } = await supabase.from('applicants').insert(insertData).select('id').single()
        
        if (aErr) throw new Error(`Applicant Error: ${aErr.message}`)
        applicantId = newApp.id
    }

    // 3. Create Parent Application (The "Folder")
    const trackingNo = `GB-${Date.now().toString().slice(-6)}`;
    const { data: parentApp, error: pAppErr } = await supabase.from('applications').insert({
        tracking_number: trackingNo,
        family_head_id: applicantId,
        applicant_id: applicantId,
        submitted_by_employee_id: currentUserId,
        status: 'Pending Submission'
    }).select('id').single()

    if (pAppErr) throw pAppErr

    // 4. Create GB Passport Record (With Linked Pricing)
    const { error: gbErr } = await supabase.from('british_passport_applications').insert({
        application_id: parentApp.id,
        applicant_id: applicantId,
        employee_id: currentUserId,
        pex_number: pexNumber,
        age_group: ageGroup,
        service_type: serviceType,
        pages: pages,
        pricing_id: pricing.id, // <--- Linked to Pricing Table
        cost_price: pricing.cost_price,
        sale_price: pricing.sale_price,
        status: 'Pending Submission'
    })

    if (gbErr) throw gbErr

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("GB Add Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}