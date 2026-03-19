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

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const { nadraId, complaintNumber, details, userId } = await request.json()
    const normalizedComplaintNumber = String(complaintNumber || '').trim()
    const normalizedDetails = String(details || '').trim()

    if (!nadraId) {
      return apiError('Missing Nadra ID', 400)
    }

    if (!normalizedComplaintNumber) {
      return apiError('Complaint number is required', 400)
    }

    if (!normalizedDetails) {
      return apiError('Complaint details are required', 400)
    }

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
      changed_by: userId,
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
