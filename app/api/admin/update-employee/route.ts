/**
 * POST /api/admin/update-employee
 * Updates routine staff details and, for organization admins, access-bearing
 * role/department assignments through one atomic database function.
 */

import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireMaintenanceSession } from '@/lib/adminSessionAuth'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'

const employeeUpdateSchema = z
  .object({
    employee_id: z.string().trim().uuid('Invalid employee ID.'),
    full_name: z
      .string()
      .trim()
      .min(1, 'Employee name is required.')
      .max(200, 'Employee name is too long.')
      .refine(
        (value) => !/[\u0000-\u001f\u007f]/.test(value),
        'Employee name contains invalid characters.',
      ),
    role_id: z.string().trim().uuid('Invalid role ID.'),
    department_ids: z
      .array(z.string().trim().uuid('Invalid department ID.'))
      .min(1, 'At least one department is required.')
      .max(50, 'Too many departments selected.')
      .refine(
        (departmentIds) => new Set(departmentIds).size === departmentIds.length,
        'Duplicate departments are not allowed.',
      ),
    location_id: z.string().trim().uuid('Invalid location ID.').nullable(),
    manager_id: z.string().trim().uuid('Invalid manager ID.').nullable(),
  })
  .strict()

type RelatedName = { name?: string | null }

type EmployeeRecord = {
  id: string
  role_id: string | null
  manager_id: string | null
  roles?: RelatedName | RelatedName[] | null
}

function relatedName(value: RelatedName | RelatedName[] | null | undefined) {
  return Array.isArray(value) ? value[0]?.name : value?.name
}

function normalizeAccessName(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

function normalizeDepartmentName(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  const rightIds = new Set(right)
  return left.every((id) => rightIds.has(id))
}

export async function POST(request: Request) {
  const access = await requireMaintenanceSession()
  if (!access.authorized) return access.response

  const limit = await enforceRateLimit(request, {
    scope: 'admin.update-employee',
    limit: 60,
    windowSeconds: 60 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!limit.allowed) return limit.response

  const { data: input, error: bodyError } = await parseBodyWithSchema(
    request,
    employeeUpdateSchema,
    { maxBytes: 16 * 1024 },
  )
  if (bodyError || !input) return apiError(bodyError || 'Invalid request payload', 400)
  if (input.manager_id === input.employee_id) {
    return apiError('An employee cannot manage themselves.', 400)
  }

  const admin = getServiceSupabaseClient()
  const { data: target, error: targetError } = await admin
    .from('employees')
    .select('id, role_id, manager_id, roles(name)')
    .eq('id', input.employee_id)
    .maybeSingle<EmployeeRecord>()

  if (targetError) return apiError('Unable to load the employee profile.', 503)
  if (!target) return apiError('Employee not found.', 404)

  const { data: memberships, error: membershipError } = await admin
    .from('employee_departments')
    .select('department_id')
    .eq('employee_id', input.employee_id)
  if (membershipError) return apiError('Unable to load employee departments.', 503)

  const currentDepartmentIds = (memberships || [])
    .map((membership) => membership.department_id)
    .filter((id): id is string => typeof id === 'string')
  const requestedLookupIds = Array.from(new Set([...currentDepartmentIds, ...input.department_ids]))

  const [roleResult, departmentResult, locationResult, managerResult] = await Promise.all([
    admin.from('roles').select('id, name').eq('id', input.role_id).maybeSingle(),
    admin.from('departments').select('id, name').in('id', requestedLookupIds),
    input.location_id
      ? admin.from('locations').select('id').eq('id', input.location_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    input.manager_id
      ? admin.from('employees').select('id').eq('id', input.manager_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (roleResult.error || departmentResult.error || locationResult.error || managerResult.error) {
    return apiError('Unable to validate employee assignments.', 503)
  }
  if (!roleResult.data) return apiError('Invalid role ID.', 400)
  if (input.location_id && !locationResult.data) return apiError('Invalid location ID.', 400)
  if (input.manager_id && !managerResult.data) return apiError('Invalid manager ID.', 400)

  const departmentsById = new Map(
    (departmentResult.data || []).map((department) => [department.id, department.name]),
  )
  if (input.department_ids.some((departmentId) => !departmentsById.has(departmentId))) {
    return apiError('One or more departments are invalid.', 400)
  }

  const actorRole = normalizeAccessName(access.employee.role)
  const currentRole = normalizeAccessName(relatedName(target.roles))
  const requestedRole = normalizeAccessName(roleResult.data.name)
  const isOrganizationAdmin = ['admin', 'master admin', 'super admin'].includes(actorRole)
  const isPrivilegedAdmin = ['master admin', 'super admin'].includes(actorRole)
  const changesDepartments = !sameIds(currentDepartmentIds, input.department_ids)
  const changesManager = target.manager_id !== input.manager_id
  const changesRole = target.role_id !== input.role_id

  if (!isOrganizationAdmin && (changesRole || changesDepartments || changesManager)) {
    return apiError(
      'Maintenance Admin can correct staff names and branches. An Admin must approve access or hierarchy changes.',
      403,
    )
  }

  if (
    !isPrivilegedAdmin &&
    (['master admin', 'super admin'].includes(currentRole) ||
      ['master admin', 'super admin'].includes(requestedRole))
  ) {
    return apiError('Only a Master Admin or Super Admin can change this account or role.', 403)
  }

  if (!isPrivilegedAdmin && changesDepartments) {
    const changedDepartmentIds = new Set([
      ...currentDepartmentIds.filter((id) => !input.department_ids.includes(id)),
      ...input.department_ids.filter((id) => !currentDepartmentIds.includes(id)),
    ])
    const changesHrMembership = [...changedDepartmentIds].some((id) =>
      ['hr', 'humanresource', 'humanresources'].includes(
        normalizeDepartmentName(departmentsById.get(id)),
      ),
    )
    if (changesHrMembership) {
      return apiError('Only a Master Admin or Super Admin can change HR membership.', 403)
    }
  }

  const { error: updateError } = await admin.rpc('admin_update_employee_assignments_20260902', {
    p_employee_id: input.employee_id,
    p_full_name: input.full_name,
    p_role_id: input.role_id,
    p_department_ids: input.department_ids,
    p_location_id: input.location_id,
    p_manager_id: input.manager_id,
  })

  if (updateError) return apiError('Failed to update employee.', 500)

  return apiOk({
    updatedEmployeeId: input.employee_id,
    message: isOrganizationAdmin
      ? 'Employee profile and access updated.'
      : 'Employee profile details updated.',
  })
}
