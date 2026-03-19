/**
 * API Route: LMS Audit Logs
 *
 * GET  /api/lms/audit-logs?accountId=<id>&limit=50&offset=0
 *   Returns a paginated list of audit log entries for a loan account.
 *   Logs record who made changes and what changed (stored as JSON diff).
 *
 * POST /api/lms/audit-logs
 *   Appends a new audit log entry for an action on a loan entity.
 *   Body: { user_id, action, entity_type, entity_id, changes? }
 *
 * Authentication: Service role key
 * Response Errors: 400 Missing accountId | 500 DB error
 */
import { apiOk, apiError } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

interface AuditLog {
  user_id: string
  action: string
  entity_type: string
  entity_id: string
  changes?: Record<string, any>
}

// GET - Fetch audit logs
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!accountId) {
      return apiError('Account ID required', 400)
    }

    const {
      data: logs,
      error,
      count,
    } = await supabase
      .from('audit_logs')
      .select(
        `
        id,
        user_id,
        action,
        entity_type,
        entity_id,
        changes,
        created_at,
        employees (full_name, email)
      `,
        { count: 'exact' },
      )
      .eq('entity_id', accountId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    const formattedLogs = logs?.map((log: any) => ({
      id: log.id,
      user_id: log.user_id,
      action: log.action,
      entity_type: log.entity_type,
      entity_id: log.entity_id,
      changes: log.changes,
      created_at: log.created_at,
      employee: {
        name: Array.isArray(log.employees) ? log.employees[0]?.full_name : log.employees?.full_name,
        email: Array.isArray(log.employees) ? log.employees[0]?.email : log.employees?.email,
      },
    }))

    return apiOk({ logs: formattedLogs || [], total: count || 0 })
  } catch (error: any) {
    console.error('[AUDIT LOGS API] Error:', error)
    return apiError(toErrorMessage(error, 'Failed to fetch audit logs'), 500)
  }
}

// POST - Create audit log entry
export async function POST(request: Request) {
  try {
    const { userId, action, entityType, entityId, changes } = await request.json()

    if (!userId || !action || !entityType || !entityId) {
      return apiError('Missing required fields', 400)
    }

    const { data: log, error } = await supabase
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: action.toUpperCase(),
        entity_type: entityType,
        entity_id: entityId,
        changes: changes || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    return apiOk({ log })
  } catch (error: any) {
    console.error('[AUDIT LOGS API] Error:', error)
    return apiError(toErrorMessage(error, 'Failed to create audit log'), 500)
  }
}
