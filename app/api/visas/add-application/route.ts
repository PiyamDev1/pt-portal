/**
 * POST /api/visas/add-application
 * Creates a new visa application with applicant and pricing fields.
 *
 * @module app/api/visas/add-application
 */

import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { parseBodyWithSchema } from '@/lib/api/request'
import { z } from 'zod'

const addVisaApplicationBodySchema = z
  .object({
    applicantName: z.any().optional(),
    applicantPassport: z.any().optional(),
    countryId: z.any().optional(),
    visaTypeId: z.any().optional(),
    customerPrice: z.any().optional(),
    basePrice: z.any().optional(),
    costCurrency: z.any().optional(),
    notes: z.any().optional(),
    internalTrackingNo: z.any().optional(),
  })
  .passthrough()

export async function POST(request: Request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const { data: body, error: bodyError } = await parseBodyWithSchema(
      request,
      addVisaApplicationBodySchema,
    )
    if (bodyError || !body) {
      return apiError(bodyError || 'Invalid request payload', 400)
    }

    const supabase = getServiceSupabaseClient()

    const {
      applicantName,
      applicantPassport,
      countryId,
      visaTypeId,
      customerPrice,
      basePrice,
      costCurrency,
      notes,
      internalTrackingNo,
    } = body
    const currentUserId = access.user.id

    // 1. Find or Create Applicant
    // We search by Passport Number for Visas (usually more reliable than Name)
    let { data: applicant } = await supabase
      .from('applicants')
      .select('id')
      .eq('passport_number', applicantPassport)
      .single()

    if (!applicant) {
      const nameParts = applicantName.split(' ')
      const { data: newApp, error: createError } = await supabase
        .from('applicants')
        .insert({
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(' ') || '.',
          passport_number: applicantPassport,
        })
        .select('id')
        .single()

      if (createError) throw new Error(`Applicant Creation Failed: ${createError.message}`)
      applicant = newApp
    }

    // 2. Insert Visa Application
    const { error } = await supabase.from('visa_applications').insert({
      internal_tracking_number: internalTrackingNo,
      applicant_id: applicant.id,
      employee_id: currentUserId,
      visa_country_id: countryId,
      visa_type_id: visaTypeId,
      application_date: new Date().toISOString(),
      passport_number_used: applicantPassport,
      customer_price: customerPrice || 0,
      base_price: basePrice || 0,
      cost_currency: costCurrency || 'GBP',
      notes: notes,
      status: 'Pending',
      is_loyalty_claimed: false,
    })

    if (error) throw new Error(error.message || 'Failed to create visa application')

    return apiOk({
      applicationCreatedForApplicantId: applicant.id,
      internalTrackingNo,
    })
  } catch (error) {
    const errorMessage = toErrorMessage(error, 'Failed to add visa application')
    return apiError(errorMessage, 500)
  }
}
