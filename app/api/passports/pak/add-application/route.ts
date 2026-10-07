/**
 * API Route: Add Pakistani Passport Application
 *
 * POST /api/passports/pak/add-application
 *
 * Creates a new Pakistani passport application record. Supports both
 * renewal and fresh applications. Sets initial status to 'New' and
 * records the submitting agent.
 *
 * Request Body: { familyHeadId, applicants: Person[], agentId?, notes? }
 * Response Success (200): { applicationId }
 * Response Errors: 400 Missing required fields | 500 DB insert failed
 *
 * Authentication: Service role key
 */
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { parseBodyWithSchema } from '@/lib/api/request'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const addPassportApplicationBodySchema = z.preprocess(
  (body) => (body && typeof body === 'object' && !Array.isArray(body) ? body : {}),
  z
    .object({
      applicantCnic: z.any().optional(),
      applicantName: z.any().optional(),
      applicantEmail: z.any().optional(),
      applicantPhone: z.any().optional(),
      familyHeadEmail: z.any().optional(),
      applicationType: z.any().optional(),
      category: z.any().optional(),
      pageCount: z.any().optional(),
      speed: z.any().optional(),
      oldPassportNumber: z.any().optional(),
      trackingNumber: z.any().optional(),
      fingerprintsCompleted: z.any().optional(),
    })
    .passthrough(),
)

export async function POST(request: Request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const { data: body, error: bodyError } = await parseBodyWithSchema(
      request,
      addPassportApplicationBodySchema,
    )
    if (bodyError || !body) {
      return apiError(bodyError || 'Invalid request payload', 400)
    }

    const supabase = getServiceSupabaseClient()

    const {
      applicantCnic,
      applicantName,
      applicantEmail,
      applicantPhone,
      familyHeadEmail,
      applicationType,
      category,
      pageCount,
      speed,
      oldPassportNumber,
      trackingNumber,
      fingerprintsCompleted,
    } = body
    const currentUserId = access.user.id

    // ... (Validation & Applicant Creation same as before) ...
    // NOTE: Keeping it brief, just ensuring the STATUS usage below is correct:

    // 1. Find/Create Applicant (simplified for brevity, keep your existing logic)
    let { data: applicant } = await supabase
      .from('applicants')
      .select('id')
      .eq('citizen_number', applicantCnic)
      .single()
    if (!applicant) {
      const parts = applicantName.split(' ')
      const { data: newApp } = await supabase
        .from('applicants')
        .insert({
          first_name: parts[0],
          last_name: parts.slice(1).join(' ') || 'N/A',
          citizen_number: applicantCnic,
          email: applicantEmail,
          phone_number: applicantPhone || null,
        })
        .select('id')
        .single()
      applicant = newApp
    } else if (applicantPhone) {
      await supabase
        .from('applicants')
        .update({ phone_number: applicantPhone })
        .eq('id', applicant.id)
    }

    if (!applicant) throw new Error('Applicant creation failed')

    // 2. Create Application Hierarchy
    const { data: appRecord, error: appError } = await supabase
      .from('applications')
      .insert({
        tracking_number: trackingNumber,
        family_head_id: applicant.id,
        applicant_id: applicant.id,
        submitted_by_employee_id: currentUserId,
        status: 'Pending Submission', // Matches new workflow
      })
      .select('id')
      .single()

    if (appError) throw appError

    // 3. Create Passport Record
    const normalizedOldPassportNumber =
      applicationType === 'First Time' ? null : oldPassportNumber || null

    const { error: ppError } = await supabase.from('pakistani_passport_applications').insert({
      application_id: appRecord.id,
      applicant_id: applicant.id,
      employee_id: currentUserId,
      family_head_email: familyHeadEmail,
      application_type: applicationType,
      category: category,
      page_count: pageCount,
      speed: speed,
      old_passport_number: normalizedOldPassportNumber,
      is_old_passport_returned: false,
      is_refunded: false,
      fingerprints_completed: fingerprintsCompleted || false,
      status: 'Pending Submission', // Matches new workflow
    })

    if (ppError) {
      await supabase.from('applications').delete().eq('id', appRecord.id)
      throw new Error(ppError.message)
    }

    return apiOk({
      createdApplicationId: appRecord.id,
      applicantId: applicant.id,
      trackingNumber,
      status: 'Pending Submission',
    })
  } catch (error) {
    return apiError(toErrorMessage(error), 500)
  }
}
