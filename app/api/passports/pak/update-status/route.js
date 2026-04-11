/**
 * POST /api/passports/pak/update-status
 * Updates Pakistani passport status and writes status-history records.
 *
 * @module app/api/passports/pak/update-status
 */

import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { tryGenerateReceiptForStatusTrigger } from '@/lib/services/receiptGenerator'

// CONFIG: Map UI Status -> Database Status
// If your DB fails on "Processing", change the right side to "In Progress"
const DB_STATUS_MAP = {
  'Pending Submission': 'Pending Submission',
  'Biometrics Taken': 'Biometrics Taken',
  Processing: 'Processing', // If DB error persists, change this to: 'In Progress'
  Approved: 'Approved',
  'Passport Arrived': 'Passport Arrived',
  Collected: 'Collected',
  Cancelled: 'Cancelled',
}

const ALLOWED_PASSPORT_STATUSES = new Set(Object.keys(DB_STATUS_MAP))

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const body = await request.json()
    const {
      passportId,
      status,
      userId,
      newPassportNo,
      isCollected,
      oldPassportReturned,
      isRefunded,
    } = body

    if (!passportId || !status) {
      return apiError('Missing passportId or status', 400)
    }

    if (!ALLOWED_PASSPORT_STATUSES.has(status)) {
      return apiError(`Invalid status: ${status}`, 400)
    }

    // 1. Resolve DB Status (fallback to provided status)
    const dbStatus = DB_STATUS_MAP[status]

    // 2. Prepare Update Object
    const updateData = {
      status: dbStatus,
      employee_id: userId,
    }

    // Add optional fields if they exist
    if (newPassportNo !== undefined) updateData.new_passport_number = newPassportNo
    if (oldPassportReturned !== undefined) updateData.is_old_passport_returned = oldPassportReturned
    if (isRefunded !== undefined) {
      updateData.is_refunded = !!isRefunded
      updateData.refunded_at = isRefunded ? new Date().toISOString() : null
    }

    // 3. Validation for Collection
    if (status === 'Collected') {
      let hasNumber = !!newPassportNo

      // If number not provided in this request, check if it exists in DB
      if (!hasNumber) {
        const { data } = await supabase
          .from('pakistani_passport_applications')
          .select('new_passport_number')
          .eq('id', passportId)
          .single()
        if (data?.new_passport_number) hasNumber = true
      }

      if (!hasNumber) {
        return apiError('Cannot mark Collected without Passport Number', 400)
      }
    }

    // 4. Perform Update
    const { error } = await supabase
      .from('pakistani_passport_applications')
      .update(updateData)
      .eq('id', passportId)

    if (error) {
      throw new Error(`Database Error: ${error.message}`)
    }

    // 5. Log History
    await supabase.from('pakistani_passport_status_history').insert({
      passport_application_id: passportId,
      new_status: status, // Log the readable UI status
      changed_by: userId,
    })

    await tryGenerateReceiptForStatusTrigger({
      serviceType: 'pk_passport',
      serviceRecordId: passportId,
      status,
      isRefunded: !!isRefunded,
      generatedBy: userId || null,
    })

    return apiOk({ updatedPassportId: passportId, status })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to update passport status'), 500)
  }
}
