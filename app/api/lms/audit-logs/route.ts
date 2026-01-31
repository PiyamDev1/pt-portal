import { NextResponse } from 'next/server'
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
      return NextResponse.json({ error: 'Account ID required' }, { status: 400 })
    }

    const { data: logs, error, count } = await supabase
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
        { count: 'exact' }
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
        email: Array.isArray(log.employees) ? log.employees[0]?.email : log.employees?.email
      }
    }))

    return NextResponse.json({ logs: formattedLogs || [], total: count || 0 })
  } catch (error: any) {
    console.error('[AUDIT LOGS API] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create audit log entry
export async function POST(request: Request) {
  try {
    const { userId, action, entityType, entityId, changes } = await request.json()

    if (!userId || !action || !entityType || !entityId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: log, error } = await supabase
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: action.toUpperCase(),
        entity_type: entityType,
        entity_id: entityId,
        changes: changes || null,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ log })
  } catch (error: any) {
    console.error('[AUDIT LOGS API] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
