/**
 * POST /api/visas/save
 * Creates or updates a visa application record.
 *
 * @module app/api/visas/save
 */

import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { z } from 'zod'
import { parseBodyWithSchema } from '@/lib/api/request'

const visaSaveSchema = z
  .object({
    id: z.string().trim().max(200).optional(),
    applicantName: z.string().trim().min(1, 'Applicant name is required').max(300),
    applicantPassport: z.string().trim().max(100).optional().nullable(),
    applicantDob: z.string().trim().max(20).optional().nullable(),
    applicantNationality: z.string().trim().max(100).optional().nullable(),
    countryId: z.union([z.number(), z.string()]),
    visaTypeName: z.string().trim().max(200).optional().nullable(),
    validity: z.string().trim().max(200).optional().nullable(),
    internalTrackingNo: z.string().trim().max(200).optional().nullable(),
    customerPrice: z.coerce.number().nonnegative().max(10_000_000).optional(),
    basePrice: z.coerce.number().nonnegative().max(10_000_000).optional(),
    costCurrency: z.string().trim().min(3).max(10).optional(),
    isPartOfPackage: z.boolean().optional(),
    status: z.string().trim().max(100).optional(),
  })
  .passthrough()

export const dynamic = 'force-dynamic'

export async function POST(request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const { data: body, error: bodyError } = await parseBodyWithSchema(request, visaSaveSchema, {
      maxBytes: 32 * 1024,
    })
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)
    const {
      id,
      applicantName,
      applicantPassport,
      applicantDob,
      applicantNationality,
      countryId, // CHANGED: We now expect an ID, not a name
      visaTypeName, // Visa Types remain dynamic
      validity,
      internalTrackingNo,
      customerPrice,
      basePrice,
      costCurrency,
      isPartOfPackage,
      status,
    } = body
    const currentUserId = access.user.id

    const countryIdNum = Number(countryId)
    if (!countryId || Number.isNaN(countryIdNum)) {
      return apiError('Please select a valid Country from the list.', 400)
    }

    // 2. DYNAMIC VISA TYPE scoped to country
    let typeId = null
    if (visaTypeName) {
      const { data: existingType } = await supabase
        .from('visa_types')
        .select('id')
        .eq('country_id', countryIdNum)
        .ilike('name', visaTypeName.trim())
        .single()

      if (existingType) {
        typeId = existingType.id
      } else {
        const { data: newType, error: tErr } = await supabase
          .from('visa_types')
          .insert({ name: visaTypeName.trim(), country_id: countryIdNum })
          .select('id')
          .single()
        if (tErr) throw new Error(`Visa Type Error: ${tErr.message}`)
        typeId = newType.id
      }
    }

    // 2. APPLICANT LOGIC
    let applicantId = null
    let query = supabase.from('applicants').select('id')

    // Search by passport first, then name if passport is missing (legacy support)
    if (applicantPassport) query = query.eq('passport_number', applicantPassport)
    else
      query = query
        .eq('first_name', applicantName.split(' ')[0])
        .eq('last_name', applicantName.split(' ').slice(1).join(' ') || '.')

    const { data: existingApp } = await query.maybeSingle() // Use maybeSingle to avoid 406 error

    if (existingApp) {
      applicantId = existingApp.id
      // Keep applicant record fresh with latest details
      await supabase
        .from('applicants')
        .update({
          dob: applicantDob || null,
          nationality: applicantNationality || null,
        })
        .eq('id', existingApp.id)
    } else {
      const nameParts = applicantName.split(' ')
      const { data: newApp, error: aErr } = await supabase
        .from('applicants')
        .insert({
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(' ') || '.',
          passport_number: applicantPassport,
          dob: applicantDob || null,
          nationality: applicantNationality || null,
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
      visa_country_id: countryIdNum, // Using the ID from the dropdown
      visa_type_id: typeId,
      validity: validity,
      passport_number_used: applicantPassport,
      customer_price: customerPrice || 0,
      base_price: basePrice || 0,
      cost_currency: costCurrency || 'GBP',
      status: status || 'Pending',
      is_part_of_package: isPartOfPackage || false,
      employee_id: currentUserId,
    }

    if (id) {
      // UPDATE
      const { error } = await supabase.from('visa_applications').update(payload).eq('id', id)
      if (error) throw new Error(error.message || 'Failed to update visa application')
    } else {
      // INSERT
      const { error } = await supabase.from('visa_applications').insert({
        ...payload,
        application_date: new Date().toISOString(),
        is_loyalty_claimed: false,
      })
      if (error) throw new Error(error.message || 'Failed to create visa application')
    }

    return apiOk({ operation: id ? 'updated' : 'created' })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to save visa application'), 500)
  }
}
