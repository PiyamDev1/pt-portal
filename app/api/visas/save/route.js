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
      id, // If ID exists, it's an EDIT
      applicantName,
      applicantPassport,
      applicantDob, // Added DOB
      countryName,
      visaTypeName, // We accept NAMES, not just IDs
      validity,
      internalTrackingNo,
      customerPrice,
      basePrice,
      costCurrency,
      isPartOfPackage, // Added Package Flag
      currentUserId,
      status
    } = body

    // 1. DYNAMIC COUNTRY: Find or Create
    let countryId = null
    if (countryName) {
      const { data: existingCountry } = await supabase
        .from('visa_countries')
        .select('id')
        .ilike('name', countryName.trim()) // Case insensitive match
        .single()

      if (existingCountry) {
        countryId = existingCountry.id
      } else {
        const { data: newCountry, error: cErr } = await supabase
          .from('visa_countries')
          .insert({ name: countryName.trim() }) // DB trigger/default should handle UUID
          .select('id')
          .single()
        if (cErr) throw new Error(`Country Error: ${cErr.message}`)
        countryId = newCountry.id
      }
    }

    // 2. DYNAMIC VISA TYPE: Find or Create
    let typeId = null
    if (visaTypeName) {
      const { data: existingType } = await supabase
        .from('visa_types')
        .select('id')
        .ilike('name', visaTypeName.trim())
        .single()

      if (existingType) {
        typeId = existingType.id
      } else {
        // New types default to 0 price unless edited later
        const { data: newType, error: tErr } = await supabase
          .from('visa_types')
          .insert({ name: visaTypeName.trim() })
          .select('id')
          .single()
        if (tErr) throw new Error(`Visa Type Error: ${tErr.message}`)
        typeId = newType.id
      }
    }

    // 3. APPLICANT: Find or Create (by Passport)
    // Passport number is required for visas
    if (!applicantPassport) {
      return NextResponse.json({ error: "Passport Number is required" }, { status: 400 })
    }
    
    let applicantId = null
    const { data: existingApp } = await supabase
      .from('applicants')
      .select('id')
      .eq('passport_number', applicantPassport)
      .single()

    if (existingApp) {
      applicantId = existingApp.id
      // OPTIONAL: Update DOB/Name if missing? 
      // For now, we just link.
    } else {
      const nameParts = applicantName.split(' ')
      const { data: newApp, error: aErr } = await supabase
        .from('applicants')
        .insert({
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(' ') || '.',
          passport_number: applicantPassport,
          dob: applicantDob || null // Save DOB
        })
        .select('id')
        .single()
      if (aErr) throw new Error(`Applicant Error: ${aErr.message}`)
      applicantId = newApp.id
    }

    // 4. SAVE APPLICATION (Insert or Update)
    const payload = {
      internal_tracking_number: internalTrackingNo,
      applicant_id: applicantId,
      visa_country_id: countryId,
      visa_type_id: typeId,
      validity: validity,
      passport_number_used: applicantPassport,
      customer_price: customerPrice || 0,
      base_price: basePrice || 0,
      cost_currency: costCurrency || 'GBP',
      status: status || 'Pending',
      is_part_of_package: isPartOfPackage || false, // Save Package Flag
      employee_id: currentUserId,
      notes: null // Removed notes as requested
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
