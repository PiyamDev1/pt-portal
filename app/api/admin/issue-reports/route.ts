import { z } from 'zod'
import { verifyMasterAdminSession } from '@/lib/issueReportAuth'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { apiError, apiOk } from '@/lib/api/http'

const listQuerySchema = z.object({
  status: z.string().optional(),
  module: z.string().optional(),
  search: z.string().optional(),
  assignedTo: z.string().optional(),
})

export async function GET(request: Request) {
  const auth = await verifyMasterAdminSession()
  if (!auth.authorized) {
    return apiError(auth.error || 'Unauthorized', auth.status)
  }

  const { searchParams } = new URL(request.url)
  const parsedQuery = listQuerySchema.safeParse({
    status: searchParams.get('status') || undefined,
    module: searchParams.get('module') || undefined,
    search: searchParams.get('search') || undefined,
    assignedTo: searchParams.get('assignedTo') || undefined,
  })

  if (!parsedQuery.success) {
    return apiError(parsedQuery.error.issues[0]?.message || 'Invalid query parameters', 400)
  }

  const { status, module: moduleKey, search, assignedTo } = parsedQuery.data

  const supabase = getSupabaseClient()
  const issueReportsTable = supabase.from('issue_reports')
  const employeesTable = supabase.from('employees')
  let query = issueReportsTable
    .select(
      'id, created_at, updated_at, reporter_name, reporter_email, page_url, route_path, module_key, notes, severity, status, has_screenshot, has_console_log, solved_at, assigned_to_user_id',
    )
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
    query = query.or(
      `notes.ilike.%${search}%,page_url.ilike.%${search}%,reporter_name.ilike.%${search}%`,
    )
  }

  const { data, error } = await query
  if (error) {
    return apiError(error.message, 500)
  }

  const { data: assigneesData } = await employeesTable
    .select('id, full_name, is_active')
    .eq('is_active', true)
    .order('full_name')

  const assignees = ((assigneesData || []) as Array<{ id: string; full_name: string | null }>).map(
    (employee) => ({
      id: employee.id,
      name: employee.full_name || 'Unnamed Employee',
    }),
  )

  return apiOk({
    reports: data || [],
    assignees,
    currentAdminId: auth.user?.id || null,
  })
}
