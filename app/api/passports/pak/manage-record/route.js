/**
 * API Route: Manage Pakistani Passport Record
 *
 * POST /api/passports/pak/manage-record
 *   Handles multiple sub-actions for an existing passport application:
 *   - update: edit mutable fields (MRP number, agent, fees, etc.)
 *   - delete: soft-delete / cancel the record
 *
 * Request Body: { action: 'update' | 'delete', applicationId, ...fields }
 * Response Success (200): { result }
 * Response Errors: 400 Invalid action | 404 Record not found | 500 DB error
 *
 * Authentication: Service role key
 */
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { parseBodyWithSchema } from '@/lib/api/request'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { verifyFreshSecondFactor } from '@/lib/auth/freshSecondFactor'

const manageRecordSchema = z.object({
  action: z.enum(['update', 'delete', 'mark_page_provided']),
  id: z.string().trim().min(1, 'Record ID is required'),
  passportId: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
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

    const { data: body, error: bodyError } = await parseBodyWithSchema(request, manageRecordSchema)
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)
    const { action, id, data, authCode, verificationCode, verificationMethod } = body
    const userId = access.user.id

    // ---------------------------------------------------------
    // HANDLE DELETION
    // ---------------------------------------------------------
    if (action === 'delete') {
      const verification = await verifyFreshSecondFactor({
        userId,
        code: verificationCode || authCode,
        method: verificationMethod,
      })
      if (!verification.verified) {
        return apiError(verification.error, 403)
      }

      // 2. Fetch data before deleting (for logging/audit if needed)
      const { data: recordToDelete } = await supabase
        .from('pakistani_passport_applications')
        .select('*, applications(tracking_number)')
        .eq('id', id)
        .single()

      if (!recordToDelete) return apiError('Record not found', 404)

      // 3. Perform Deletion (Cascade will handle the passport details if we delete the parent application)
      // We delete from 'applications' to remove the root of the hierarchy
      const parentApplicationId = recordToDelete.application_id || id
      const { error } = await supabase.from('applications').delete().eq('id', parentApplicationId)

      if (error) throw error

      await supabase.from('deletion_logs').insert({
        record_type: 'Pakistani Passport Application',
        deleted_record_data: recordToDelete,
        deleted_by: userId,
        auth_code_used: `verified:${verification.method}`,
      })

      return apiOk({
        deletedPassportApplicationId: id,
      })
    }

    // ---------------------------------------------------------
    // HANDLE UPDATE
    // ---------------------------------------------------------
    if (action === 'update') {
      if (!data) return apiError('Update data is required', 400)
      const applicationId = data.applicationId || id
      const passportId = data.passportId || id

      // 1. Update Parent Application (Tracking Number)
      if (data.trackingNumber && applicationId) {
        const { error: appError } = await supabase
          .from('applications')
          .update({ tracking_number: data.trackingNumber })
          .eq('id', applicationId)
        if (appError) throw appError
      }

      // 2. Update Applicant Details
      if (data.applicantId) {
        const { error: applicantError } = await supabase
          .from('applicants')
          .update({
            first_name: data.applicantName?.split(' ')[0],
            last_name: data.applicantName?.split(' ').slice(1).join(' ') || '',
            citizen_number: data.applicantCnic,
            email: data.applicantEmail,
            phone_number: data.applicantPhone,
          })
          .eq('id', data.applicantId)
        if (applicantError) throw applicantError
      }

      // 3. Update Passport Details
      const passportUpdatePayload = {
        application_type: data.applicationType,
        category: data.category,
        page_count: data.pageCount,
        speed: data.speed,
        old_passport_number: data.oldPassportNumber || null,
        fingerprints_completed: data.fingerprintsCompleted,
        family_head_email: data.familyHeadEmail || null,
        requested_page_number: data.requestedPageNumber?.trim() || null,
        requested_page_provided: !!data.requestedPageProvided && !!data.requestedPageNumber?.trim(),
      }

      const { error: ppError } = await supabase
        .from('pakistani_passport_applications')
        .update(passportUpdatePayload)
        .eq('id', passportId)

      if (ppError) throw ppError

      return apiOk({
        updatedPassportApplicationId: passportId,
        updatedApplicationId: applicationId,
      })
    }

    if (action === 'mark_page_provided') {
      const applicationId = id
      const passportId = body.passportId

      if (!applicationId || !passportId) {
        return apiError('applicationId and passportId are required', 400)
      }

      const { data: existingRecord, error: existingRecordError } = await supabase
        .from('pakistani_passport_applications')
        .select('id, requested_page_number')
        .eq('id', passportId)
        .single()

      if (existingRecordError) throw existingRecordError

      if (!existingRecord?.requested_page_number) {
        return apiError('No requested page is set for this application', 400)
      }

      const { error: providedError } = await supabase
        .from('pakistani_passport_applications')
        .update({
          requested_page_provided: true,
          employee_id: userId,
        })
        .eq('id', passportId)

      if (providedError) throw providedError

      return apiOk({
        updatedPassportApplicationId: passportId,
        updatedApplicationId: applicationId,
        requestedPageProvided: true,
      })
    }

    return apiError('Invalid action', 400)
  } catch (error) {
    console.error('Manage Record Error:', error)
    return apiError(toErrorMessage(error), 500)
  }
}
