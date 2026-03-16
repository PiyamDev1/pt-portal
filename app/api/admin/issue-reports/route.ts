import { NextResponse } from 'next/server'
import { verifyMasterAdminSession } from '@/lib/issueReportAuth'
import { getSupabaseClient } from '@/lib/supabaseClient'

export async function GET(request: Request) {
  const auth = await verifyMasterAdminSession()
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const moduleKey = searchParams.get('module')
  const search = searchParams.get('search')
  const assignedTo = searchParams.get('assignedTo')

  const supabase = getSupabaseClient()
  const issueReportsTable = supabase.from('issue_reports') as any
  const employeesTable = supabase.from('employees') as any
  let query = issueReportsTable
    .select('id, created_at, updated_at, reporter_name, reporter_email, page_url, route_path, module_key, notes, severity, status, has_screenshot, has_console_log, solved_at, assigned_to_user_id')
    .order('created_at', { ascending: false })
    .limit(100)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  if (moduleKey && moduleKey !== 'all') {
    query = query.eq('module_key', moduleKey)
  }

  if (assignedTo && assignedTo !== 'all') {
    if (assignedTo === 'me' && auth.user?.id) {
      query = query.eq('assigned_to_user_id', auth.user.id)
    } else if (assignedTo === 'unassigned') {
      query = query.is('assigned_to_user_id', null)
    } else {
      query = query.eq('assigned_to_user_id', assignedTo)
    }
  }

  if (search) {
    query = query.or(`notes.ilike.%${search}%,page_url.ilike.%${search}%,reporter_name.ilike.%${search}%`)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: assigneesData } = await employeesTable
    .select('id, full_name, is_active')
    .eq('is_active', true)
    .order('full_name')

  const assignees = ((assigneesData || []) as Array<{ id: string; full_name: string | null }>).map((employee) => ({
    id: employee.id,
    name: employee.full_name || 'Unnamed Employee',
  }))

  return NextResponse.json({
    reports: data || [],
    assignees,
    currentAdminId: auth.user?.id || null,
  })
}
