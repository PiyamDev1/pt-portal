/**
 * POST /api/admin/migrate-names-lowercase
 * One-time normalization endpoint to convert selected applicant name fields to lowercase.
 */

import { z } from 'zod'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireAdminSession } from '@/lib/adminSessionAuth'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

const emptyMigrationSchema = z.object({}).strict()

type MigrationError = {
  applicantId: string
  name: string
  error: string
}

/** Lowercase existing applicant names for an authenticated administrator. */
export async function POST(request: Request): Promise<Response> {
  try {
    const access = await requireAdminSession()
    if (!access.authorized) return access.response

    const limit = await enforceRateLimit(request, {
      scope: 'admin.migrate-names-lowercase',
      limit: 3,
      windowSeconds: 60 * 60,
      identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
    })
    if (!limit.allowed) return limit.response

    const { data: body, error: bodyError } = await parseBodyWithSchema(
      request,
      emptyMigrationSchema,
      { maxBytes: 1024 },
    )
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return apiError('Supabase not configured', 500)
    }

    const supabase = getServiceSupabaseClient()
    const { data: applicants, error: fetchError } = await supabase
      .from('applicants')
      .select('id, first_name, last_name')

    if (fetchError) {
      throw new Error(`Failed to fetch applicants: ${fetchError.message}`)
    }

    let updatedCount = 0
    const errors: MigrationError[] = []

    for (const applicant of applicants) {
      const updatedFirstName = applicant.first_name
        ? applicant.first_name.toLowerCase()
        : applicant.first_name
      const updatedLastName = applicant.last_name
        ? applicant.last_name.toLowerCase()
        : applicant.last_name

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
