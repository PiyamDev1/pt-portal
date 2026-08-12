/**
 * API Route: File NADRA Complaint
 *
 * POST /api/nadra/complaint
 *
 * Records a complaint or escalation against a NADRA application.
 * Stores the complaint text and updates the application's has_complaint flag.
 *
 * Request Body: { applicationId: string, complaint: string }
 * Response Success (200): { complaintId }
 * Response Errors: 400 Missing fields | 500 DB error
 *
 * Authentication: Service role key
 */
import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { z } from 'zod'
import { parseBodyWithSchema } from '@/lib/api/request'

const complaintSchema = z.object({
  nadraId: z.string({ error: 'Missing Nadra ID' }).trim().min(1, 'Missing Nadra ID').max(200),
  complaintNumber: z
    .string({ error: 'Complaint number is required' })
    .trim()
    .min(1, 'Complaint number is required')
    .max(100),
  details: z
    .string({ error: 'Complaint details are required' })
    .trim()
    .min(1, 'Complaint details are required')
    .max(10_000),
})

export async function POST(request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const { data: body, error: bodyError } = await parseBodyWithSchema(request, complaintSchema, {
      maxBytes: 16 * 1024,
    })
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)
    const { nadraId, complaintNumber: normalizedComplaintNumber, details: normalizedDetails } = body

    const { data: nadraService, error: nadraError } = await supabase
      .from('nadra_services')
      .select('id, status')
      .eq('id', nadraId)
      .single()

    if (nadraError || !nadraService) {
      return apiError('NADRA service not found', 404)
    }

    const { error: historyError } = await supabase.from('nadra_status_history').insert({
      nadra_service_id: nadraId,
      new_status: nadraService.status || 'In Progress',
      changed_by: access.user.id,
      entry_type: 'complaint',
      complaint_number: normalizedComplaintNumber,
      details: normalizedDetails,
    })

    if (historyError) {
      throw new Error(historyError.message || 'Failed to insert complaint history')
    }

    return apiOk({
      complaintRecordedForNadraId: nadraId,
      complaintNumber: normalizedComplaintNumber,
    })
  } catch (error) {
    const errorMessage = toErrorMessage(error, 'Failed to record complaint')
    return apiError(errorMessage, 500)
  }
}
