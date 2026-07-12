import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { requireSuperAdminSession } from '@/lib/adminSessionAuth'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import {
  importLegacyBookingCustomer,
  listLegacyBookingCustomers,
} from '@/lib/legacyBookingsMigration'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdminSession()
  if (!auth.authorized) return auth.response
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return apiError('Invalid JSON body', 400)
  const dryRun = Boolean(body.dryRun)
  const mode = dryRun ? 'dry_run' : String(body.mode || 'sample')
  if (!['dry_run', 'sample', 'full', 'retry'].includes(mode))
    return apiError('Invalid migration mode', 400)
  const limit = Math.max(
    1,
    Math.min(mode === 'sample' ? 5 : 50, Number(body.limit || (mode === 'sample' ? 5 : 25))),
  )
  const pageToken = typeof body.pageToken === 'string' ? body.pageToken : undefined
  const supabase = getServiceSupabaseClient()

  let customers
  let nextPageToken: string | null = null
  try {
    const result = await listLegacyBookingCustomers({ pageSize: limit, pageToken })
    customers = result.customers
    nextPageToken = result.nextPageToken
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Failed to read legacy customers', 502)
  }

  if (mode === 'retry') {
    const { data: failedMaps } = await supabase
      .from('travel_package_legacy_migration_map')
      .select('legacy_customer_id')
      .in('migration_status', ['failed', 'partial'])
    const failedIds = new Set((failedMaps || []).map((item) => item.legacy_customer_id))
    customers = customers.filter((customer) => failedIds.has(customer.id))
  }

  const { data: runData, error: runError } = await supabase
    .from('travel_package_legacy_migration_runs')
    .insert({
      mode,
      status: 'running',
      source_cursor: pageToken || null,
      source_count: customers.length,
      document_count: customers.reduce((total, customer) => total + customer.documents.length, 0),
      started_by: auth.user.id,
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (runError || !runData) {
    return apiError(runError?.message || 'Failed to create migration run', 500)
  }

  const results: Array<Record<string, unknown>> = []
  let importedCount = 0
  let skippedCount = 0
  let failedCount = 0
  let copiedDocumentCount = 0
  let failedDocumentCount = 0

  for (const customer of customers) {
    try {
      const result = await importLegacyBookingCustomer({
        supabase,
        customer,
        runId: runData.id,
        actorId: auth.user.id,
        dryRun,
      })
      results.push({ customerId: customer.id, reference: customer.referenceNumber, ...result })
      if (result.status === 'skipped') skippedCount += 1
      else importedCount += 1
      copiedDocumentCount += result.copiedDocuments
      failedDocumentCount += result.failedDocuments
    } catch (error) {
      failedCount += 1
      const message = error instanceof Error ? error.message : 'Import failed'
      results.push({
        customerId: customer.id,
        reference: customer.referenceNumber,
        status: 'failed',
        error: message,
      })
      if (!dryRun) {
        await supabase.from('travel_package_legacy_migration_map').upsert(
          {
            migration_run_id: runData.id,
            legacy_customer_id: customer.id,
            legacy_reference_number: customer.referenceNumber || null,
            migration_status: 'failed',
            source_payload: customer.source,
            error_message: message,
          },
          { onConflict: 'legacy_customer_id' },
        )
      }
    }
  }

  const completedAt = new Date().toISOString()
  const status = failedCount > 0 || failedDocumentCount > 0 ? 'completed_with_errors' : 'completed'
  const report = { results, nextPageToken, dryRun }
  await supabase
    .from('travel_package_legacy_migration_runs')
    .update({
      status,
      imported_count: importedCount,
      skipped_count: skippedCount,
      failed_count: failedCount,
      copied_document_count: copiedDocumentCount,
      failed_document_count: failedDocumentCount,
      report,
      completed_at: completedAt,
    })
    .eq('id', runData.id)

  return apiOk({
    run: {
      ...runData,
      status,
      imported_count: importedCount,
      skipped_count: skippedCount,
      failed_count: failedCount,
      copied_document_count: copiedDocumentCount,
      failed_document_count: failedDocumentCount,
      report,
      completed_at: completedAt,
    },
    nextPageToken,
  })
}
