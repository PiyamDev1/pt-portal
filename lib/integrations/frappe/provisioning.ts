import { getSupabaseClient } from '@/lib/supabaseClient'
import { frappeRequest } from '@/lib/integrations/frappe/client'

const FRAPPE_DOMAIN = 'hrms'

type RelatedName = { name?: string | null } | Array<{ name?: string | null }> | null

type EmployeeRow = {
  id: string
  full_name: string | null
  email: string | null
  role_id: string | null
  department_id: string | null
  location_id: string | null
  manager_id: string | null
  is_active: boolean | null
  roles?: RelatedName
  locations?: ({ name?: string | null; branch_code?: string | null } | Array<{ name?: string | null; branch_code?: string | null }>) | null
}

type IdentityMapRow = {
  supabase_employee_id: string
  frappe_employee_id: string | null
  frappe_user_id: string | null
}

type EmployeeDepartmentRow = {
  employee_id: string
  departments?: RelatedName
}

type FrappeListResponse<T> = {
  data?: T[]
}

type FrappeDocResponse<T> = {
  data?: T
}

type FrappeEmployeeRecord = {
  name: string
  employee_name?: string | null
  user_id?: string | null
  company_email?: string | null
  personal_email?: string | null
  status?: string | null
}

type FrappeUserRecord = {
  name: string
  email?: string | null
  enabled?: number | boolean | null
}

export type FrappeProvisioningCandidate = {
  employee_id: string
  full_name: string
  email: string
  role_name: string | null
  department_name: string | null
  location_name: string | null
  manager_id: string | null
  is_active: boolean
  frappe_employee_id: string | null
  frappe_user_id: string | null
  status: 'linked' | 'ready_for_transfer' | 'missing_email'
  missing_fields: string[]
}

export type FrappeProvisioningReferenceOptions = {
  companies: string[]
  departments: string[]
  branches: string[]
  designations: string[]
  employment_types: string[]
  holiday_lists: string[]
}

export type FrappeProvisioningTransferInput = {
  employee_id: string
  company: string
  date_of_joining: string
  gender: string
  date_of_birth: string
  employment_type?: string | null
  holiday_list?: string | null
  department?: string | null
  branch?: string | null
  designation?: string | null
  create_user?: boolean
  send_welcome_email?: boolean
}

export type FrappeProvisioningTransferResult = {
  linked: boolean
  created_employee: boolean
  created_user: boolean
  frappe_employee_id: string
  frappe_user_id: string | null
  candidate: FrappeProvisioningCandidate
}

function firstRelatedName(value: RelatedName | undefined) {
  if (Array.isArray(value)) return value[0]?.name || null
  return value?.name || null
}

function firstLocationName(value: EmployeeRow['locations']) {
  const row = Array.isArray(value) ? value[0] : value
  if (!row) return null
  return row.branch_code ? `${row.name || row.branch_code}` : row.name || null
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const firstName = parts.shift() || fullName.trim()
  const lastName = parts.join(' ')
  return { firstName, lastName }
}

function compactString(value: unknown) {
  const text = String(value || '').trim()
  return text || null
}

function requireValue(value: unknown, label: string) {
  const text = compactString(value)
  if (!text) {
    throw new Error(`${label} is required`)
  }
  return text
}

