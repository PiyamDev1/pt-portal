/**
 * POST /api/passports/pak/update-status
 * Updates Pakistani passport status and writes status-history records.
 *
 * @module app/api/passports/pak/update-status
 */
import { z } from 'zod'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { tryGenerateReceiptForStatusTrigger } from '@/lib/services/receiptGenerator'

const DB_STATUS_MAP = {
  'Pending Submission': 'Pending Submission',
  'Biometrics Taken': 'Biometrics Taken',
  Processing: 'Processing',
  Approved: 'Approved',
  'Passport Arrived': 'Passport Arrived',
  Collected: 'Collected',
  Cancelled: 'Cancelled',
} as const

type PassportStatus = keyof typeof DB_STATUS_MAP

const ALLOWED_PASSPORT_STATUSES = new Set<string>(Object.keys(DB_STATUS_MAP))
const updatePassportStatusSchema = z.object({
  passportId: z.string().trim().min(1).max(200),
  status: z.string().trim().min(1).max(100),
  newPassportNo: z.string().trim().max(100).optional(),
  isCollected: z.boolean().optional(),
  oldPassportReturned: z.boolean().optional(),
  isRefunded: z.boolean().optional(),
})

type PassportStatusUpdate = {
  status: (typeof DB_STATUS_MAP)[PassportStatus]
  employee_id: string
  new_passport_number?: string
  is_old_passport_returned?: boolean
  is_refunded?: boolean
  refunded_at?: string | null
}

export async function POST(request: Request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const supabase = getServiceSupabaseClient()
    const { data: body, error: bodyError } = await parseBodyWithSchema(
      request,
      updatePassportStatusSchema,
      { maxBytes: 16 * 1024 },
    )
    if (bodyError || !body) return apiError(bodyError || 'Missing passportId or status', 400)

    const { passportId, status, newPassportNo, oldPassportReturned, isRefunded } = body
    const userId = access.user.id

    if (!ALLOWED_PASSPORT_STATUSES.has(status)) {
      return apiError(`Invalid status: ${status}`, 400)
    }

    const passportStatus = status as PassportStatus
    const updateData: PassportStatusUpdate = {
      status: DB_STATUS_MAP[passportStatus],
      employee_id: userId,
    }

    if (newPassportNo !== undefined) updateData.new_passport_number = newPassportNo
    if (oldPassportReturned !== undefined) {
      updateData.is_old_passport_returned = oldPassportReturned
    }
    if (isRefunded !== undefined) {
      updateData.is_refunded = isRefunded
      updateData.refunded_at = isRefunded ? new Date().toISOString() : null
    }

    if (passportStatus === 'Collected') {
      let hasNumber = Boolean(newPassportNo)

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

    const { error } = await supabase
      .from('pakistani_passport_applications')
      .update(updateData)
      .eq('id', passportId)

    if (error) throw new Error(`Database Error: ${error.message}`)

    await supabase.from('pakistani_passport_status_history').insert({
      passport_application_id: passportId,
      new_status: passportStatus,
      changed_by: userId,
    })

    await tryGenerateReceiptForStatusTrigger({
      serviceType: 'pk_passport',
      serviceRecordId: passportId,
      status: passportStatus,
      isRefunded: Boolean(isRefunded),
      generatedBy: userId || null,
    })

    return apiOk({ updatedPassportId: passportId, status: passportStatus })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to update passport status'), 500)
  }
}
