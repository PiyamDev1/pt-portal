import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const body = await request.json()
    const { action, id, data, authCode, userId } = body

    // ---------------------------------------------------------
    // HANDLE DELETION
    // ---------------------------------------------------------
    if (action === 'delete') {
      // 1. Verify Auth Code (Simple check - enhance as needed)
      if (!authCode) {
        return apiError('Auth code required', 403)
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
      const { error } = await supabase.from('applications').delete().eq('id', id)

      if (error) throw error

      return apiOk({
        deletedPassportApplicationId: id,
      })
    }

    // ---------------------------------------------------------
    // HANDLE UPDATE
    // ---------------------------------------------------------
    if (action === 'update') {
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
      const { error: ppError } = await supabase
        .from('pakistani_passport_applications')
        .update({
          application_type: data.applicationType,
          category: data.category,
          page_count: data.pageCount,
          speed: data.speed,
          old_passport_number: data.oldPassportNumber || null,
          fingerprints_completed: data.fingerprintsCompleted,
          family_head_email: data.familyHeadEmail || null,
        })
        .eq('id', passportId)

      if (ppError) throw ppError

      return apiOk({
        updatedPassportApplicationId: passportId,
        updatedApplicationId: applicationId,
      })
    }

    return apiError('Invalid action', 400)
  } catch (error) {
    console.error('Manage Record Error:', error)
    return apiError(toErrorMessage(error), 500)
  }
}
