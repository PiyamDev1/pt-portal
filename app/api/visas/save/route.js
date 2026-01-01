import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const body = await request.json()
    const { 
      id, 
      applicantName, applicantPassport, applicantDob,
      countryId, // CHANGED: We now expect an ID, not a name
      visaTypeName, // Visa Types remain dynamic
      validity, internalTrackingNo,
      customerPrice, basePrice, costCurrency,
      isPartOfPackage, 
      currentUserId, status
    } = body

    if (!countryId) {
        return NextResponse.json({ error: "Please select a valid Country from the list." }, { status: 400 })
    }

    

    // 2. DYNAMIC VISA TYPE scoped to country
    let typeId = null
    if (visaTypeName) {
      const { data: existingType } = await supabase
        .from('visa_types')
        .select('id')
        .eq('country_id', countryId)
        .ilike('name', visaTypeName.trim())
        .single()

      if (existingType) {
        typeId = existingType.id
      } else {
        const { data: newType, error: tErr } = await supabase
          .from('visa_types')
          .insert({ name: visaTypeName.trim(), country_id: countryId })
          .select('id')
          .single()
        if (tErr) throw new Error(`Visa Type Error: ${tErr.message}`)
        typeId = newType.id
      }
    }

    // 2. APPLICANT LOGIC
    let applicantId = null;
    let query = supabase.from('applicants').select('id')
    
    // Search by passport first, then name if passport is missing (legacy support)
    if (applicantPassport) query = query.eq('passport_number', applicantPassport)
    else query = query.eq('first_name', applicantName.split(' ')[0]).eq('last_name', applicantName.split(' ').slice(1).join(' ') || '.')
    
    const { data: existingApp } = await query.maybeSingle() // Use maybeSingle to avoid 406 error

    if (existingApp) {
        applicantId = existingApp.id
    } else {
        const nameParts = applicantName.split(' ')
        const { data: newApp, error: aErr } = await supabase
            .from('applicants')
            .insert({
                first_name: nameParts[0],
                last_name: nameParts.slice(1).join(' ') || '.',
                passport_number: applicantPassport,
                dob: applicantDob || null
            })
            .select('id')
            .single()
        if (aErr) throw new Error(`Applicant Error: ${aErr.message}`)
        applicantId = newApp.id
    }

    // 3. SAVE APPLICATION
    const payload = {
        internal_tracking_number: internalTrackingNo,
        applicant_id: applicantId,
        visa_country_id: countryId, // Using the ID from the dropdown
        visa_type_id: typeId,
        validity: validity,
        passport_number_used: applicantPassport,
        customer_price: customerPrice || 0,
        base_price: basePrice || 0,
        cost_currency: costCurrency || 'GBP',
        status: status || 'Pending',
        is_part_of_package: isPartOfPackage || false,
        employee_id: currentUserId
    }

    if (id) {
      // UPDATE
      const { error } = await supabase.from('visa_applications').update(payload).eq('id', id)
      if (error) throw error
    } else {
      // INSERT
      const { error } = await supabase.from('visa_applications').insert({
        ...payload,
        application_date: new Date().toISOString(),
        is_loyalty_claimed: false
      })
      if (error) throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Visa Save Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
