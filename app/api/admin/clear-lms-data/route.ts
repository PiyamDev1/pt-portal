/**
 * POST /api/admin/clear-lms-data
 * Clears LMS tables in FK-safe order for full environment reset.
 *
 * @module app/api/admin/clear-lms-data
 */

import { createClearLmsPostHandler } from '@/lib/lms/clearLmsRoute'

const handlePost = createClearLmsPostHandler({
  rateLimitScope: 'admin.clear-lms-data',
  successPayload: () => {
    const tables = ['loan_installments', 'loan_transactions', 'loans', 'loan_customers']
    return { clearedTables: tables, clearedTableCount: tables.length }
  },
})

export async function POST(request: Request): Promise<Response> {
  return handlePost(request)
}
