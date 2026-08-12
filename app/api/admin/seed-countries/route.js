/**
 * POST /api/admin/seed-countries
 * Seeds visa destination countries used by visa metadata and forms.
 *
 * @module app/api/admin/seed-countries
 */

import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { requireAdminSession } from '@/lib/adminSessionAuth'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

// Mapped from your countries.json structure
const COUNTRIES_DATA = [
  { name: 'Afghanistan', code: 'AF' },
  { name: 'Albania', code: 'AL' },
  { name: 'Algeria', code: 'DZ' },
  { name: 'United Kingdom', code: 'GB' },
  { name: 'United States', code: 'US' },
  { name: 'Saudi Arabia', code: 'SA' },
  { name: 'United Arab Emirates', code: 'AE' },
  { name: 'Turkey', code: 'TR' },
  { name: 'Pakistan', code: 'PK' },
  { name: 'India', code: 'IN' },
  { name: 'Canada', code: 'CA' },
  { name: 'Australia', code: 'AU' },
  { name: 'China', code: 'CN' },
  { name: 'France', code: 'FR' },
  { name: 'Germany', code: 'DE' },
  { name: 'Italy', code: 'IT' },
  { name: 'Spain', code: 'ES' },
  { name: 'Malaysia', code: 'MY' },
  { name: 'Thailand', code: 'TH' },
  { name: 'Singapore', code: 'SG' },
  { name: 'Indonesia', code: 'ID' },
  { name: 'Iran', code: 'IR' },
  { name: 'Iraq', code: 'IQ' },
  { name: 'Egypt', code: 'EG' },
  { name: 'Morocco', code: 'MA' },
  { name: 'South Africa', code: 'ZA' },
  { name: 'Japan', code: 'JP' },
  { name: 'Russia', code: 'RU' },
  { name: 'Sri Lanka', code: 'LK' },
  { name: 'Qatar', code: 'QA' },
  { name: 'Kuwait', code: 'KW' },
  { name: 'Oman', code: 'OM' },
  { name: 'Bahrain', code: 'BH' },
  // Add more if needed or parse the full JSON in a loop
]

const emptySeedSchema = z.object({}).strict()

export async function POST(request) {
  try {
    const access = await requireAdminSession()
    if (!access.authorized) return access.response

    const limit = await enforceRateLimit(request, {
      scope: 'admin.seed-countries',
      limit: 5,
      windowSeconds: 60 * 60,
      identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
    })
    if (!limit.allowed) return limit.response

    const { data: body, error: bodyError } = await parseBodyWithSchema(request, emptySeedSchema, {
      maxBytes: 1024,
    })
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      return apiError('Supabase not configured', 500)
    }

    const supabase = createClient(url, key)

    let inserted = 0

    for (const c of COUNTRIES_DATA) {
      const { error } = await supabase
        .from('visa_countries')
        .upsert({ name: c.name, code: c.code }, { onConflict: 'name' })

      if (!error) inserted++
    }

    return apiOk({ seededCountryCount: inserted })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to seed countries'), 500)
  }
}

// Keep GET for health checks
export async function GET() {
  return apiOk({
    route: 'seed-countries',
    note: 'Use POST with proper authentication',
  })
}
