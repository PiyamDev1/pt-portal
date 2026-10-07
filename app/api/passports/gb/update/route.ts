/**
 * POST /api/passports/gb/update
 * Updates applicant details and the PEX reference for a GB passport application.
 * Pricing snapshots and status transitions are handled separately.
 *
 * @module app/api/passports/gb/update
 */
import { z } from 'zod'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireStaffSession } from '@/lib/auth/staffSession'

const updateGbPassportSchema = z.object({
  id: z.string().trim().min(1, 'Passport application ID is required').max(200),
  applicantName: z.string().max(250).optional(),
  applicantPassport: z.string().max(100).optional(),
  dateOfBirth: z.string().max(30).optional(),
  phoneNumber: z.string().max(50).optional(),
  pexNumber: z.string().max(100).optional(),
})

export async function POST(request: Request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const { data: body, error: bodyError } = await parseBodyWithSchema(
      request,
      updateGbPassportSchema,
      { maxBytes: 16 * 1024 },
    )
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)

    const supabase = getServiceSupabaseClient()
    const { data: application, error: lookupError } = await supabase
      .from('british_passport_applications')
      .select('applicant_id')
      .eq('id', body.id)
      .maybeSingle()

    if (lookupError) throw new Error(`Application lookup failed: ${lookupError.message}`)
    if (!application) return apiError('Application not found', 404)

    const applicantUpdate: Record<string, string> = {}
    if (body.applicantName) {
      const nameParts = body.applicantName.toLowerCase().trim().split(/\s+/)
      applicantUpdate.first_name = nameParts[0]
      applicantUpdate.last_name = nameParts.slice(1).join(' ') || '.'
    }
    if (body.applicantPassport) applicantUpdate.passport_number = body.applicantPassport
    if (body.dateOfBirth) applicantUpdate.date_of_birth = body.dateOfBirth
    if (body.phoneNumber) applicantUpdate.phone_number = body.phoneNumber

    if (Object.keys(applicantUpdate).length > 0) {
      if (!application.applicant_id) throw new Error('Application has no linked applicant')

      const { error } = await supabase
        .from('applicants')
        .update(applicantUpdate)
        .eq('id', application.applicant_id)

      if (error) throw new Error(`Failed to update applicant: ${error.message}`)
    }

    if (body.pexNumber) {
      const { error } = await supabase
        .from('british_passport_applications')
        .update({ pex_number: body.pexNumber.toUpperCase() })
        .eq('id', body.id)

      if (error) throw new Error(`Failed to update application: ${error.message}`)
    }

    return apiOk({ updatedPassportId: body.id })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to update application'), 500)
  }
}
