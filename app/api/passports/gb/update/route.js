/**
 * POST /api/passports/gb/update
 * Updates an existing GB passport application and appends status history changes.
 *
 * @module app/api/passports/gb/update
 */

import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { tryGenerateReceiptForStatusTrigger } from '@/lib/services/receiptGenerator'

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
      id,
      status,
      notes,
      userId,
      applicantName,
      applicantPassport,
      dateOfBirth,
      phoneNumber,
      pexNumber,
      pricingId,
      ageGroup,
      pages,
      serviceType,
    } = body

    // Get the applicant ID and current status (BEFORE any updates)
    const { data: gbApp, error: gbErr } = await supabase
      .from('british_passport_applications')
      .select('applicant_id, status, pricing_id, age_group, pages, service_type')
      .eq('id', id)
      .single()

    if (gbErr || !gbApp) {
      throw new Error('Application not found')
    }

    const oldStatus = gbApp.status
    const resolvedPricing = await findGbPassportPricing(supabase, {
      pricingId: pricingId || gbApp.pricing_id,
      ageGroup: ageGroup || gbApp.age_group,
      pages: pages || gbApp.pages,
      serviceType: serviceType || gbApp.service_type,
    })

    // Update applicant record if any applicant fields provided
    const applicantUpdate = {}
    if (applicantName) {
      const parts = applicantName.toLowerCase().split(' ')
      applicantUpdate.first_name = parts[0]
      applicantUpdate.last_name = parts.slice(1).join(' ') || '.'
    }
    if (applicantPassport) applicantUpdate.passport_number = applicantPassport
    if (dateOfBirth) applicantUpdate.date_of_birth = dateOfBirth
    if (phoneNumber) applicantUpdate.phone_number = phoneNumber

    if (Object.keys(applicantUpdate).length > 0) {
      const { error: aErr } = await supabase
        .from('applicants')
        .update(applicantUpdate)
        .eq('id', gbApp.applicant_id)

      if (aErr) throw new Error(`Failed to update applicant: ${aErr.message}`)
    }

    // Update british_passport_applications record
    const gbUpdate = {}
    if (pexNumber) gbUpdate.pex_number = pexNumber.toUpperCase()
    if (status) gbUpdate.status = status
    gbUpdate.pricing_id = resolvedPricing.id
    gbUpdate.cost_price = resolvedPricing.cost_price
    gbUpdate.sale_price = resolvedPricing.sale_price
    gbUpdate.age_group = resolvedPricing.age_group
    gbUpdate.pages = resolvedPricing.pages
    gbUpdate.service_type = resolvedPricing.service_type

    const { error: gbUpdateErr } = await supabase
      .from('british_passport_applications')
      .update(gbUpdate)
      .eq('id', id)

    if (gbUpdateErr) throw new Error(`Failed to update application: ${gbUpdateErr.message}`)

    // Log status history if status changed
    if (status && status !== oldStatus) {
      await supabase.from('british_passport_status_history').insert({
        passport_id: id,
        old_status: oldStatus,
        new_status: status,
        notes: notes || null,
        changed_by: userId,
      })

      await tryGenerateReceiptForStatusTrigger({
        serviceType: 'gb_passport',
        serviceRecordId: id,
        status,
        generatedBy: userId || null,
      })
    }

    return apiOk({ updatedPassportId: id })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to update application'), 500)
  }
}
