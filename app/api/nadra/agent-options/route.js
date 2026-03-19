/**
 * API Route: NADRA Agent Options
 *
 * GET /api/nadra/agent-options?managerId=<id>
 *
 * Returns the list of employees available as agents for NADRA applications.
 * If managerId is provided, returns only direct reports (recursive via tree
 * traversal). Otherwise returns all active employees who can act as agents.
 *
 * Authentication: Service role key
 * Response Success (200): { agents: { id, name }[] }
 * Response Errors: 500 DB error
 */
import { createClient } from '@supabase/supabase-js'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'

export const dynamic = 'force-dynamic'

const createSupabase = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const collectReports = (managerId, employees) => {
  const reports = []
  const stack = [managerId]
  while (stack.length > 0) {
    const current = stack.pop()
    employees.forEach((emp) => {
      if (emp.manager_id === current) {
        reports.push(emp.id)
        stack.push(emp.id)
      }
    })
  }
  return reports
}

export async function GET(request) {
  try {
    const supabase = createSupabase()
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return apiError('Missing userId', 400)
    }

    const { data: employees, error: employeesError } = await supabase
      .from('employees')
      .select('id, full_name, manager_id, roles ( name )')

    if (employeesError) throw employeesError

    const currentUser = employees?.find((emp) => emp.id === userId)
    if (!currentUser) {
      return apiError('User not found', 404)
    }

    const roleName = Array.isArray(currentUser.roles)
      ? currentUser.roles[0]?.name
      : currentUser.roles?.name

    const isMasterAdmin = roleName === 'Master Admin'

    const subtreeIds = collectReports(userId, employees || [])
    const allowedIds = new Set(isMasterAdmin ? employees.map((e) => e.id) : [userId, ...subtreeIds])

    const agentOptions = (employees || [])
      .filter((emp) => allowedIds.has(emp.id))
      .map((emp) => ({ id: emp.id, name: emp.full_name }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const canChangeAgent = isMasterAdmin || subtreeIds.length > 0

    return apiOk({
      canChangeAgent,
      agentOptions,
      role: roleName || null,
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to load agent options'), 500)
  }
}