function normalizeDate(value: unknown, label: string) {
  const text = requireValue(value, label)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${label} must be in YYYY-MM-DD format`)
  }
  return text
}

async function listFrappeNames(doctype: string) {
  try {
    const response = await frappeRequest<FrappeListResponse<{ name: string }>>(
      `/api/resource/${encodeURIComponent(doctype)}`,
      {
        method: 'GET',
        query: {
          fields: JSON.stringify(['name']),
          limit_page_length: 250,
          order_by: 'name asc',
        },
        retries: 0,
      },
    )

    return (response.data || [])
      .map((row) => String(row.name || '').trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

export async function getFrappeProvisioningReferenceOptions(): Promise<FrappeProvisioningReferenceOptions> {
  const [
    companies,
    departments,
    branches,
    designations,
    employmentTypes,
    holidayLists,
  ] = await Promise.all([
    listFrappeNames('Company'),
    listFrappeNames('Department'),
    listFrappeNames('Branch'),
    listFrappeNames('Designation'),
    listFrappeNames('Employment Type'),
    listFrappeNames('Holiday List'),
  ])

  return {
    companies,
    departments,
    branches,
    designations,
    employment_types: employmentTypes,
    holiday_lists: holidayLists,
  }
}

export async function getFrappeProvisioningCandidates() {
  const supabase = getSupabaseClient()

  const { data: employees, error: employeesError } = await supabase
    .from('employees')
    .select('id, full_name, email, role_id, department_id, location_id, manager_id, is_active, roles(name), locations(name, branch_code)')
    .order('full_name', { ascending: true })

  if (employeesError) throw employeesError

  const employeeRows = (employees || []) as EmployeeRow[]
  const employeeIds = employeeRows.map((employee) => employee.id)

  const [identityResult, departmentResult] = await Promise.all([
    employeeIds.length > 0
      ? supabase
        .from('integration_identity_map')
        .select('supabase_employee_id, frappe_employee_id, frappe_user_id')
        .eq('domain', FRAPPE_DOMAIN)
        .in('supabase_employee_id', employeeIds)
      : Promise.resolve({ data: [], error: null }),
    employeeIds.length > 0
      ? supabase
        .from('employee_departments')
        .select('employee_id, departments(name)')
        .in('employee_id', employeeIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (identityResult.error) throw identityResult.error

  const identities = new Map<string, IdentityMapRow>()
  for (const row of (identityResult.data || []) as IdentityMapRow[]) {
    identities.set(row.supabase_employee_id, row)
  }

  const departments = new Map<string, string>()
  if (!departmentResult.error) {
    for (const row of (departmentResult.data || []) as EmployeeDepartmentRow[]) {
      const name = firstRelatedName(row.departments)
      if (name && !departments.has(row.employee_id)) {
        departments.set(row.employee_id, name)
      }
    }
  }

  return employeeRows.map((employee): FrappeProvisioningCandidate => {
    const identity = identities.get(employee.id)
    const fullName = String(employee.full_name || '').trim() || String(employee.email || 'Unnamed employee')
    const email = String(employee.email || '').trim()
    const mapped = Boolean(identity?.frappe_employee_id)
    const missingFields: string[] = []

    if (!email) missingFields.push('email')

    return {
      employee_id: employee.id,
      full_name: fullName,
      email,
      role_name: firstRelatedName(employee.roles),
      department_name: departments.get(employee.id) || null,
      location_name: firstLocationName(employee.locations),
      manager_id: employee.manager_id || null,
      is_active: employee.is_active !== false,
      frappe_employee_id: identity?.frappe_employee_id || null,
      frappe_user_id: identity?.frappe_user_id || null,
      status: mapped ? 'linked' : email ? 'ready_for_transfer' : 'missing_email',
      missing_fields: missingFields,
    }
  })
}

export async function getFrappeProvisioningCandidate(employeeId: string) {
  const candidates = await getFrappeProvisioningCandidates()
  return candidates.find((candidate) => candidate.employee_id === employeeId) || null
}

async function findFrappeEmployeeByEmail(email: string) {
  const fields = JSON.stringify(['name', 'employee_name', 'user_id', 'company_email', 'personal_email', 'status'])
  const filtersToTry = [
    [['company_email', '=', email]],
    [['personal_email', '=', email]],
    [['user_id', '=', email]],
  ]

  for (const filters of filtersToTry) {
    const response = await frappeRequest<FrappeListResponse<FrappeEmployeeRecord>>('/api/resource/Employee', {
      method: 'GET',
      query: {
        fields,
        filters: JSON.stringify(filters),
        limit_page_length: 1,
      },
      retries: 0,
    })

    const match = response.data?.[0]
    if (match?.name) return match
  }

  return null
}

async function findFrappeUserByEmail(email: string) {
  const response = await frappeRequest<FrappeListResponse<FrappeUserRecord>>('/api/resource/User', {
    method: 'GET',
    query: {
      fields: JSON.stringify(['name', 'email', 'enabled']),
      filters: JSON.stringify([['email', '=', email]]),
      limit_page_length: 1,
    },
    retries: 0,
  })

  return response.data?.[0] || null
}

async function createOrFindFrappeUser(candidate: FrappeProvisioningCandidate, sendWelcomeEmail: boolean) {
  const existing = await findFrappeUserByEmail(candidate.email)
  if (existing?.name) {
    return { userId: existing.name, created: false }
  }

  const { firstName, lastName } = splitName(candidate.full_name)
  const response = await frappeRequest<FrappeDocResponse<FrappeUserRecord>>('/api/resource/User', {
    method: 'POST',
    body: {
      email: candidate.email,
      first_name: firstName,
      last_name: lastName || undefined,
      enabled: 1,
      send_welcome_email: sendWelcomeEmail ? 1 : 0,
    },
    retries: 0,
  })

  const userId = response.data?.name || candidate.email
  return { userId, created: true }
}

async function createFrappeEmployee(
  candidate: FrappeProvisioningCandidate,
  input: FrappeProvisioningTransferInput,
  frappeUserId: string | null,
) {
  const { firstName, lastName } = splitName(candidate.full_name)
  const response = await frappeRequest<FrappeDocResponse<FrappeEmployeeRecord>>('/api/resource/Employee', {
    method: 'POST',
    body: {
      first_name: firstName,
      last_name: lastName || undefined,
      employee_name: candidate.full_name,
      company_email: candidate.email,
      personal_email: candidate.email,
      user_id: frappeUserId || undefined,
      company: input.company,
      date_of_joining: input.date_of_joining,
      gender: input.gender,
      date_of_birth: input.date_of_birth,
      status: candidate.is_active ? 'Active' : 'Inactive',
      employment_type: compactString(input.employment_type) || undefined,
      holiday_list: compactString(input.holiday_list) || undefined,
      department: compactString(input.department) || undefined,
      branch: compactString(input.branch) || undefined,
      designation: compactString(input.designation) || undefined,
    },
    retries: 0,
  })

  if (!response.data?.name) {
    throw new Error('Frappe did not return an Employee ID')
  }

  return response.data
}

async function upsertIdentityMap(params: {
  employeeId: string
  frappeEmployeeId: string
  frappeUserId: string | null
}) {
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('integration_identity_map').upsert(
    {
      domain: FRAPPE_DOMAIN,
      supabase_employee_id: params.employeeId,
      frappe_employee_id: params.frappeEmployeeId,
      frappe_user_id: params.frappeUserId,
    },
    { onConflict: 'domain,supabase_employee_id' },
  )

  if (error) throw error
}

function validateTransferInput(input: FrappeProvisioningTransferInput): FrappeProvisioningTransferInput {
  return {
    ...input,
    employee_id: requireValue(input.employee_id, 'Employee'),
    company: requireValue(input.company, 'Company'),
    date_of_joining: normalizeDate(input.date_of_joining, 'Date of joining'),
    gender: requireValue(input.gender, 'Gender'),
    date_of_birth: normalizeDate(input.date_of_birth, 'Date of birth'),
    employment_type: compactString(input.employment_type),
    holiday_list: compactString(input.holiday_list),
    department: compactString(input.department),
    branch: compactString(input.branch),
    designation: compactString(input.designation),
    create_user: input.create_user === true,
    send_welcome_email: input.send_welcome_email === true,
  }
}

export async function transferEmployeeToFrappe(
  rawInput: FrappeProvisioningTransferInput,
): Promise<FrappeProvisioningTransferResult> {
  const input = validateTransferInput(rawInput)
  const candidates = await getFrappeProvisioningCandidates()
  const candidate = candidates.find((item) => item.employee_id === input.employee_id)

  if (!candidate) {
    throw new Error('Employee not found in IMS')
  }

  if (!candidate.email) {
    throw new Error('Employee needs an email before transfer to Frappe')
  }

  if (candidate.frappe_employee_id) {
    return {
      linked: true,
      created_employee: false,
      created_user: false,
      frappe_employee_id: candidate.frappe_employee_id,
      frappe_user_id: candidate.frappe_user_id,
      candidate,
    }
  }

  const existingEmployee = await findFrappeEmployeeByEmail(candidate.email)
  let frappeUserId: string | null = existingEmployee?.user_id || null
  let createdUser = false

  if (!existingEmployee && input.create_user) {
    const userResult = await createOrFindFrappeUser(candidate, input.send_welcome_email === true)
    frappeUserId = userResult.userId
    createdUser = userResult.created
  }

  const employee = existingEmployee || await createFrappeEmployee(candidate, input, frappeUserId)
  frappeUserId = frappeUserId || employee.user_id || null

  await upsertIdentityMap({
    employeeId: candidate.employee_id,
    frappeEmployeeId: employee.name,
    frappeUserId,
  })

  const [updatedCandidate] = (await getFrappeProvisioningCandidates()).filter(
    (item) => item.employee_id === candidate.employee_id,
  )

  return {
    linked: Boolean(existingEmployee),
    created_employee: !existingEmployee,
    created_user: createdUser,
    frappe_employee_id: employee.name,
    frappe_user_id: frappeUserId,
    candidate: updatedCandidate || {
      ...candidate,
      frappe_employee_id: employee.name,
      frappe_user_id: frappeUserId,
      status: 'linked',
    },
  }
}
