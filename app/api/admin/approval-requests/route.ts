/**
 * Staff administration approval queue.
 * Maintenance Admin proposes staff changes; organization admins review them.
 */

import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireAdminSession, requireMaintenanceSession } from '@/lib/adminSessionAuth'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'

const proposalFields = {
  target_employee_id: z.string().trim().uuid('Invalid employee ID.'),
  proposed_full_name: z
    .string()
    .trim()
    .min(1, 'Employee name is required.')
    .max(200, 'Employee name is too long.')
    .refine(
      (value) => !/[\u0000-\u001f\u007f]/.test(value),
      'Employee name contains invalid characters.',
    ),
  proposed_role_id: z.string().trim().uuid('Invalid role ID.'),
  proposed_department_ids: z
    .array(z.string().trim().uuid('Invalid department ID.'))
    .min(1, 'At least one department is required.')
    .max(50, 'Too many departments selected.')
    .refine(
      (departmentIds) => new Set(departmentIds).size === departmentIds.length,
      'Duplicate departments are not allowed.',
    ),
  proposed_location_id: z.string().trim().uuid('Invalid location ID.').nullable(),
  proposed_manager_id: z.string().trim().uuid('Invalid manager ID.').nullable(),
}

const createRequestSchema = z
  .object({
    ...proposalFields,
    request_reason: z.string().trim().min(10).max(1000),
  })
  .strict()

const reviewRequestSchema = z
  .object({
    request_id: z.string().trim().uuid('Invalid request ID.'),
    decision: z.enum(['approved', 'rejected']),
    review_reason: z.string().trim().min(3).max(1000),
  })
  .strict()

function normalizeRole(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  const rightIds = new Set(right)
  return left.every((id) => rightIds.has(id))
}

