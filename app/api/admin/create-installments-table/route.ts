/**
 * POST /api/admin/create-installments-table
 * Creates or verifies the LMS installment table schema in the connected database.
 *
 * @module app/api/admin/create-installments-table
 */

import { createClient } from '@supabase/supabase-js'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'
import { requireLmsMaintenance } from '@/lib/lms/apiAuth'

const REQUIRED_LMS_SCHEMA_VERSION = 20260812

export async function POST() {
  try {
    const access = await requireLmsMaintenance()
    if (!access.authorized) return access.response

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      return apiError('Supabase not configured', 500)
    }

    const supabase = createClient(url, key)

    // Schema creation is migration-owned. This endpoint only verifies the
    // explicit capability/version marker installed by the atomic LMS migration.
    const { data: schemaStatus, error: testError } = await supabase.rpc('lms_schema_status')

    if (
      testError ||
      !schemaStatus ||
      schemaStatus.ready !== true ||
      Number(schemaStatus.version) < REQUIRED_LMS_SCHEMA_VERSION
    ) {
      return apiError('LMS schema is not ready. Apply the latest database migrations.', 503, {
        migration: 'scripts/migrations/20260812_secure_atomic_lms_operations.sql',
        requiredVersion: REQUIRED_LMS_SCHEMA_VERSION,
        currentVersion: schemaStatus?.version ?? null,
      })
    }

    return apiOk({
      tableReady: true,
      tableExists: true,
      schemaVersion: Number(schemaStatus.version),
      capabilities: schemaStatus.details?.capabilities || [],
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to verify installments table'), 500)
  }
}
