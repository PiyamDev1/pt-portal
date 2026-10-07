/**
 * POST /api/admin/clear-lms
 * Clears LMS entities (customers, loans, transactions, installments) for reset scenarios.
 *
 * @module app/api/admin/clear-lms
 */

import { createClearLmsPostHandler } from '@/lib/lms/clearLmsRoute'

/**
 * Admin endpoint to clear all LMS data
 * WARNING: This deletes all loans, transactions, customers, and installments
 * SECURITY: Requires Google authentication and admin role
 */
const handlePost = createClearLmsPostHandler({
  rateLimitScope: 'admin.clear-lms',
  successPayload: (data) => ({ deleted: data }),
})

export async function POST(request: Request): Promise<Response> {
  return handlePost(request)
}
