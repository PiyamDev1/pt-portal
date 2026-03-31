/**
 * API Route: Add NADRA Application
 *
 * POST /api/nadra/add-application
 *
 * Creates a new NADRA/identity document application record, supporting both
 * single-person submissions and family group (head + family members) entries.
 * Sets initial status to 'New' and records the submitting agent.
 *
 * Request Body: { familyHeadId, persons: NadraPerson[], agentId?, notes? }
 * Response Success (200): { applicationId }
 * Response Errors: 400 Missing required fields | 500 DB insert failed
 *
 * Authentication: Service role key
 */
import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const getDuplicateConflict = (error) => {
  const code = String(error?.code || '')
  const message = String(error?.message || '')
  const details = String(error?.details || '')
  const hint = String(error?.hint || '')
  const combined = `${message} ${details} ${hint}`.toLowerCase()

  if (code !== '23505' && !combined.includes('duplicate')) {
    return null
  }

  if (
    combined.includes('applications_tracking_number_key') ||
    combined.includes('tracking_number')
  ) {
    return {
      type: 'tracking',
      error: 'Duplicate Tracking Number',
      details: 'This tracking number already exists.',
      errorCode: 'DUPLICATE_TRACKING',
    }
  }

  if (
    combined.includes('applicants_citizen_number_key') ||
    combined.includes('citizen_number') ||
    combined.includes('cnic')
  ) {
    return {
      type: 'cnic',
      error: 'Duplicate CNIC',
      details: 'This citizen number already exists.',
      errorCode: 'DUPLICATE_CNIC',
    }
  }

  return {
    type: 'duplicate',
    error: 'Duplicate Record',
    details: 'This record already exists.',
    errorCode: 'DUPLICATE_RECORD',
  }
}

