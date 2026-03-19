/**
 * POST /api/admin/migrate-names-lowercase
 * One-time normalization endpoint to convert selected applicant name fields to lowercase.
 *
 * @module app/api/admin/migrate-names-lowercase
 */

import { createClient } from '@supabase/supabase-js'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'
import { verifyAdminAccess, unauthorizedResponse } from '@/lib/adminAuth'

/**
 * One-time migration endpoint to convert all existing applicant names to lowercase
 * Requires Google authentication and admin role
 */

export async function POST(request) {
  try {
    // Verify admin access via Google auth
    const authResult = await verifyAdminAccess(request)
    if (!authResult.authorized) {
      return unauthorizedResponse(authResult.error, authResult.status)
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      return apiError('Supabase not configured', 500)
    }

    const supabase = createClient(url, key)

    // Fetch all applicants
    const { data: applicants, error: fetchError } = await supabase
      .from('applicants')
      .select('id, first_name, last_name')

    if (fetchError) {
      throw new Error(`Failed to fetch applicants: ${fetchError.message}`)
    }

    let updatedCount = 0
    const errors = []

    // Update each applicant with lowercase names
    for (const applicant of applicants) {
      const updatedFirstName = applicant.first_name
        ? applicant.first_name.toLowerCase()
        : applicant.first_name
      const updatedLastName = applicant.last_name
        ? applicant.last_name.toLowerCase()
        : applicant.last_name

      // Only update if there's a difference
      if (updatedFirstName !== applicant.first_name || updatedLastName !== applicant.last_name) {
        const { error: updateError } = await supabase
          .from('applicants')
          .update({
            first_name: updatedFirstName,
            last_name: updatedLastName,
          })
          .eq('id', applicant.id)

        if (updateError) {
          errors.push({
            applicantId: applicant.id,
            name: `${applicant.first_name} ${applicant.last_name}`,
            error: updateError.message,
          })
        } else {
          updatedCount++
        }
      }
    }

    return apiOk({
      updatedCount,
      totalProcessed: applicants.length,
      errors: errors.length > 0 ? errors : null,
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to migrate applicant names'), 500)
  }
}
