/**
 * POST /api/passports/gb/delete
 * Deletes a GB passport application with authorization code and audit logging.
 *
 * @module app/api/passports/gb/delete
 */

import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { parseBodyWithSchema } from '@/lib/api/request'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { verifyFreshSecondFactor } from '@/lib/auth/freshSecondFactor'

const deletePassportSchema = z.object({
  id: z.string().trim().min(1, 'Passport ID is required'),
  authCode: z.string().optional(),
  verificationCode: z.string().optional(),
  verificationMethod: z.enum(['totp', 'backup', 'auto']).optional(),
})

export async function POST(request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const { data: body, error: bodyError } = await parseBodyWithSchema(
      request,
      deletePassportSchema,
    )
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)
    const { id, authCode, verificationCode, verificationMethod } = body
    const verification = await verifyFreshSecondFactor({
      userId: access.user.id,
      code: verificationCode || authCode,
      method: verificationMethod,
    })
    if (!verification.verified) {
      return apiError(verification.error, 403)
    }

    // Get the record to be deleted
    const { data: gbRecord, error: gbErr } = await supabase
      .from('british_passport_applications')
      .select('*, applications(id), applicants(id)')
      .eq('id', id)
      .single()

    if (gbErr || !gbRecord) {
      return apiError('Record not found', 404)
    }

    // Log deletion
    const { error: logError } = await supabase.from('deletion_logs').insert({
      record_type: 'GB Passport Application',
      deleted_record_data: gbRecord,
      deleted_by: access.user.id,
      auth_code_used: `verified:${verification.method}`,
    })

    if (logError) throw logError

    // Delete the GB passport application
    const { error: deleteGbErr } = await supabase
      .from('british_passport_applications')
      .delete()
      .eq('id', id)

    if (deleteGbErr) throw deleteGbErr

    // Delete parent application if exists
    if (gbRecord.application_id) {
      await supabase.from('applications').delete().eq('id', gbRecord.application_id)
    }

    // Check if applicant has other applications, if not delete
    if (gbRecord.applicant_id) {
      const { data: otherApps } = await supabase
        .from('british_passport_applications')
        .select('id')
        .eq('applicant_id', gbRecord.applicant_id)

      // If no other GB passport apps exist for this applicant, delete applicant
      if (!otherApps || otherApps.length === 0) {
        // Check if applicant has any other application types
        const { data: nadraApps } = await supabase
          .from('nadra_services')
          .select('id')
          .eq('applicant_id', gbRecord.applicant_id)

        const { data: pakApps } = await supabase
          .from('pak_passport_applications')
          .select('id')
          .eq('applicant_id', gbRecord.applicant_id)

        // Only delete applicant if they have no applications anywhere
        if ((!nadraApps || nadraApps.length === 0) && (!pakApps || pakApps.length === 0)) {
          await supabase.from('applicants').delete().eq('id', gbRecord.applicant_id)
        }
      }
    }

    return apiOk({ deletedPassportId: id })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to delete'), 500)
  }
}