export async function POST(request) {
  let normalizedTrackingNumber = ''
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const body = await request.json()
    const {
      applicantCnic,
      applicantName,
      applicantEmail,
      familyHeadCnic,
      familyHeadName,
      familyHeadPhone,
      serviceType,
      serviceOption,
      trackingNumber,
      pin,
      currentUserId,
    } = body
    normalizedTrackingNumber = String(trackingNumber || '')
      .trim()
      .toUpperCase()

    if (!normalizedTrackingNumber) {
      return apiError('Tracking number is required', 400)
    }

    // 1. Find or Create Applicant
    let applicant = null
    const hasCnic = applicantCnic && applicantCnic.trim() !== ''

    if (hasCnic) {
      // Existing adult flow: search by CNIC
      const { data: existing } = await supabase
        .from('applicants')
        .select('id, email')
        .eq('citizen_number', applicantCnic)
        .maybeSingle()

      if (existing) {
        applicant = existing
        // Update email if missing
        if (applicantEmail && !existing.email) {
          await supabase.from('applicants').update({ email: applicantEmail }).eq('id', existing.id)
          applicant = { ...existing, email: applicantEmail }
        }
      } else {
        const parts = applicantName.split(' ')
        const { data: newApp, error } = await supabase
          .from('applicants')
          .insert({
            first_name: parts[0],
            last_name: parts.slice(1).join(' ') || 'N/A',
            citizen_number: applicantCnic,
            email: applicantEmail || null,
            is_new_born: false,
          })
          .select('id, email')
          .single()
        if (error) throw error
        applicant = newApp
      }
    } else {
      // New born: no CNIC provided, always create fresh
      const parts = applicantName.split(' ')
      const { data: newBaby, error } = await supabase
        .from('applicants')
        .insert({
          first_name: parts[0],
          last_name: parts.slice(1).join(' ') || '.',
          citizen_number: null,
          is_new_born: true,
          email: applicantEmail || null,
        })
        .select('id, email')
        .single()
      if (error) throw error
      applicant = newBaby
    }

    if (!applicant?.id) {
      throw new Error('Applicant not found or created')
    }

    // 2. Find or Create Family Head
    let headId = null
    if (familyHeadCnic) {
      let { data: head } = await supabase
        .from('applicants')
        .select('id, phone_number')
        .eq('citizen_number', familyHeadCnic)
        .maybeSingle()

      if (!head && familyHeadName) {
        const parts = familyHeadName.split(' ')
        const { data: newHead } = await supabase
          .from('applicants')
          .insert({
            first_name: parts[0],
            last_name: parts.slice(1).join(' ') || 'N/A',
            citizen_number: familyHeadCnic,
            phone_number: familyHeadPhone || null,
          })
          .select('id')
          .single()
        headId = newHead?.id || null
      } else {
        headId = head?.id || null
        if (headId && familyHeadPhone && familyHeadPhone !== head?.phone_number) {
          await supabase
            .from('applicants')
            .update({ phone_number: familyHeadPhone })
            .eq('id', headId)
        }
      }
    }

    // 3. FIND EXISTING APPLICATION OR INSERT NEW MASTER RECORD
    const { data: existingApplication, error: existingApplicationError } = await supabase
      .from('applications')
      .select('id, applicant_id')
      .eq('tracking_number', normalizedTrackingNumber)
      .maybeSingle()

    if (existingApplicationError) {
      return apiError('Database error', 500, {
        details: existingApplicationError.message,
      })
    }

    let appRecord = existingApplication
    if (existingApplication?.id) {
      const { data: existingService, error: existingServiceError } = await supabase
        .from('nadra_services')
        .select('id')
        .eq('application_id', existingApplication.id)
        .maybeSingle()

      if (existingServiceError) {
        return apiError('Database error', 500, {
          details: existingServiceError.message,
        })
      }

      if (existingService?.id) {
        return apiError('Duplicate Tracking Number', 409, {
          details: 'This tracking number already exists.',
          errorCode: 'DUPLICATE_TRACKING',
          existingApplicationId: existingApplication.id,
          existingNadraServiceId: existingService.id,
          trackingNumber: normalizedTrackingNumber,
        })
      }
      // If there is an application row but no NADRA service row,
      // continue and attach service/history to recover from prior partial saves.
    } else {
      const { data: insertedApplication, error: appError } = await supabase
        .from('applications')
        .insert({
          tracking_number: normalizedTrackingNumber,
          family_head_id: headId || applicant.id,
          applicant_id: applicant.id,
          submitted_by_employee_id: currentUserId,
          status: 'Pending Submission',
        })
        .select('id, applicant_id')
        .single()

      if (appError) {
        const duplicateConflict = getDuplicateConflict(appError)
        if (duplicateConflict) {
          const { data: conflictApplication } = await supabase
            .from('applications')
            .select('id')
            .eq('tracking_number', normalizedTrackingNumber)
            .maybeSingle()

          return apiError(duplicateConflict.error, 409, {
            details: duplicateConflict.details,
            errorCode: duplicateConflict.errorCode,
            existingApplicationId: conflictApplication?.id || null,
            trackingNumber: normalizedTrackingNumber,
          })
        }

        return apiError('Database error', 500, {
          details: appError.message,
        })
      }

      appRecord = insertedApplication
    }

    // 4. INSERT NADRA SERVICE (Linked to Application) with duplicate handling
    const payload = {
      application_id: appRecord.id,
      applicant_id: appRecord.applicant_id || applicant.id,
      employee_id: currentUserId,
      service_type: serviceType,
      tracking_number: normalizedTrackingNumber,
      application_pin: pin || null,
      status: 'Pending Submission',
    }

    const { data: nadraRecord, error: nadraError } = await supabase
      .from('nadra_services')
      .insert(payload)
      .select()
      .single()

    if (nadraError) {
      const duplicateConflict = getDuplicateConflict(nadraError)
      if (duplicateConflict) {
        return apiError(duplicateConflict.error, 409, {
          details: duplicateConflict.details,
          errorCode: duplicateConflict.errorCode,
          trackingNumber: normalizedTrackingNumber,
        })
      }

      return apiError('Database error', 500, {
        details: nadraError.message,
      })
    }

    // 5. Dual Table Logic: nicop_cnic_details
    if (serviceOption) {
      const { error: detailsError } = await supabase.from('nicop_cnic_details').insert({
        id: nadraRecord.id,
        service_option: serviceOption,
      })
    }

    // 6. Insert initial status history record
    const { error: historyError } = await supabase.from('nadra_status_history').insert({
      nadra_service_id: nadraRecord.id,
      new_status: 'Pending Submission',
      changed_by: currentUserId,
      entry_type: 'status',
    })
    if (historyError) throw new Error(historyError.message)

    return apiOk({
      createdNadraServiceId: nadraRecord.id,
      applicationId: appRecord.id,
      applicantId: applicant.id,
      trackingNumber: normalizedTrackingNumber,
      status: nadraRecord.status,
    })
  } catch (error) {
    console.error('[NADRA API] Unexpected error:', error)

    const duplicateConflict = getDuplicateConflict(error)
    if (duplicateConflict) {
      return apiError(duplicateConflict.error, 409, {
        details: duplicateConflict.details,
        errorCode: duplicateConflict.errorCode,
        trackingNumber: normalizedTrackingNumber,
      })
    }

    return apiError('Internal server error', 500, {
      details: toErrorMessage(error),
    })
  }
}
