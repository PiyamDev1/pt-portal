/**
 * POST /api/passports/gb/update-status
 * Applies a GB passport status transition and records its audit/receipt side effects.
 *
 * @module app/api/passports/gb/update-status
 */
import { z } from 'zod'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { tryGenerateReceiptForStatusTrigger } from '@/lib/services/receiptGenerator'

const updateGbPassportStatusSchema = z.object({
  id: z.string().trim().min(1, 'Passport application ID is required').max(200),
  status: z.string().trim().min(1, 'Status is required').max(100),
  notes: z.string().max(2000).optional(),
})

export async function POST(request: Request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const { data: body, error: bodyError } = await parseBodyWithSchema(
      request,
      updateGbPassportStatusSchema,
      { maxBytes: 16 * 1024 },
    )
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)

    const supabase = getServiceSupabaseClient()
    const { data: application, error: lookupError } = await supabase
      .from('british_passport_applications')
      .select('status')
      .eq('id', body.id)
      .maybeSingle()

    if (lookupError) throw new Error(`Application lookup failed: ${lookupError.message}`)
    if (!application) return apiError('Application not found', 404)

    if (application.status === body.status) {
      return apiOk({ updatedPassportId: body.id, status: body.status })
    }

    const { error: updateError } = await supabase
      .from('british_passport_applications')
      .update({ status: body.status })
      .eq('id', body.id)

    if (updateError) throw new Error(`Failed to update application: ${updateError.message}`)

    // Keep the established best-effort history behavior; this route does not add a schema-level
    // transaction, so a history insert failure must not misreport the status write as rolled back.
    await supabase.from('british_passport_status_history').insert({
      passport_id: body.id,
      old_status: application.status,
      new_status: body.status,
      notes: body.notes || null,
      changed_by: access.user.id,
    })

    await tryGenerateReceiptForStatusTrigger({
      serviceType: 'gb_passport',
      serviceRecordId: body.id,
      status: body.status,
      generatedBy: access.user.id,
    })

    return apiOk({ updatedPassportId: body.id, status: body.status })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to update passport status'), 500)
  }
}
