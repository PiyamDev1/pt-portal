/**
 * POST /api/passports/gb/update
 * Updates an existing GB passport application and appends status history changes.
 *
 * @module app/api/passports/gb/update
 */

import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { tryGenerateReceiptForStatusTrigger } from '@/lib/services/receiptGenerator'

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const body = await request.json()
    const {
      id,
      status,
      notes,
      userId,
      applicantName,
      applicantPassport,
      dateOfBirth,
      phoneNumber,
      pexNumber,
    } = body

    // Get the applicant ID and current status (BEFORE any updates)
    const { data: gbApp, error: gbErr } = await supabase
      .from('british_passport_applications')
      .select('applicant_id, status')
      .eq('id', id)
      .single()

    if (gbErr || !gbApp) {
      throw new Error('Application not found')
    }

    const oldStatus = gbApp.status

    // Update applicant record if any applicant fields provided
    const applicantUpdate = {}
    if (applicantName) {
      const parts = applicantName.toLowerCase().split(' ')
      applicantUpdate.first_name = parts[0]
      applicantUpdate.last_name = parts.slice(1).join(' ') || '.'
    }
    if (applicantPassport) applicantUpdate.passport_number = applicantPassport
    if (dateOfBirth) applicantUpdate.date_of_birth = dateOfBirth
    if (phoneNumber) applicantUpdate.phone_number = phoneNumber

    if (Object.keys(applicantUpdate).length > 0) {
      const { error: aErr } = await supabase
        .from('applicants')
        .update(applicantUpdate)
        .eq('id', gbApp.applicant_id)

      if (aErr) throw new Error(`Failed to update applicant: ${aErr.message}`)
    }

    // Update british_passport_applications record
    const gbUpdate = {}
    if (pexNumber) gbUpdate.pex_number = pexNumber.toUpperCase()
    if (status) gbUpdate.status = status

    if (Object.keys(gbUpdate).length > 0) {
      const { error: gbUpdateErr } = await supabase
        .from('british_passport_applications')
        .update(gbUpdate)
        .eq('id', id)

      if (gbUpdateErr) throw new Error(`Failed to update application: ${gbUpdateErr.message}`)
    }

    // Log status history if status changed
    if (status && status !== oldStatus) {
      await supabase.from('british_passport_status_history').insert({
        passport_id: id,
        old_status: oldStatus,
        new_status: status,
        notes: notes || null,
        changed_by: userId,
      })

      await tryGenerateReceiptForStatusTrigger({
        serviceType: 'gb_passport',
        serviceRecordId: id,
        status,
        generatedBy: userId || null,
      })
    }

    return apiOk({ updatedPassportId: id })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to update application'), 500)
  }
}