export async function GET(request: Request) {
  const access = await requireMaintenanceSession()
  if (!access.authorized) return access.response

  const limit = await enforceRateLimit(request, {
    scope: 'admin.approval-requests.list',
    limit: 120,
    windowSeconds: 60 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!limit.allowed) return limit.response

  const admin = getServiceSupabaseClient()
  let query = admin
    .from('staff_admin_approval_requests')
    .select(
      'id, target_employee_id, requested_by, proposed_full_name, proposed_role_id, proposed_department_ids, proposed_location_id, proposed_manager_id, request_reason, status, reviewed_by, review_reason, reviewed_at, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(200)

  if (normalizeRole(access.employee.role) === 'maintenance admin') {
    query = query.eq('requested_by', access.employee.id)
  }

  const { data, error } = await query
  if (error) return apiError('Unable to load approval requests.', 503)
  return apiOk({ requests: data || [] })
}

export async function POST(request: Request) {
  const access = await requireMaintenanceSession()
  if (!access.authorized) return access.response
  if (normalizeRole(access.employee.role) !== 'maintenance admin') {
    return apiError('Admin users can apply staff changes directly.', 403)
  }

  const limit = await enforceRateLimit(request, {
    scope: 'admin.approval-requests.create',
    limit: 30,
    windowSeconds: 60 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!limit.allowed) return limit.response

  const { data: input, error: bodyError } = await parseBodyWithSchema(
    request,
    createRequestSchema,
    { maxBytes: 16 * 1024 },
  )
  if (bodyError || !input) return apiError(bodyError || 'Invalid request payload', 400)
  if (input.proposed_manager_id === input.target_employee_id) {
    return apiError('An employee cannot manage themselves.', 400)
  }

  const admin = getServiceSupabaseClient()
  const [
    targetResult,
    membershipResult,
    roleResult,
    departmentResult,
    locationResult,
    managerResult,
  ] = await Promise.all([
    admin
      .from('employees')
      .select('id, full_name, role_id, location_id, manager_id')
      .eq('id', input.target_employee_id)
      .maybeSingle(),
    admin
      .from('employee_departments')
      .select('department_id')
      .eq('employee_id', input.target_employee_id),
    admin.from('roles').select('id').eq('id', input.proposed_role_id).maybeSingle(),
    admin.from('departments').select('id').in('id', input.proposed_department_ids),
    input.proposed_location_id
      ? admin.from('locations').select('id').eq('id', input.proposed_location_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    input.proposed_manager_id
      ? admin.from('employees').select('id').eq('id', input.proposed_manager_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (
    targetResult.error ||
    membershipResult.error ||
    roleResult.error ||
    departmentResult.error ||
    locationResult.error ||
    managerResult.error
  ) {
    return apiError('Unable to validate the proposed staff change.', 503)
  }
  if (!targetResult.data) return apiError('Employee not found.', 404)
  if (!roleResult.data) return apiError('Invalid role ID.', 400)
  if (departmentResult.data?.length !== input.proposed_department_ids.length) {
    return apiError('One or more departments are invalid.', 400)
  }
  if (input.proposed_location_id && !locationResult.data) {
    return apiError('Invalid location ID.', 400)
  }
  if (input.proposed_manager_id && !managerResult.data) {
    return apiError('Invalid manager ID.', 400)
  }

  const currentDepartmentIds = (membershipResult.data || [])
    .map((membership) => membership.department_id)
    .filter((id): id is string => typeof id === 'string')
  const target = targetResult.data
  const hasChange =
    target.full_name !== input.proposed_full_name ||
    target.role_id !== input.proposed_role_id ||
    target.location_id !== input.proposed_location_id ||
    target.manager_id !== input.proposed_manager_id ||
    !sameIds(currentDepartmentIds, input.proposed_department_ids)
  if (!hasChange) return apiError('The proposal does not change the employee record.', 400)

  const { data, error } = await admin
    .from('staff_admin_approval_requests')
    .insert({
      target_employee_id: input.target_employee_id,
      requested_by: access.employee.id,
      expected_full_name: target.full_name,
      expected_role_id: target.role_id,
      expected_department_ids: currentDepartmentIds,
      expected_location_id: target.location_id,
      expected_manager_id: target.manager_id,
      proposed_full_name: input.proposed_full_name,
      proposed_role_id: input.proposed_role_id,
      proposed_department_ids: input.proposed_department_ids,
      proposed_location_id: input.proposed_location_id,
      proposed_manager_id: input.proposed_manager_id,
      request_reason: input.request_reason,
    })
    .select('id, status, created_at')
    .single()

  if (error?.code === '23505') {
    return apiError('You already have a pending request for this employee.', 409)
  }
  if (error || !data) return apiError('Unable to create the approval request.', 500)
  return apiOk(
    { request: data, message: 'Staff change submitted for Admin approval.' },
    { status: 201 },
  )
}

export async function PATCH(request: Request) {
  const access = await requireAdminSession()
  if (!access.authorized) return access.response

  const limit = await enforceRateLimit(request, {
    scope: 'admin.approval-requests.review',
    limit: 60,
    windowSeconds: 60 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!limit.allowed) return limit.response

  const { data: input, error: bodyError } = await parseBodyWithSchema(
    request,
    reviewRequestSchema,
    { maxBytes: 8 * 1024 },
  )
  if (bodyError || !input) return apiError(bodyError || 'Invalid request payload', 400)

  const admin = getServiceSupabaseClient()
  const { data, error } = await admin.rpc('admin_review_staff_approval_20260902', {
    p_actor_employee_id: access.employee.id,
    p_request_id: input.request_id,
    p_decision: input.decision,
    p_review_reason: input.review_reason,
  })

  if (error?.code === '42501') return apiError(error.message, 403)
  if (error?.code === 'P0002') return apiError('Approval request not found.', 404)
  if (error?.code === '22023') return apiError(error.message, 400)
  if (error?.code === '40001') {
    return apiError('The employee changed after submission. Create a fresh request.', 409)
  }
  if (error) return apiError('Unable to review the approval request.', 500)
  return apiOk({ result: data, message: `Request ${input.decision}.` })
}
