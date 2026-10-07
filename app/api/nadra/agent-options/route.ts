/**
 * API Route: NADRA Agent Options
 *
 * GET /api/nadra/agent-options?managerId=<id>
 *
 * Returns the list of employees available as agents for NADRA applications.
 * If managerId is provided, returns only direct reports (recursive via tree
 * traversal). Otherwise returns all active employees who can act as agents.
 *
 * Authentication: Authorized staff session; manager and role scope is enforced per caller.
 * Response Success (200): { canChangeAgent, agentOptions, role }
 * Response Errors: 500 DB error
 */
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'

export const dynamic = 'force-dynamic'

type AgentEmployee = {
  id: string
  full_name: string
  manager_id: string | null
  roles: { name: string | null } | Array<{ name: string | null }> | null
}

const collectReports = (managerId: string, employees: AgentEmployee[]) => {
  const reports: string[] = []
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

export async function GET(_request: Request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const supabase = getServiceSupabaseClient()
    const userId = access.user.id

    const { data: employeeRows, error: employeesError } = await supabase
      .from('employees')
      .select('id, full_name, manager_id, roles ( name )')

    if (employeesError) throw employeesError

    const employees = employeeRows as AgentEmployee[] | null
    const availableEmployees = employees || []
    const currentUser = availableEmployees.find((emp) => emp.id === userId)
    if (!currentUser) {
      return apiError('User not found', 404)
    }

    const roleName = Array.isArray(currentUser.roles)
      ? currentUser.roles[0]?.name
      : currentUser.roles?.name

    const isMasterAdmin = roleName === 'Master Admin'

    const subtreeIds = collectReports(userId, availableEmployees)
    const allowedIds = new Set(
      isMasterAdmin ? availableEmployees.map((employee) => employee.id) : [userId, ...subtreeIds],
    )

    const agentOptions = availableEmployees
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
