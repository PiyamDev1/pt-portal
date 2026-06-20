/**
 * POST /api/passports/gb/add
 * Creates a new GB passport application and related applicant/application rows.
 *
 * @module app/api/passports/gb/add
 */

import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

function normalisePricingText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalisePageValue(value) {
  const text = String(value || '').trim()
  const numeric = text.match(/\d+/)?.[0]
  return numeric || normalisePricingText(text)
}

async function findGbPassportPricing(supabase, { pricingId, ageGroup, pages, serviceType }) {
  if (pricingId) {
    const { data: pricingById, error: idError } = await supabase
      .from('gb_passport_pricing')
      .select('id, cost_price, sale_price, age_group, pages, service_type, is_active')
      .eq('id', pricingId)
      .maybeSingle()

    if (idError) throw new Error(`Pricing lookup failed: ${idError.message}`)
    if (pricingById && pricingById.is_active !== false) return pricingById
  }

  const requestedAge = normalisePricingText(ageGroup)
  const requestedPages = normalisePageValue(pages)
  const requestedService = normalisePricingText(serviceType)

  const { data: pricingRows, error } = await supabase
    .from('gb_passport_pricing')
    .select('id, cost_price, sale_price, age_group, pages, service_type, is_active')

  if (error) throw new Error(`Pricing lookup failed: ${error.message}`)

  const pricing = (pricingRows || []).find((row) => {
    if (row.is_active === false) return false
    return (
      normalisePricingText(row.age_group) === requestedAge &&
      normalisePageValue(row.pages) === requestedPages &&
      normalisePricingText(row.service_type) === requestedService
    )
  })

  if (!pricing) {
    throw new Error(
      `Pricing not found for Age "${ageGroup}", Pages "${pages}", Service "${serviceType}"`,
    )
  }

  return pricing
}

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const body = await request.json()
    const {
      applicantName,
      applicantPassport,
      dateOfBirth,
      phoneNumber,
      pexNumber,
      pricingId,
      ageGroup,
      serviceType,
      pages,
      currentUserId,
    } = body

    // 1. LOOKUP FINANCIALS FROM DB (Secure)
    // Prefer an exact pricing record when the frontend already resolved one.
    // Fall back to tolerant matching only when we do not have a pricing ID.
    const pricing = await findGbPassportPricing(supabase, { pricingId, ageGroup, pages, serviceType })

    // 2. Find or Create Applicant
    let applicantId = null
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
        phone_number: phoneNumber,
      }
      if (dateOfBirth) insertData.date_of_birth = dateOfBirth

      const { data: newApp, error: aErr } = await supabase
        .from('applicants')
        .insert(insertData)
        .select('id')
        .single()

      if (aErr) throw new Error(`Applicant Error: ${aErr.message}`)
      applicantId = newApp.id
    }

    // 3. Create Parent Application (The "Folder")
    const trackingNo = `GB-${Date.now().toString().slice(-6)}`
    const { data: parentApp, error: pAppErr } = await supabase
      .from('applications')
      .insert({
        tracking_number: trackingNo,
        family_head_id: applicantId,
        applicant_id: applicantId,
        submitted_by_employee_id: currentUserId,
        status: 'Pending Submission',
      })
      .select('id')
      .single()

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
      status: 'Pending Submission',
    })

    if (gbErr) throw gbErr

    return apiOk({
      applicantId,
      applicationId: parentApp.id,
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to add GB passport application'), 500)
  }
}
